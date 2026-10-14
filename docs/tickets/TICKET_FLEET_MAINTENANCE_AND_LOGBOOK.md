# [Feature] Fleet Manager & Digitales Wartungsbuch: Betriebsstunden, Inspektions-Erinnerung & Fahrzeugarchiv

**Typ:** Core Engine / Fleet Management / Value Preservation  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/fleet/MaintenanceTracker.ts`, `server/src/fleet/VehicleArchive.ts`, `client/src/components/fleet/LocoMaintenanceModal.ts`, `client/src/components/fleet/FleetDashboard.ts`  
**Labels:** `fleet`, `maintenance`, `logbook`, `operating-hours`, `mileage`, `archive`, `inventory`

---

## 1. Problemstellung & Motivation

Modellbahn-Lokomotiven sind feinmechanische Präzisionsgeräte im Wert von 150 € bis über 800 € pro Modell:
* In typischen Sammlungen befinden sich 20 bis 100+ Lokomotiven.
* **Das Problem:** Schmierstoffe und Öle verharzen mit der Zeit, Radsätze und Schleifer verschmutzen durch Abrieb und Staub, und Haftreifen werden porös.
* Bisherige Praxis: Besitzer notieren Wartungen gar nicht oder in unübersichtlichen Papierheften. Man weiß nie, wie viele echte Betriebsstunden eine Lok gelaufen ist.
* **TrainMaster-Lösung:** Ein automatisches digitales Betriebstagebuch, das Laufzeiten und Vorbild-Kilometer sekundengenau erfasst, rechtzeitig an Inspektionen erinnert und Anleitungen, Ersatzteilblätter sowie CV-Backups zentral archiviert.

---

## 2. Kernfunktionen

### 2.1 Automatisches Tracking von Betriebsstunden & Modell-Kilometern
* Sobald eine Lokomotive fährt (`speed > 0`), misst TrainMaster im Hintergrund:
  * **Echte Betriebsstunden:** Reine Fahrzeit (im Stillstand zählt die Zeit nicht).
  * **Modell-Kilometer:** Berechnet aus Maßstabsgeschwindigkeit (km/h) und Fahrtdauer:
    $$\text{Distanz} = \sum (\text{Speed}_{\text{km/h}} \times \Delta t)$$
  * **Anfahr-/Bremszyklen:** Anzahl der Fahrten und Richtungswechsel.

### 2.2 Wartungsintervalle & Ampelsystem
* Jede Lokomotive erhält individuell konfigurierbare oder globale Wartungsintervalle:
  * **Nach 20 Betriebsstunden:** *Radsätze, Schleifer und Stromabnehmer reinigen.*
  * **Nach 50 Betriebsstunden:** *Getriebe und Motorlager sparsam ölen.*
  * **Nach 100 Betriebsstunden:** *Haftreifen und Kohlebürsten prüfen/wechseln.*
* **Visuelle Ampel im Lok-Katalog:**
  * 🟢 **Grün:** Alles in Ordnung.
  * 🟡 **Gelb:** Inspektion steht in Kürze an (< 5 Stunden Restlaufzeit).
  * 🔴 **Rot:** Wartungsintervall überschritten -> Hinweiskarte im Stellwerk und Wartungs-Badge auf der Lokkarte.

### 2.3 Wartungshistorie & Protokollierung
* Nach Durchführung einer Wartung trägt der Nutzer mit einem Klick einen Eintrag ein:
  * Datum & Uhrzeit (automatisch).
  * Durchgeführte Arbeiten (z. B. Checkboxen für *Geölt*, *Gereinigt*, *Haftreifen gewechselt*).
  * Notizfeld (z. B. *„Faller Spezialöl 170489 verwendet, Kohlebürsten noch gut“*).
  * Knopfdruck: *„Intervall zurücksetzen“* (Zähler springt für diese Kategorie auf 0 zurück).

### 2.4 Digitales Fahrzeug-Archiv (Dokumente & CV-Snapshots)
* **Dokumentenablage pro Fahrzeug:**
  * Upload von PDF-Anleitungen, Ersatzteillisten und Explosionszeichnungen (direkt verknüpft mit dem [AI PDF Decoder Importer](file:///c:/Users/etswr/Downloads/TrainMaster/docs/tickets/TICKET_AI_PDF_FUNCTION_IMPORTER_BACKEND.md)).
* **CV-Backup-Historie:**
  * Vollständiges CV-Abbild des Decoders speichern. Wenn der Decoder verstellt wurde oder ein Reset nötig ist, kann der exakte Zustand mit einem Klick wiederhergestellt werden.
* **Inventar & Werterfassung:**
  * Kaufdatum, Kaufpreis, Hersteller, Artikelnummer, Kupplungstyp und Decoder-Modell (z. B. *ESU LokSound 5* oder *Zimo MS450P22*).

---

## 3. Datenmodell (`types.ts`)

```typescript
export interface MaintenanceTask {
  id: string;
  name: string; // z.B. "Räder reinigen", "Getriebe ölen", "Haftreifen prüfen"
  intervalOperatingHours: number; // z.B. 50
  intervalDistanceKm?: number;
  currentOperatingHours: number; // zählt hoch seit letztem Reset
  lastServiceDate?: string;
  isOverdue: boolean;
}

export interface ServiceLogEntry {
  id: string;
  date: string;
  operatingHoursAtService: number;
  totalDistanceKmAtService: number;
  tasksPerformed: string[];
  notes?: string;
  technicianName?: string;
}

export interface VehicleDocument {
  id: string;
  fileName: string;
  fileType: 'manual_pdf' | 'parts_list' | 'photo' | 'receipt';
  uploadDate: string;
  filePath: string;
}

export interface LocoMaintenanceProfile {
  locoId: string;
  totalOperatingHours: number;
  totalDistanceKm: number;
  totalStartStopCycles: number;
  tasks: MaintenanceTask[];
  serviceHistory: ServiceLogEntry[];
  documents: VehicleDocument[];
  cvSnapshots: { timestamp: string; note: string; cvMap: Record<number, number> }[];
  purchaseInfo?: {
    purchaseDate?: string;
    priceEuros?: number;
    manufacturerArticleNr?: string;
  };
}
```

---

## 4. UI & Bedienung

* **Neuer Reiter / Ansicht im Lok-Menü: „Wartung & Flotte“:**
  * Übersicht aller Loks sortiert nach Wartungsdringlichkeit (rote Loks ganz oben).
  * Detaillierte Lok-Akte mit Foto, Kilometerzähler, Betriebsstundenuhr und PDF-Schnellansicht.
  * 1-Klick-Service-Reset mit Bestätigungs-Dialog.

---

## 5. Akzeptanzkriterien

- [ ] Fahrzeiten und Kilometer werden für jede Lok während des Betriebs automatisch kumuliert und persistent gespeichert.
- [ ] Wartungsaufgaben mit anpassbaren Schwellenwerten (z. B. 20h / 50h / 100h) konfigurierbar.
- [ ] Visuelle Anzeige (Grün / Gelb / Rot) im Lok-Fahrregler und im Flotten-Dashboard.
- [ ] Wartungs-Logbuch speichert Service-Einträge mit Datum und Freitext.
- [ ] Dateiupload für Anleitungen und Ersatzteilblätter (PDF / Bilder) funktionsfähig.
- [ ] CV-Snapshot-Export und Import für Decoder-Backups integriert.
