# [Feature] Wagenverwaltung, Züge & Mehrfachtraktionen (Cars & Train Consists)

**Typ:** Core Fleet & Consist Enhancement  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/engine/LocoManager.ts`, `server/src/engine/ConsistManager.ts`, `server/src/types.ts`, `client/src/components/TrainDepotDrawer.ts`  
**Labels:** `fleet`, `consists`, `cars`, `double-heading`

---

## 1. Problemstellung & Motivation

Aktuell verwaltet TrainMaster Züge primär als einzelne **Triebfahrzeuge (Lokomotiven)**:
* Die Zuglänge (`lengthCm`) ist statisch in der Lokomotive eingetragen.
* Kuppelt der Modellbahner 4 Personenwagen an oder rangiert Güterwagen ab, stimmt die gespeicherte Länge nicht mehr mit der Realität überein.
* Die automatische Blockprüfung (passt der Zug in Gleis 2?) wird dadurch verfälscht.
* **Doppeltraktionen / Mehrfachtraktionen** (z. B. zwei BR 218 vor einem schweren Erzzug) können nicht synchron mit einem einzigen Regler gesteuert werden.

---

## 2. Konzept: Züge, Wagen und Zugverbände

Es wird eine saubere Trennung zwischen **Triebfahrzeug (Lok)**, **Wagen (Car)** und dem **Zugverband (Consist / Train)** eingeführt:

```text
[ Zugverband: "IC 2012 Allgäu" ]
  ├── Lok 1:  DB BR 218 (Länge 19,5 cm, Führende Lok)
  ├── Lok 2:  DB BR 218 (Länge 19,5 cm, Geführte Lok - synchroner Sound & Fahrt)
  ├── Wagen 1: Avmz 1. Klasse (Länge 30,3 cm)
  ├── Wagen 2: Bpmz 2. Klasse (Länge 30,3 cm)
  └── Wagen 3: Bpmz 2. Klasse (Länge 30,3 cm)
  ──────────────────────────────────────────────────────────
  Gesamtlänge des Zuges: 129,9 cm | Zugtyp: PASSENGER
```

---

## 3. Kern-Funktionen

### 1. Wagenpark-Verwaltung (Car Depot):
* Erfassen von Güter- und Personenwagen (Katalognummer, Baureihe, Länge in cm, Achsenanzahl, Beleuchtung ja/nein).
* Visuelle Piktogramme für Kesselwagen, Schiebewandwagen, InterCity-Wagen, etc.

### 2. Visueller Zugbildungs-Editor (Drag & Drop):
* Im Lok-Depot oder Zug-Editor können Wagen einfach per Drag & Drop hinter die Lokomotive gehängt werden.
* Die Gesamtlänge und das Gewicht des Zuges werden in Echtzeit berechnet.

### 3. Mehrfachtraktion (Double-Heading / Consist Control):
* Zwei oder mehr Loks fahren als Verband:
  - Ein einziger Schieberegler im Fahrregler steuert beide DCC-Adressen synchron.
  - Fahrtrichtung der zweiten Lok kann invertiert werden (z. B. Heck-an-Heck gekuppelt).
  - Spitzenlicht wird nur an Lok 1 vorne und Lok 2 hinten geschaltet.

---

## 4. Datenmodell-Spezifikation (`types.ts`)

```typescript
export interface Car {
  id: string;
  name: string;                   // z. B. "DB Bpmz 291"
  type: 'PASSENGER' | 'FREIGHT' | 'CABOOSE' | 'POSTAL';
  lengthCm: number;
  image?: string;
  hasLights: boolean;
  functionDccAddress?: number;    // Optionaler Funktionsdekoder für Innenlicht
}

export interface TrainConsist {
  id: string;
  name: string;                   // z. B. "IC 2012"
  leadLocoId: string;             // Führende Lok
  slaveLocoIds: string[];         // Weitere Loks in Traktion
  carIds: string[];               // Angehängte Wagen
  calculatedLengthCm: number;     // Dynamisch berechnete Gesamtlänge
  trainType: 'PASSENGER' | 'FREIGHT' | 'HIGH_SPEED' | 'COMMUTER';
}
```

---

## 5. UI-Integration

* Im **Train Depot Drawer** (unten am Bildschirm):
  - Klick auf den Zug zeigt eine Miniatur-Grafik des gesamten Zugverbandes (Lok + Wagenreihung).
* Im **Stellwerk (Gleisplan):**
  - Der Block zeigt den Namen des Zugverbands (z. B. *"IC 2012"*) statt nur der Lok-Nummer.

---

## 6. Akzeptanzkriterien

- [ ] Wagen können mit Länge und Typ angelegt werden.
- [ ] Züge können durch Ankoppeln von Wagen gebildet werden; Zuglänge aktualisiert sich automatisch.
- [ ] Doppeltraktionen steuern zwei Lokomotiven synchron über einen gemeinsamen Regler.
- [ ] Die dynamische Gesamtlänge wird von der Blocklängen-Prüfung im Automatikbetrieb berücksichtigt.
