# [Feature] Aufstell-Block / Mehrzug-Schattenbahnhof (Staging Block mit FIFO-Queue)

**Typ:** Core Automation & Layout Optimization  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/engine/BlockManager.ts`, `server/src/engine/BBTEngine.ts`, `server/src/types.ts`, `client/src/components/TrackCanvas.ts`  
**Labels:** `enhancement`, `automation`, `staging-yard`, `shadow-station`

---

## 1. Problemstellung & Motivation

Auf fast jeder Modellbahnanlage ist Platz im verdeckten Bereich (Schattenbahnhof) der limitierende Faktor:
* Oft existieren **sehr lange Gleise (z. B. 250 cm bis 400 cm)**.
* In TrainMaster kann derzeit **in jedem Block nur genau 1 Zug** stehen.
* Ein 80 cm langer Schienenbus blockiert somit ein 300 cm langes Schattenbahnhofsgleis komplett – wertvoller Stauraum für 2 bis 3 weitere Züge wird verschenkt.

---

## 2. Konzept: Der Aufstell-Block (Staging Block)

Ein Aufstell-Block verhält sich wie ein Fließband / Parkplatz mit mehreren Abschnitten (**Section Queue**):

```text
Einfahrt ─────────────────────────────────────────────────────────────➔ Ausfahrt
[ Abschnitt 3 (Frei) ] ➔ [ Abschnitt 2 (Zug B: BR 218) ] ➔ [ Abschnitt 1 (Zug A: ICE 3) ] ──🚦
```

### Automatisches Aufrücken (FIFO - First In, First Out):
1. **Einfahrt:** Der erste Zug (Zug A) fährt bis ganz nach vorne an das Ausfahrsignal (Abschnitt 1) und hält per BBT.
2. **Folgezug:** Fährt ein zweiter Zug (Zug B) ein, erkennt das System, dass Abschnitt 1 belegt ist. Zug B hält automatisch im dahinterliegenden Abschnitt 2 (Sicherheitsabstand zur vorderen Lok).
3. **Ausfahrt & Nachrücken:**
   - Erhält Zug A Ausfahrt und verlässt den Block, schaltet Abschnitt 1 auf *Frei*.
   - Zug B rückt automatisch mit Rangiergeschwindigkeit (`V_Min`) auf Abschnitt 1 auf.
   - Abschnitt 2 wird frei für den nächsten einfahrenden Zug.

---

## 3. Sensor-Optionen für den Aufstell-Block

Es werden zwei praxiserprobte Sensor-Konzepte unterstützt:

1. **Mehrere physikalische Rückmelder (z. B. 3 Stromfühler):**
   - Jeder Abschnitt hat seinen eigenen Trennabschnitt mit Melder.
2. **Ein langer Melder mit dynamischer Längenrechnung (Virtual Sections):**
   - Das Gleis hat nur 1 oder 2 Melder.
   - Anhand der gemessenen / hinterlegten Zuglängen (`lengthCm`) und BBT-Zeitstempel berechnet TrainMaster die Stopp-Position für den Folgezug rein rechnerisch.

---

## 4. Datenmodell-Spezifikation (`types.ts`)

```typescript
export interface StagingSection {
  index: number;                  // 1 (vorne am Signal), 2, 3...
  lengthCm: number;               // Länge dieses Abschnitts
  occupiedByLocoId: string | null;// Lokomotive in diesem Abschnitt
  sensorId?: string;              // Optionaler physikalischer Sensor
}

export interface StagingBlock extends Block {
  isStagingBlock: true;
  maxTrains: number;              // Maximale Anzahl Züge (z. B. 3)
  sections: StagingSection[];     // Geordnete Abschnitte
  autoAdvance: boolean;           // Automatisches Aufrücken bei Ausfahrt
}
```

---

## 5. UI-Darstellung im Gleisbild

* Der Aufstell-Block wird im Stellwerk mit **mehreren Lok-Badges hintereinander** visualisiert:
  `[ 1: ICE 3 | 120cm ] ➔ [ 2: BR 218 | 90cm ] ➔ [ 3: FREI ]`
* Farbliche Belegungsanzeige pro Abschnitt (Grün = Frei, Rot = Belegt, Gelb = Reserviert).

---

## 6. Akzeptanzkriterien

- [ ] Aufstell-Blöcke können mit 2 bis 5 Abschnitten konfiguriert werden.
- [ ] Mehrere Züge können hintereinander im selben Gleis halten, ohne aufzufahren.
- [ ] Wenn der vordere Zug ausfährt, rückt der hintere Zug sanft bis zum Haltesignal auf.
- [ ] Züge, die länger als der verbleibende Platz im Gleis sind, werden abgewiesen und erhalten keine Einfahrstraße.
