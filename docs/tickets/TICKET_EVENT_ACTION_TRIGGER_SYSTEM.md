# [Feature] Aktionen & Event-Trigger: Wenn-Dann-Automationssystem (Actions & Triggers)

**Typ:** Core Engine & Scripting Enhancement  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/engine/ActionEngine.ts`, `server/src/types.ts`, `client/src/components/SettingsTab.ts`  
**Labels:** `automation`, `actions`, `events`, `sound`, `relays`

---

## 1. Problemstellung & Motivation

Aktuell reagiert TrainMaster nur auf feste System-Events (z. B. Sensor ENTER ➔ Geschwindigkeit reduzieren, Sensor IN ➔ Stoppen).

Modellbahner möchten jedoch individuelle Szenarien gestalten:
* *„Wenn Zug ICE 3 in Gleis 1 einfährt, spiele 5 Sekunden später die Audio-Bahnhofsansage ab.“*
* *„Wenn die Lok vor dem Bahnübergang steht, schalte das Blinklicht und die Schranke an.“*
* *„Wenn eine Dampflok losfährt, pfeife kurz (F2) und schalte den Dampfgenerator (F1) ein.“*
* *„Wenn Not-Halt ausgelöst wird, schalte das Raumlicht auf rotes Notlicht um.“*

In Rocrail ist das **Aktions-System** das Herzstück für diese individuellen Modellbahn-Effekte.

---

## 2. Konzept: Die TrainMaster Action Engine

Eine Aktion besteht aus drei Komponenten:
1. **Trigger (Auslöser):** Welches Ereignis feuert die Aktion?
2. **Conditions (Bedingungen):** Wann darf die Aktion ausgeführt werden?
3. **Commands (Befehle):** Was soll passieren?

```text
[ TRIGGER: Block "Gleis 1" ➔ Status "ENTER" ]
       │
       ├── [ BEDINGUNG: Zugtyp == "PASSENGER" && Zeit > 18:00 ]
       │          │ (Trifft zu)
       │          ▼
       └── [ BEFEHL 1: Web-Audio "ansage_gleis1.mp3" abspielen ]
           [ BEFEHL 2: Lok-Funktion F5 (Innenlicht) einschalten ]
           [ BEFEHL 3: Nach 10 Sekunden ➔ Signal auf Fahrt stellen ]
```

---

## 3. Datenmodell-Spezifikation (`types.ts`)

```typescript
export type ActionTriggerType = 
  | 'SENSOR_ACTIVE'       // Rückmelder ausgelöst
  | 'BLOCK_ENTER'         // Zug fährt in Block ein
  | 'BLOCK_IN'            // Zug hält im Block
  | 'BLOCK_OCCUPIED'      // Block belegt
  | 'ROUTE_LOCKED'        // Fahrstraße aktiviert
  | 'SYSTEM_ESTOP'        // Not-Aus gedrückt
  | 'CLOCK_TIME';         // Bestimmte Modellzeit erreicht (z. B. 12:00)

export type ActionCommandType =
  | 'SET_LOCO_FUNCTION'   // F-Taste an der auslösenden Lok schalten (z. B. F2 Horn für 2s)
  | 'SET_TURNOUT'         // Weiche / Schranke schalten
  | 'SET_OUTPUT'          // Digitalen Ausgang / Relais schalten
  | 'PLAY_SOUND'          // Audio-Datei (.mp3/.wav) im Web-Client oder Server abspielen
  | 'SET_LIGHTING_MODE'   // Raumbeleuchtung umschalten (z. B. Gewitter)
  | 'DELAY';              // Zeitverzögerung in Millisekunden

export interface ActionDefinition {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: ActionTriggerType;
    targetId: string;       // Block-ID, Sensor-ID oder Zeit
  };
  conditions?: {
    locoId?: string;        // Nur bei bestimmter Lok
    trainType?: string;     // Nur bei Zuggattung (z. B. FREIGHT)
    direction?: Direction;  // Nur in bestimmter Fahrtrichtung
  };
  commands: Array<{
    type: ActionCommandType;
    targetId?: string;
    value?: any;
    delayMs?: number;       // Verzögerung vor Ausführung
  }>;
}
```

---

## 4. Audio-Wiedergabe & Soundeffekte

TrainMaster erhält einen Sound-Ordner (`server/data/sounds/`):
* Modellbahner können eigene Bahnhofsansagen, Pfeifsignale oder Glockengeläut als MP3/WAV ablegen.
* Über WebSocket schickt der Server den Sound-Event an verbundene Tablets/PCs, die den Sound über ihre Lautsprecher synchron abspielen.

---

## 5. UI-Integration

* Neuer Menüpunkt in den Einstellungen: **⚡ Automations- & Aktions-Manager**.
* Visueller Wenn-Dann-Editor mit Dropdown-Auswahl ohne Programmieraufwand.

---

## 6. Akzeptanzkriterien

- [ ] Aktionen können über die Web-Oberfläche angelegt und gespeichert werden.
- [ ] Sounddateien (.mp3/.wav) können ereignisgesteuert abgespielt werden.
- [ ] Lokfunktionen (wie Pfeife F2) können beim Passieren eines Melders für konfigurierbare Sekunden aktiviert werden.
- [ ] Bedingungen (z. B. nur für Güterzüge) werden zuverlässig ausgewertet.
