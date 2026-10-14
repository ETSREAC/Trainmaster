# [Feature] Fahrpläne & Taktbetrieb: Fester Umlaufbetrieb und Zugkreuzungen (Schedules & Timetable)

**Typ:** Core Dispatcher & Automation Enhancement  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/engine/ScheduleEngine.ts`, `server/src/types.ts`, `client/src/components/ScheduleMonitor.ts`  
**Labels:** `automation`, `schedules`, `timetable`, `dispatcher`

---

## 1. Problemstellung & Motivation

Aktuell unterstützt TrainMaster den beliebten **Zufalls-Automatikmodus ("Aquarium")**:
* Züge suchen sich autonom freie Blöcke und fahren unbegrenzt im Kreis.

Für anspruchsvolle Modellbahner und Schauanlagen fehlt jedoch der **echte Fahrplanbetrieb**:
* Der Pendlerzug muss um `08:00 Uhr` Modellzeit am Bahnhof abfahren, hält um `08:05` am Haltepunkt und wartet um `08:12` im Ausweichgleis auf den Gegenzug.
* Ein schneller ICE muss einen langsamen Güterzug im Bahnhof überholen können.
* Ohne feste Fahrpläne lassen sich realistische Betriebszenarien nach Vorbild der Deutschen Bahn nicht abbilden.

---

## 2. Konzept: Die Fahrplan-Engine

Ein **Fahrplan (Schedule)** definiert eine geordnete Abfolge von Halten und Fahrstraßen für eine bestimmte Lokomotive:

```text
[ Fahrplan: "RE 1 - Stundentakt" (Lok: BR 101) ]
  ├── 1. Start: Bahnhof Gleis 1 (Abfahrt: 12:00, Mindestaufenthalt: 60s)
  ├── 2. Halt:  Haltepunkt Berg (Ankunft: 12:04, Abfahrt: 12:06, Halt: 20s)
  ├── 3. Halt:  Kreuzungsbahnhof (Wartebedingung: Warte auf Freigabe / Gegenzug)
  └── 4. Ziel:  Endbahnhof Gleis 2 (Wendezug: Richtungswechsel & Pause)
```

### Intelligente Zugkreuzung (Flankenschutz):
* Zwei Züge auf eingleisiger Strecke: Die Fahrplan-Engine sorgt dafür, dass Zug A im Kreuzungsbahnhof wartet, bis der Gegenzug B vollständig im Ausweichgleis angekommen ist.

---

## 3. Synchronisation mit der Modellzeit-Uhr

TrainMaster besitzt bereits eine integrierte **Modellzeit-Uhr** (z. B. 1 Modelltag = 15 Realminuten aus dem Raumlicht-Modul):
* Fahrpläne nutzen diese Modellzeit als Zeitbasis.
* Modellbahner können den Zeitraffer einstellen (z. B. $1:4$ oder $1:10$), sodass ein voller 24h-Betriebstag in 2 Stunden realer Spielzeit abläuft.

---

## 4. Datenmodell-Spezifikation (`types.ts`)

```typescript
export interface ScheduleEntry {
  blockId: string;                // Zielblock
  departureTime?: string;         // "HH:MM" Modellzeit (z. B. "12:15")
  minWaitSeconds: number;         // Mindestaufenthalt in Sekunden
  waitForLocoId?: string;         // Zugkreuzung: Warte auf diese Lok
  waitForBlockId?: string;        // Warte bis bestimmter Block belegt/frei ist
  actionId?: string;              // Optionale Aktion (z. B. Ansage abspielen)
}

export interface Schedule {
  id: string;
  name: string;                   // z. B. "Nahverkehrslinie 4"
  assignedLocoId?: string;        // Zugeordnete Lokomotive
  cycleMode: 'ONCE' | 'REPEAT' | 'SHUTTLE'; // Shuttle = Wendezug-Pendelbetrieb
  entries: ScheduleEntry[];
  active: boolean;
}
```

---

## 5. UI-Integration: Das Fahrplan-Dashboard

* Neuer Tab im Stellwerk: **📅 Fahrplan & Abfahrtstafel**.
* **Live-Abfahrtstafel (wie am echten Bahnhof):**
  Zeigt die nächsten Abfahrten, Gleise, Zugnamen und eventuelle Verspätungen in Echtzeit an.

---

## 6. Akzeptanzkriterien

- [ ] Fahrpläne können im Web-Client mit Haltezeiten und Zielblöcken erstellt werden.
- [ ] Züge fahren pünktlich nach Modellzeit-Uhr ab.
- [ ] Zugkreuzungen auf eingleisigen Strecken warten zuverlässig auf den Gegenzug.
- [ ] Shuttle-Züge (Pendelzüge) kehren am Endbahnhof automatisch die Fahrtrichtung um.
