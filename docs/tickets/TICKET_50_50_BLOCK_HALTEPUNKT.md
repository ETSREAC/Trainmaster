# [Feature] 50/50-Gleisaufteilung: Dynamischer Haltepunkt nach Zuglänge (Bahnsteigmitte vs. Signalhalt)

**Typ:** Feature / Automation Enhancement  
**Status:** Open / Geplant  
**Komponenten:** `server/src/engine/BlockManager.ts`, `server/src/engine/BBTEngine.ts`, `server/src/types.ts`, `client` (Block-Editor)  
**Labels:** `enhancement`, `automation`, `bbt`, `signals-sensors`

---

## 1. Problembeschreibung & Motivation

Auf der Modellbahnanlage soll jedes Bahnhofsgleis im Automatikbetrieb mit genau **zwei Belegtmeldern** (Stromfühlern) überwacht werden, die das Gleis symmetrisch im Verhältnis **50% / 50%** teilen:
- **Melder A:** 0% bis 50% der Gleislänge
- **Melder B:** 50% bis 100% der Gleislänge (am Ende steht das Signal 🚦)

### Das Dilemma bei unterschiedlichen Zuglängen:
1. **Kurze Züge / Einzelloks (z. B. Schienenbus, Rangierlok, $\le 50\%$ Blocklänge):**
   - Wenn der Zug bis zum Ausfahrsignal vorfährt, steht er weit hinter dem Bahnsteigdach im Gleisvorfeld.
   - Er soll vorbildgerecht in der **Bahnsteigmitte (H-Tafel)** halten.
2. **Lange Züge (z. B. IC, Güterzug, $> 50\%$ Blocklänge):**
   - Sobald die Lok bei der 50%-Kante in Melder B einfährt, meldet dieser `BELEGT`.
   - Würde Melder B als sofortiges `IN`-Event (Stopp) interpretiert, bleibt der Zug mitten im Gleis stehen und das Zugende blockiert die Einfahrweichenstraße.
   - Der lange Zug muss bis kurz vor das Signal ($90\dots95\%$ der Gleislänge) vorziehen.

---

## 2. Lösungsansatz: Das 50/50-Zwei-Phasen-Konzept

Da Melder B exakt an der 50%-Marke liegt, dient er als physikalischer Präzisions-Referenzpunkt:

```text
Fahrtrichtung (+):
0 cm                                    100 cm (50%-Kante)                         200 cm
 │                                          │                                         │
 [========= Melder A (50%) ================]│[========= Melder B (50%) ===============] ───🚦
```

### Rollenverteilung der Sensoren je nach Zuglänge:

| Zugkategorie | Kriterium | Rolle Melder A (0–50%) | Rolle Melder B (50–100%) | Endposition |
| :--- | :--- | :--- | :--- | :--- |
| **Kurzzug** | `Zuglänge <= 50% Blocklänge` | **ENTER:** Lok fährt mit Reisegeschwindigkeit ein. | **IN (Ziel erreicht):** Sanfter Sanftstopp / Kriechrampe in $1\text{–}2\,\text{s}$. | **Bahnsteigmitte** (ca. 50–55%) |
| **Langzug** | `Zuglänge > 50% Blocklänge` | **APPROACH:** Einfahrt & ggf. leichtes Vorbremsen. | **BRAKE (BBT-Start):** Löst die eigentliche BBT-Bremsrampe für die 2. Hälfte aus. | **Signalhalt** (ca. 95% vor Signal) |

---

## 3. On-The-Fly Geschwindigkeitsmessung (Kein manuelles Einmessen nötig!)

Da beide Abschnitte bekannt und gleich lang sind (z. B. je $100\,\text{cm}$):
1. Zeitstempel bei Auslösung Melder A: $t_1$
2. Zeitstempel bei Auslösung Melder B: $t_2$
3. Fahrzeit für die 1. Hälfte: $\Delta t = t_2 - t_1$
4. **Ergebnis:** TrainMaster kennt für diese spezifische Lok exakt die Fahrzeit für $100\,\text{cm}$ und berechnet die virtuelle Zielzeit für das Signalhalt-Event:
   $$t_{\text{Stopp am Signal}} = t_2 + (\Delta t \cdot k_{\text{brems}})$$
   *(wobei $k_{\text{brems}} \approx 1{,}2 \dots 1{,}5$ die Verzögerung durch das Abbremsen berücksichtigt)*.

---

## 4. Geplante Datenmodell-Änderungen (`types.ts`)

```typescript
export type BlockStopPolicy = 
  | 'AUTO_BY_LENGTH' // Kurzzug -> Mitte, Langzug -> Signal (Standard)
  | 'PLATFORM_CENTER' // Immer Bahnsteigmitte
  | 'SIGNAL';         // Immer am Signal vorfahren

export interface Block {
  // ... bestehende Felder ...
  trackSplitRatio?: number;      // Standard: 0.5 (50/50 Symmetrie)
  stopPolicy?: BlockStopPolicy;  // Standard: 'AUTO_BY_LENGTH'
  centerStopMarginCm?: number;   // Ziel-Auslauf nach Melder B (Standard: 10 cm)
}
```

---

## 5. Implementierungs-Schritte

- [ ] **Data Model:** `types.ts` um `stopPolicy`, `trackSplitRatio` und `centerStopMarginCm` erweitern.
- [ ] **BlockManager:** In `handleSensorTrigger` bei Auslösung des zweiten Sensors prüfen:
  - Ist `loco.lengthCm <= block.lengthCm * splitRatio`?
    - $\rightarrow$ Triggere `IN` mit kurzem Kriechauslauf (Halt in Mitte).
  - Ist `loco.lengthCm > block.lengthCm * splitRatio`?
    - $\rightarrow$ Triggere `BRAKE` (BBT-Rampe bis Signalhalt via berechnetem Virtual-IN-Timer).
- [ ] **BBTEngine:** Unterstützung für zeitgesteuerte Zielankunft (`Virtual IN`) für die 2. Hälfte von 50/50-Blöcken.
- [ ] **UI / Block-Settings:** Einstellungs-Dropdown im Block-Editor für `Haltestrategie` (`Automatisch nach Zuglänge`, `Immer Signal`, `Immer Mitte`).
- [ ] **Zweirichtungs-Symmetrie:** Verifikation, dass das Verhalten in `-`-Richtung (Melder B = ENTER, Melder A = IN/BRAKE) spiegelbildlich identisch greift.

---

## 6. Akzeptanzkriterien

1. **Kurzzug:** Schienenbus (z. B. $25\,\text{cm}$) stoppt bei einem $200\,\text{cm}$-Block mit seiner Zugmitte im Bereich $100\dots115\,\text{cm}$.
2. **Langzug:** 5-Wagen-Zug (z. B. $160\,\text{cm}$) stoppt erst bei $190\dots195\,\text{cm}$ kurz vor dem Signal; die Einfahrweiche ist frei gemeldet.
3. **Zweirichtungsbetrieb:** Fährt derselbe Zug von der Gegenseite ein, gelten die Rollen spiegelverkehrt.
