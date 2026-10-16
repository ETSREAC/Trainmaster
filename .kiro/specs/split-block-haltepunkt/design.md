# Design: 50/50-Gleisaufteilung

## Überblick

Der Punktmelder-Pfad bleibt unverändert. Der 50/50-Modus wird über eine neue, eigenständige Engine `SplitBlockEngine` umgesetzt. `BlockManager` meldet nur, *dass* in einem SPLIT-Block der zweite Melder ausgelöst hat. Entscheidung, Messung und Halteplanung liegen in der neuen Engine und sind ohne Hardware und mit injizierbarer Uhr testbar.

```
Sensor ──► BlockManager.handleSensorTrigger
              │ role=enter ──► onEnterTriggered ──► index.ts
              │                    ├─ SplitBlockEngine.onFirstSensor()  (Messstart, Strategie)
              │                    └─ BBTEngine.startBraking()          (nur POINT oder Strategie CENTER)
              │ role=in, SPLIT ──► onSplitSecondSensor ──► SplitBlockEngine.onSecondSensor()
              │                                              └─ Plan: Rampe → Kriechen → virtueller IN
              │ role=in, POINT ──► onInTriggered (wie bisher)
SplitBlockEngine.onVirtualIn ──► BlockManager.triggerVirtualIn() ──► gleicher IN-Pfad
```

## Datenmodell (`types.ts`, Server + Client)

```ts
export type BlockStopMode = 'POINT' | 'SPLIT';
export type BlockStopPolicy = 'AUTO_BY_LENGTH' | 'PLATFORM_CENTER' | 'SIGNAL';

interface Block {
  stopMode?: BlockStopMode;        // Standard 'POINT'
  stopPolicy?: BlockStopPolicy;    // Standard 'AUTO_BY_LENGTH'
  trackSplitRatio?: number;        // Standard 0.5, Bereich 0.2–0.8
  centerStopMarginCm?: number;     // Standard 10, Zugmitte hinter Teilungsmarke
  signalStopMarginCm?: number;     // Standard 8, Abstand Zugspitze zum Blockende
}
```

Rückwärtskompatibel: alle Felder optional, keine Migration nötig. Die bestehenden Felder `sensorsPlus/sensorsMinus.enter/in` werden wiederverwendet (A = enter, B = in je Richtung). Das entspricht exakt dem, was die automatische Blockzuordnung bei zwei Meldern bereits erzeugt.

## Geschwindigkeitsmodell

Annahme: Geschwindigkeit ist proportional zur Fahrstufe (`v = k · s`). Das ist bei eingemessenen Decodern (vMin/vMid/vMax) eine brauchbare Näherung.

- Ab Melder A integriert die Engine die *gesendeten* Fahrstufen über die Zeit: `S = ∫ s(t) dt` (Einheit Fahrstufe·ms). Gespeist wird sie von `onSpeedChanged`.
- Bei Melder B ist die zurückgelegte Strecke bekannt: `d = lengthCm × ratio`. Daraus folgt `k = d / S` (cm pro Fahrstufe·ms).
- Das ersetzt die Heuristik `Δt · k_brems` aus dem Ticket und funktioniert auch, wenn in der ersten Hälfte schon gebremst wurde (Strategie Mitte).

## Halteplan (reine Funktion `planStop`)

Eingabe: aktuelle Fahrstufe `s0`, `vMin`, `k`, Reststrecke `D`, Rampenstufen `n` und Intervall `t` aus dem BBT-Profil (Fallback n = 10, t = 80 ms).

1. Rampe: Fahrstufen `s_i = round(s0 − i·(s0−vMin)/n)` für i = 1..n, jede `t` ms lang. Gefahren wird während Intervall i mit `s_{i−1}`.
   Rampenstrecke `dR = k · t · Σ_{i=0}^{n−1} s_i`.
2. Falls `dR > 0,85·D`: Intervall auf `t' = 0,85·D / (k·Σ)` verkürzen (min. 20 ms).
3. Kriechen: `creepMs = max(0, (D − dR) / (k · vMin))`.
4. Falls `s0 ≤ vMin`: keine Rampe, nur Kriechen bei `s0`.

Reststrecke:
- Mitte: `D = lengthCm_loco / 2 + centerStopMarginCm`
- Signal: `D = lengthCm_block × (1 − ratio) − signalStopMarginCm` (min. 0)

Ergebnis: `{ steps: number[], intervalMs, creepMs, totalMs, targetFrontCm }`.

## SplitBlockEngine

```ts
class SplitBlockEngine {
  constructor(events: { onSpeedStep, onVirtualIn(locoId, blockId), onLog, now?: () => number,
                        setTimer?, clearTimer? })
  static getConfig(block): EffectiveSplitConfig | null   // validiert & begrenzt, null = POINT/ungültig
  resolvePolicy(block, loco, cfg): 'CENTER' | 'SIGNAL'
  onFirstSensor(block, loco, direction): 'CENTER' | 'SIGNAL' | null   // null => POINT-Verhalten
  onSecondSensor(block, loco, direction, bbtEntry?): boolean          // false => sofort IN (Fallback)
  notifySpeed(locoId, speed): void                                     // Integrator
  isRunning(locoId): boolean
  cancel(locoId): void
  cancelAll(): void
}
```

- Zustand pro Lok: `{ blockId, direction, policy, startTs, integral, lastSpeed, lastTs, phase: 'MEASURING' | 'STOPPING' }`.
- Uhr und Timer sind injizierbar, damit Tests deterministisch laufen.
- Jeder Planschritt prüft ein Token (wie CR-02), damit abgebrochene Pläne nichts mehr senden.

## Integration

`BlockManager`:
- Neues optionales Event `onSplitSecondSensor?(block, loco): boolean`. Rückgabe `true` = übernommen, Block wird nur als OCCUPIED markiert. `false` = normaler IN.
- Neue Methode `triggerVirtualIn(blockId, locoId)`: führt den IN-Zweig aus (extrahiert in `applyIn`).
- Erneute Auslösungen (Prellen, Achsen, doppelte Meldungen) filtert die `SplitBlockEngine` selbst: `onFirstSensor` liefert `duplicate: true`, `onSecondSensor` ignoriert Melder B während eines laufenden Plans oder bei stehender Lok.
- Zusätzlich startet `BBTEngine.startBraking` bei stehender Lok keine Rampe mehr (sonst würde ein prellender ENTER-Belegtmelder unter dem Zugende die Lok ab `entry.vStart` wieder anfahren).

`index.ts`:
- `onEnterTriggered`: `split.onFirstSensor()` aufrufen. Bei `'SIGNAL'` keine BBT-Rampe, sonst wie bisher.
- `onSplitSecondSensor`: `bbtEngine.handleInEvent(..., { stop: false })` (Lernen ohne Stopp), dann `split.onSecondSensor()`.
- `onSpeedChanged`: `split.notifySpeed()`.
- Not-Halt, `DELETE_LOCO`: `split.cancelAll()` bzw. `split.cancel()`.

`BBTEngine.handleInEvent(loco, block, dir, opts?: { stop?: boolean })`: bei `stop: false` wird nur gelernt, keine Fahrstufe gesetzt. Standard bleibt `true`.

## Client

Block-Modal: Checkbox „50/50-Gleisaufteilung (zwei Belegtmelder)“. Darunter, nur bei Häkchen sichtbar: Haltestrategie (Select), Teilung in %, Marge Mitte (cm), Marge Signal (cm) und ein Hinweis, dass ENTER = Melder A und IN = Melder B gilt. DE/EN-Texte in `i18n.ts`.

## Fehlerbehandlung

| Situation | Verhalten |
|---|---|
| SPLIT ohne zwei verschiedene Melder / ohne Länge | POINT-Verhalten + Warnung |
| Melder B ohne vorherigen Melder A | sofortiger Halt an B + Warnung |
| Zug länger als Halteposition | Plan läuft, Warnung „Zug passt nicht vollständig“ |
| Not-Halt | Plan abgebrochen, kein virtueller IN |

## Teststrategie

`node:test` (eingebaut, keine neue Abhängigkeit) gegen die gebauten Module in `server/dist`, wie das bestehende `scripts/test_security_fixes.mjs`. Datei `scripts/test_split_block.mjs`, Skript `npm run test:split`, Teil von `npm test`. Uhr und `setTimeout` werden über `mock.timers` simuliert.

Grenze des Modells: Die Simulation nimmt Geschwindigkeit ∝ Fahrstufe ohne Decoder-Trägheit (CV3/CV4) an. Starke Decoder-Bremsverzögerung verschiebt den realen Haltepunkt nach hinten; Abhilfe über die Margen im Block-Editor oder CV4 klein halten.

- `planStop`: Kurzzug und Langzug gegen die Akzeptanzbereiche (Position durch Integration des Plans nachgerechnet).
- `SplitBlockEngine` mit simulierter Uhr: Messung, Strategieauflösung, virtueller IN, Not-Halt-Abbruch, Prellschutz, Fallbacks.
- `BlockManager`: POINT unverändert, SPLIT-Zweig, beide Richtungen, `triggerVirtualIn`.
- End-to-end mit simulierter Physik: Fahrstufen → Position → Melder A/B lösen positionsgenau aus → Endposition prüfen.
