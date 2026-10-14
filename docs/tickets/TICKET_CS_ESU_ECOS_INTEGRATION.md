# [Feature] Digitalzentralen-Treiber: ESU ECoS 50210 / 50200 & CabControl (TCP Port 15471)

**Typ:** Core Hardware / Command Station Driver  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/hal/EcosDriver.ts`, `server/src/hal/ICommandStation.ts`, `server/src/types.ts`, `client/src/components/SettingsTab.ts`  
**Labels:** `hardware`, `command-station`, `esu`, `ecos`, `tcp`

---

## 1. Problemstellung & Motivation

Die **ESU ECoS** (Art.-Nr. 50210, 50200, 50000) und die ESU CabControl gehören zu den am weitesten verbreiteten und beliebtesten High-End-Digitalzentralen im deutschsprachigen und europäischen Raum:
* Viele Modellbahner besitzen eine ECoS als Hauptzentrale mit großem Touch-Display und zwei motorischen Drehreglern.
* Aktuell unterstützt TrainMaster DCC-EX, Roco Z21 und den virtuellen Simulator.
* Eine native Netzwerkanbindung an die ECoS ermöglicht es ESU-Besitzern, TrainMaster sofort per Ethernet-Kabel oder WLAN ohne jede Zwischenhardware zu nutzen.

---

## 2. Technisches Protokoll: ESU ECoS PC-Interface Specification

Das offizielle ESU-Netzwerkprotokoll (*„ECoS Command Protocol“*) ist **100 % öffentlich von ESU dokumentiert**:

* **Verbindung:** Standard **TCP/IP Socket** (Client baut Verbindung zur ECoS auf).
* **Port:** **`15471`** (Standard).
* **Format:** **Menschlesbares ASCII-Textprotokoll** (zeilenbasiert, Telnet-ähnlich).
* **Bidirektional & Event-basiert:** Die ECoS schickt bei jeder Reglerbewegung oder Sensoränderung sofort asynchrone `<EVENT ...>`-Zeilen.

---

## 3. Protokoll-Syntax & Befehls-Spezifikation

### 1. Verbindung initialisieren & Status:
```text
// Client sendet:
request(1, view)

// ECoS antwortet:
<REPLY request(1, view)>
1 status[GO]
<END 0 (OK)>
```

### 2. Gleisspannung & Not-Halt:
* **Strom EIN (GO):** `set(1, go)`
* **Strom AUS / Stop:** `set(1, stop)`

### 3. Lokomotiv-Steuerung (LokManager ID = 10):
* Lok-Objekt abfragen oder dynamisch binden via DCC-Adresse:
  `get(10, addr[3])`
* **Geschwindigkeit & Fahrtrichtung:**
  `set(1000, speed[80], dir[1])`  *(1000 = Lok-Objekt-ID, speed 0-128, dir: 1=Vorwärts, 0=Rückwärts)*
* **Funktionen (F0–F31):**
  `set(1000, func[0, 1])`  *(F0 einschalten)*
  `set(1000, func[2, 0])`  *(F2 ausschalten)*

### 4. Weichen & Magnetartikel (SwitchManager ID = 20):
* `set(2000, state[0])`  *(Geradeaus)*
* `set(2000, state[1])`  *(Abzweig)*

### 5. Rückmelder & s88 (FeedbackManager ID = 30):
* Automatische Event-Registrierung:
  `request(30, view)`
* ECoS meldet Sensor-Änderungen in Echtzeit:
  `<EVENT 30 [100, state[1]]>`  *(Sensor 100 hat ausgelöst)*

---

## 4. Implementierung in TrainMaster (`EcosDriver.ts`)

```typescript
import net from 'net';
import { ICommandStation, CommandStationCallbacks } from './ICommandStation.js';

export class EcosDriver implements ICommandStation {
  readonly id = 'ecos';
  readonly name = 'ESU ECoS 50210 / 50200 (TCP)';
  readonly type = 'ECOS' as const;

  private socket: net.Socket | null = null;
  private host: string;
  private port: number;

  constructor(host = '192.168.1.150', port = 15471) {
    this.host = host;
    this.port = port;
  }

  async connect(callbacks: CommandStationCallbacks): Promise<boolean> {
    this.socket = new net.Socket();
    this.socket.connect(this.port, this.host, () => {
      // System-Views abonnieren für Live-Feedback:
      this.send('request(1, view)\n');
      this.send('request(30, view)\n');
    });

    this.socket.on('data', (data) => {
      this.handleIncomingEcosLines(data.toString('utf-8'));
    });
    return true;
  }

  async setLocoSpeed(address: number, speed: number, direction: Direction): Promise<void> {
    const dirBit = direction === 'FWD' ? 1 : 0;
    this.send(`set(loco_${address}, speed[${speed}], dir[${dirBit}])\n`);
  }
}
```

---

## 5. UI-Integration

* Im **Optionen / Einstellungen-Tab**:
  * Zentralen-Typ: `🔴 ESU ECoS (TCP / LAN)`
  * Eingabefelder: **IP-Adresse** (z. B. `192.168.1.150`), **Port** (Standard `15471`).

---

## 6. Akzeptanzkriterien

- [ ] Erfolgreiche Verbindung per TCP Socket zu ESU ECoS 50200 / 50210.
- [ ] Züge reagieren latenzfrei auf Fahrstufen, Richtung und F0–F28.
- [ ] Manuelle Reglerdrehungen an den ECoS-Knöpfen werden per `<EVENT>` sofort im TrainMaster-Tacho synchronisiert.
- [ ] s88 / ECoSDetector Belegtmelder triggern die Blockbelegung in TrainMaster.
