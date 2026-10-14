# [Feature] Operations & Cargo Dispatcher: Rangier- & Frachtauftrag-System (Gamification)

**Typ:** Gameplay / Operations / Simulation  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/operations/CargoManager.ts`, `server/src/operations/WaybillGenerator.ts`, `client/src/components/operations/SwitchListView.ts`, `client/src/components/operations/CargoDashboard.ts`  
**Labels:** `operations`, `cargo`, `shunting`, `gamification`, `freight`, `waybills`, `tablet-ui`

---

## 1. Problemstellung & Motivation

Züge nur im Kreis oder von Block zu Block fahren zu lassen, wird für viele Modellbahner nach kurzer Zeit eintönig:
* Das Herzstück des echten Eisenbahnbetriebs ist das **Rangieren und der Güterverkehr**: Wagen zustellen, Züge neu zusammenstellen, Güter von Industrien zu Empfängern transportieren und Leerwagen abholen.
* Bisherige Lösungen:
  * Handgeschriebene Zettel oder Excel-Tabellen.
  * Das 25 Jahre alte, extrem sperrige *JMRI OperationsPro* mit komplizierten Tabellenansichten ohne grafische Unterstützung.
* **TrainMaster-Lösung:** Ein modernes, rein softwarebasiertes **digitales Frachtauftrag- & Rangiersystem** für Tablet und Smartphone (ohne jegliche Hardware-Zusatzkosten wie NFC/Sensoren):
  * Automatische Generierung logischer Frachtaufträge (Waybills).
  * Übersichtliche digitale Rangierzettel (Switch Lists) mit Waggon-Vorschau und Abhakkarten.
  * Gamification: Punkte für pünktliche und effiziente Zustellungen.

---

## 2. Kernfunktionen

### 2.1 Industrie- & Ladestellen-Modell
Gleise und Nebengleise im Stellwerk können als Industrien / Ladestellen markiert werden:
* **Holzwerk / Sägewerk:** Benötigt leere Rungenwagen, produziert Holzladungen.
* **Brauerei / Lebensmittelwerk:** Benötigt Gerste/Kühlwagen, produziert Bier/Fertigwaren in gedeckten Wagen.
* **Raffinerie / Tanklager:** Belädt und entlädt Kesselwagen (Diesel, Benzin).
* **Container-Terminal:** Umschlagplatz für Flachwagen mit ISO-Containern.
* **Schattenbahnhof / Übergabebahnhof:** Ein- und Ausgangspunkt für den überregionalen Güterverkehr.

### 2.2 Dynamischer Frachtbrief-Generator (Waybill Engine)
* Das System erzeugt kontinuierlich oder per Knopfdruck neue Transportaufträge:
  * *Auftrag #204:* 2x Kesselwagen mit Diesel von *Raffinerie Gleis 1* nach *Heizölhandel Gleis 2* transportieren.
  * *Auftrag #205:* 3x leere Schüttgutwagen aus dem *Schattenbahnhof* zum *Schotterwerk* beistellen.
* Berücksichtigt Waggon-Typen aus der Wagen-Datenbank (`TICKET_CARS_AND_TRAIN_CONSISTS.md`).

### 2.3 Digitaler Rangierzettel (Switch List für Smartphone & Tablet)
* Der Lokführer öffnet TrainMaster auf seinem Smartphone oder Tablet:
* Sieht eine klare Schritt-für-Schritt-Aufgabenliste:
  1. [ ] *Fahre mit Rangierlok V60 nach Gleis 4b (Gütergleis).*
  2. [ ] *Kupple Waggon DB 402 110 (Gedeckter Wagen) und DB 501 920 (Rungenwagen) an.*
  3. [ ] *Fahre über Weiche W3 zum Sägewerk und stelle DB 501 920 ab.*
  4. [ ] *Drücke Entkuppler E2 (wird direkt im Display mit einem Tippen ausgelöst).*
  5. [ ] *Bestätige Zustellung.*
* Jeder Schritt wird mit einem Wisch oder Fingertipp als erledigt markiert.

### 2.4 Gamification & Punkte-Bewertung
* Nach Abschluss einer Schicht (Rangier-Session) erhält der Fahrdienstleiter/Lokführer eine Auswertung:
  * Anzahl zugestellter Tonnen Fracht.
  * Zeitaufwand und Pünktlichkeit.
  * Effizienz (möglichst wenige Rangierfahrten).
  * Highscore-Tabelle für Clubabende oder Fahr-Sessions mit Freunden.

---

## 3. Datenmodell (`types.ts`)

```typescript
export interface IndustryLocation {
  id: string;
  name: string; // z.B. "Sägewerk Tannenhof"
  blockId: string; // Verknüpfter Block im Stellwerk
  trackCapacityCars: number; // Maximale Wagenanzahl
  acceptedCarTypes: ('boxcar' | 'flatcar' | 'tanker' | 'hopper' | 'gondola')[];
  demandRatePerHour: number;
  supplyRatePerHour: number;
}

export interface CargoWaybill {
  id: string;
  orderNumber: string; // z.B. "FR-2026-089"
  carId: string; // Zugewiesener Waggon
  cargoType: 'lumber' | 'beer' | 'coal' | 'oil' | 'gravel' | 'empty';
  originIndustryId: string;
  destinationIndustryId: string;
  status: 'pending' | 'in_transit' | 'delivered';
  assignedTrainId?: string;
  createdAt: string;
  deliveredAt?: string;
}

export interface SwitchListStep {
  stepIndex: number;
  action: 'pickup' | 'setout' | 'runaround' | 'uncouple';
  carId: string;
  locationId: string;
  completed: boolean;
}
```

---

## 4. UI & Bedienung

* **Neuer Reiter „Güterverkehr & Rangieren“:**
  * **Disposition (PC-Ansicht):** Übersicht aller Industrien, anstehenden Aufträge und wartenden Frachten.
  * **Rangierer-Ansicht (Mobile/Tablet):** Große, touchfreundliche Buttons, klare Waggon-Karten mit Farbe und Foto, integrierte Weichen-/Entkuppler-Schnellbuttons.

---

## 5. Akzeptanzkriterien

- [ ] Industrien können im Gleisplan beliebigen Nebengleisen/Blöcken zugewiesen werden.
- [ ] Frachtbrief-Generator erzeugt logische Ketten (Rohstoff -> Werk -> Fertigprodukt -> Schattenbahnhof).
- [ ] Switch List View funktioniert auf Mobilgeräten flüssig mit Touch-Bedienung.
- [ ] Waggons wechseln ihren Ladezustand (Leer / Beladen mit Frachtname).
- [ ] Entkuppler-Gleise können direkt aus der Switch-List ausgelöst werden.
- [ ] Reine Softwarelösung ohne externe Hardware-/Chip-Abhängigkeiten.
