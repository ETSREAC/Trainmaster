# [Feature] Erweitertes Funktions-Datenmodell: Icons, Taster- vs. Schalter-Verhalten & Fahrregler-Integration

**Typ:** Core Architecture & Throttle Enhancement  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/types.ts`, `client/src/types.ts`, `client/src/components/Throttle.ts`, `hardware/crowpanel_esp32_rotary`  
**Labels:** `architecture`, `throttle`, `hardware`, `dcc`

---

## 1. Problemstellung & Motivation

Aktuell speichert TrainMaster Lok-Funktionen primär als einfaches Boolean-Dictionary (`functions: Record<number, boolean>`) und optionale Textbeschreibungen (`functionLabels?: Record<number, string>`).

In der realen Modellbahn-Praxis gibt es jedoch zwei grundverschiedene Funktionstypen:

1. **Dauerschalter (Latching):**
   - Z. B. Licht (`F0`), Fahrsound (`F1`), Rangiergang (`F4`), Innenbeleuchtung (`F5`).
   - Einmal tippen = **EIN**, nochmals tippen = **AUS**.
2. **Momentantaster (Momentary):**
   - Z. B. Lokpfeife / Signalhorn (`F2`, `F3`), Kupplungswalze (`F8`), Schaffnerpfiff (`F7`).
   - Taste gedrückt halten = **EIN**, Taste loslassen = **sofort AUS**.
   - Bislang schaltete ein Druck auf F2 das Horn dauerhaft ein – der Modellbahner musste hektisch ein zweites Mal klicken, um das Horn wieder abzustellen!

Zusätzlich fehlen den Funktionstasten im Fahrregler (Throttle) bislang **prägnante Icons** (stattdessen steht dort nur Text oder die Nummer `F2`).

---

## 2. Zielsetzung

1. **Erweiterung des Datenmodells (`types.ts`):**  
   Jede Lokfunktion erhält Metadaten für Label, Icon-Kategorie und Schaltmodus.
2. **Echte Taster-Physik im Web-Throttle:**  
   Unterstützung für `mousedown`/`mouseup` und Touch-Events (`touchstart`/`touchend`): Das Horn ertönt exakt so lange, wie der Finger auf dem Button liegt.
3. **Synchronisation mit Hardware-Reglern:**  
   Auch der Elecrow CrowPanel ESP32 Rotary Handregler und das Stream Deck Stellpult können die Metadaten nutzen, um Horn und Pfiff als Taster zu behandeln.

---

## 3. Datenmodell-Spezifikation (`types.ts`)

### Neues Interface `LocoFunctionConfig`:

```typescript
export type FunctionIconType = 
  | 'light'       // 💡 Spitzenlicht / Scheinwerfer
  | 'light_high'  // 🔦 Fernlicht
  | 'cab_light'   // 🛋️ Führerstandsbeleuchtung
  | 'sound'       // 🔊 Fahrgeräusch / Diesel / Dampf
  | 'horn'        // 🎺 Pfeife / Signalhorn / Makrofon
  | 'bell'        // 🔔 Glocke / Läutewerk
  | 'coupler'     // 🪝 Digitale Kupplung (Telex)
  | 'shunter'     // 🐢 Rangiergang / ABV
  | 'pantograph'  // ⚡ Stromabnehmer auf/ab
  | 'smoke'       // 💨 Dampfentwickler
  | 'announcement'// 📢 Ansage / Schaffnerpfiff
  | 'mute'        // 🔇 Stummschaltung
  | 'custom';     // ⚙️ Benutzerdefiniert

export interface LocoFunctionDef {
  index: number;              // 0 bis 28
  label: string;              // z. B. "Signalhorn tief"
  icon: FunctionIconType;     // Icon-Typ für Rendering
  isMomentary: boolean;       // true = Taster (Hold-to-play), false = Schalter (Toggle)
}
```

### Anpassung im `Locomotive`-Interface:

```typescript
export interface Locomotive {
  id: string;
  name: string;
  dccAddress: number;
  speed: number;
  targetSpeed: number;
  direction: Direction;
  functions: Record<number, boolean>;
  
  // ERWEITERUNG:
  functionConfig?: Record<number, LocoFunctionDef>; // Detaillierte F-Tasten-Konfig
  functionLabels?: Record<number, string>;          // Abwärtskompatibilität
  
  vMin: number;
  vMid: number;
  vMax: number;
  lengthCm: number;
  trainType: 'PASSENGER' | 'FREIGHT' | 'COMMUTER' | 'HIGH_SPEED' | 'SHUNTER';
  currentBlockId: string | null;
  image?: string;
}
```

---

## 4. UI-Implementierung im Web-Fahrregler (`Throttle.ts`)

Im Fahrregler wird für jeden Button geprüft, ob `isMomentary === true`:

```typescript
if (fnDef.isMomentary) {
  // Momentantaster (Horn, Pfeife, Entkuppeln)
  btn.classList.add('fn-momentary');
  
  const press = () => wsClient.setLocoFunction(loco.address, fnIdx, true);
  const release = () => wsClient.setLocoFunction(loco.address, fnIdx, false);

  btn.addEventListener('mousedown', press);
  window.addEventListener('mouseup', release);
  
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); press(); });
  btn.addEventListener('touchend', (e) => { e.preventDefault(); release(); });
} else {
  // Wechselschalter (Licht, Sound, Rangiergang)
  btn.addEventListener('click', () => {
    const nextState = !loco.functions[fnIdx];
    wsClient.setLocoFunction(loco.address, fnIdx, nextState);
  });
}
```

---

## 5. Abwärtskompatibilität

- Existierende `layout.json`-Dateien, die nur `functionLabels` enthalten, bleiben zu 100% kompatibel.
- Wenn `functionConfig` nicht vorhanden ist, greift ein Default-Fallback (F0, F1 = Schalter, F2 = Taster-Heuristik).

---

## 6. Akzeptanzkriterien

- [ ] `Locomotive`-Interface in `server/src/types.ts` und `client/src/types.ts` ist erweitert.
- [ ] Fahrregler rendert für F0–F28 die passenden SVG-Icons neben dem Namen.
- [ ] Momentanfunktionen (Horn, Kupplung) schalten automatisch ab, sobald die Maustaste bzw. der Touch losgelassen wird.
- [ ] Beim Speichern im Lok-Editor bleibt die `functionConfig` dauerhaft in `layout.json` erhalten.
