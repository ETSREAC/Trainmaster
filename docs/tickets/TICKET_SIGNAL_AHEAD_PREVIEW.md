# [Feature] Signal-Vorschau & Vorsignal-Logik (Signals Ahead / Block n+1)

**Typ:** Core Signaling & Interlocking Enhancement  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/engine/RouteEngine.ts`, `server/src/engine/SignalManager.ts`, `client/src/components/SignalMonitor.ts`, `client/src/components/TrackCanvas.ts`  
**Labels:** `signaling`, `interlocking`, `automation`, `db-signals`

---

## 1. Problemstellung & Motivation

Aktuell schaltet TrainMaster Signale rein lokal basierend auf der **aktuellen Fahrstraße**:
* Weiche liegt geradeaus ➔ Hauptsignal zeigt `Hp1` (Fahrt).
* Weiche liegt auf Abzweig ➔ Hauptsignal zeigt `Hp2` (Langsamfahrt).
* Weichenstraße nicht gestellt / Block belegt ➔ Hauptsignal zeigt `Hp0` (Halt).

### Das Vorbild-Problem:
In der Realität und in Rocrail gibt es an fast jedem Hauptsignal ein **Vorsignal** (oder ein kombiniertes Ks-Signal / Mehrabschnittssignal):
* Wenn Block A frei ist, aber der **Folgeblock B auf Halt (`Hp0`)** steht, darf das Vorsignal an Block A nicht `Fahrt erwarten (Vr1)` signalisieren, sondern muss zwingend **`Halt erwarten (Vr0)`** ankündigen!
* Fehlt diese Vorschau, fährt der Zug mit voller Geschwindigkeit auf das rote Signal in Block B zu und muss eine abrupte Notbremsung hinlegen, statt vorbildgetreu vorausschauend abzubremsen.

---

## 2. Konzept: Die N+1 Signal-Vorschau

TrainMaster schaut bei aktiver Fahrstraße nicht nur auf den Zielblock, sondern evaluiert den **Zustand des Folgeblocks (Block $n+1$)**:

```text
Zug 🚆 ─── Block A ───[ 🚦 Signal A (Hp1 + Vr0) ] ─── Weichenstraße ───➔ Block B ───[ 🚦 Signal B (Hp0) ] ─── Block C (Belegt)
```

### Signalbegriffs-Matrix:

| Fahrstraße in Block A | Folgeblock B Status | Signal A Hauptbild | Signal A Vorsignal / Kombisignal | Vorbild-Bedeutung |
| :--- | :--- | :--- | :--- | :--- |
| **Keine / Halt** | Beliebig | **`Hp0`** | Dunkel / `Vr0` | Halt! |
| **Geradeaus** | Frei (`Hp1` voraus) | **`Hp1`** | **`Vr1`** | Fahrt mit Streckengeschwindigkeit, Fahrt erwarten |
| **Geradeaus** | Halt (`Hp0` voraus) | **`Hp1`** | **`Vr0`** | Fahrt frei, aber **Halt erwarten**! |
| **Abzweig** | Frei (`Hp1` voraus) | **`Hp2`** | **`Vr1`** | Langsamfahrt (40/60 km/h), Fahrt frei erwarten |
| **Abzweig** | Halt (`Hp0` voraus) | **`Hp2`** | **`Vr0`** | Langsamfahrt, **Halt erwarten**! |

---

## 3. Datenmodell-Spezifikation (`types.ts`)

```typescript
export type DistantSignalAspect = 'VR0' | 'VR1' | 'VR2' | 'DARK';

export interface Signal {
  id: string;
  name: string;
  address: number;
  type: 'MAIN' | 'DISTANT' | 'COMBINED' | 'SHUNTING';
  aspect: SignalAspect;             // HP0, HP1, HP2, SH0, SH1
  distantAspect?: DistantSignalAspect; // VR0, VR1, VR2
  associatedBlockId?: string;       // Block, vor dem das Signal steht
  lookaheadBlockId?: string;        // Optional manuell oder automatisch per Topologie
}
```

---

## 4. Auswirkung auf die Lokomotiv-Geschwindigkeit

Wenn das Signal `Vr0` (Halt erwarten) meldet:
* TrainMaster drosselt die Lokomotive bereits bei der Vorbeifahrt an Signal A von Reisegeschwindigkeit (`V_Mid`) auf Vorbrems-Geschwindigkeit herunter.
* Die BBT-Bremskurve im Folgeblock B beginnt dadurch sanft und ohne Ruckeln.

---

## 5. UI & Gleisbild-Rendering

* **SVG-Darstellung:** Signale erhalten im Gleisplan ein optisches Vorsignal-Kompaktsymbol (gelb/grüne Doppel-LEDs bzw. Schirm).
* **Signal-Monitor:** Der Signal-Tab zeigt Haupt- und Vorsignal-Begriff live im Dashboard an.

---

## 6. Akzeptanzkriterien

- [ ] Signale erkennen automatisch den Belegungsstatus des Folgeblocks.
- [ ] Bei rotem Folgeblock signalisiert das Vorsignal korrekt `Vr0` (Halt erwarten).
- [ ] Lokomotiven reduzieren bei `Vr0` vorausschauend die Geschwindigkeit.
- [ ] Vollständige Ansteuerung über DCC / WIO für 3- und 4-begriffige Dekoder (z. B. Qdecoder, LDT).
