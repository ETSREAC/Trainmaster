# [Feature] Digitalzentralen-Treiber: BiDiB (OpenDCC / Fichtelbahn ReadyBiDiB / Net-BiDiB)

**Typ:** Core Hardware / Command Station Driver  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/hal/BiDiBDriver.ts`, `server/src/hal/ICommandStation.ts`, `server/src/types.ts`, `client/src/components/SettingsTab.ts`  
**Labels:** `hardware`, `command-station`, `bidib`, `opendcc`, `fichtelbahn`, `railcom`, `serial`, `udp`

---

## 1. Problemstellung & Motivation

**BiDiB** (*Bi-Directional Bus for Model Railroad*) ist der führende, herstellerunabhängige und 100 % offene Standard für moderne Modellbahn-Steuerung und Rückmeldung (entwickelt u. a. von Wolfgang Kufer / OpenDCC und Fichtelbahn / BiDiB Association):
* **Marktstellung:** Extrem beliebt bei Modellbahnern mit hohen Ansprüchen an lückenlose Gleisbesetztmeldung, echte RailCom-Rückmeldung (Erkennung welcher Zug auf welchem Block steht inkl. Geschwindigkeits- und CV-Rückmeldung) sowie moderne Lichtsignal- und Servosteuerungen.
* **Typische Hardware:** Fichtelbahn ReadyBiDiB (OneControl, OneDMX, GBM16T), OpenDCC Command Station, Tams RedBox / Zeus, D&H.
* **Protokoll-Vorteile:** Keine Polling-Verzögerungen, native Bus-Baumstruktur, CRC-gesicherte Übertragung, Plug-and-Play-Knotenerkennung und bidirektionale Echtzeitmeldungen.

---

## 2. Technisches Protokoll: BiDiB Spezifikation

Die offizielle Spezifikation ist unter **bidib.org** vollständig und frei öffentlich zugänglich.

### 2.1 Verbindungsarten
1. **Serial over USB (Standard für Zentrale / Interface):**
   * Baudrate: Üblicherweise `115200` Baud oder `1.000.000` (1 MBaud, Highspeed USB)
   * 8 Datenbits, No Parity, 1 Stopbit (8N1)
2. **Net-BiDiB (Netzwerk / LAN / WLAN):**
   * UDP / TCP Port: **`6214`** oder per mDNS Service Discovery (`_bidib._udp.local`)
   * Ermöglicht drahtlose Anbindung oder direkte Ethernet-Kommunikation.

### 2.2 Paketaufbau & Framing (Serial & UDP)
* **Serial Framing:** Pakete werden durch das Magic-Token `0xFE` (BIDIB_PKT_MAGIC) getrennt.
* **Byte-Stuffing:** Vorkommen von `0xFE` und `0xFD` im Datenstrom werden durch `0xFD` gefolgt von `(Byte ^ 0x20)` maskiert.
* **Paketstruktur:**
  ```text
  [Länge: 1 Byte] [Path / Node-Adresse: 0-4 Bytes] [Seq-Nummer: 1 Byte] [Message-ID: 1 Byte] [Payload...] [CRC: 1 Byte]
  ```
* **CRC-8:** Prüfsumme über alle Bytes des Pakets (Polynom: `x^8 + x^5 + x^4 + 1` = `0x31`, Initialwert `0x00`).

---

## 3. Relevante BiDiB Message-Typen für TrainMaster

### 3.1 System & Bus-Verwaltung (0x00 - 0x1F)
* `MSG_SYS_GET_MAGIC` (`0x01`): Prüft BiDiB-Verbindung (Erwartete Antwort: `0xAFFE`).
* `MSG_SYS_GET_P_VERSION` (`0x02`): Protokollversion abfragen.
* `MSG_SYS_ENABLE` (`0x03`): Aktiviert asynchrone Meldungen vom Host.
* `MSG_SYS_DISABLE` (`0x04`): Deaktiviert Meldungen.
* `MSG_NODETAB_GETALL` (`0x08`): Fragt alle am Bus angeschlossenen Module ab (OneControl, GBM16T etc.).
* `MSG_NODE_NEW` (`0x0D`) / `MSG_NODE_LOST` (`0x0C`): Asynchrone Plug & Play Events, wenn Bausteine an- oder abgesteckt werden.

### 3.2 Command Station / Fahrbefehle (0x60 - 0x7F)
* **Gleisspannung (Power State):**
  * `MSG_CS_SET_POWER` (`0x60`) mit Parametern:
    * `0x00`: Power OFF (Not-Aus)
    * `0x01`: Power ON (GO)
    * `0x02`: Service Mode (Programmiergleis aktiv)
  * Asynchrone Antwort der Zentrale: `MSG_CS_STATE` (`0x60`) mit aktuellem Status (Power OK, Kurzschluss etc.).
* **Lok Fahren (Speed & Direction):**
  * `MSG_CS_DRIVE` (`0x64`):
    * Parameter: DCC-Adresse (Low/High), Adressmodus (14/28/128 Fahrstufen), Speed (0-127), Richtungsbit.
* **Lok-Funktionen (F0 - F28):**
  * `MSG_CS_ACCESSORY_MANUAL` oder `MSG_CS_DRIVE_MANUAL` zur gezielten Schaltung von Einzelfunktionen oder Funktionsgruppen F0-F4, F5-F8, F9-F12, F13-F20, F21-F28.

### 3.3 Magnetartikel & Zubehör (0x40 - 0x5F)
* `MSG_CS_ACCESSORY` (`0x65`):
  * Schaltet Weichen oder Signale mit Decoder-Adresse, Aspekt/Lage (Gerade/Abzweig) und Time-Out.
  * Bestätigung via `MSG_CS_ACCESSORY_STATE` (`0x65`) meldet die tatsächliche Endlagenrückmeldung oder Stellzeit zurück.

### 3.4 Belegtmeldung & RailCom (0x20 - 0x3F - Kernstärke von BiDiB!)
* `MSG_BM_OCC` (`0x22`): Statusmeldung über Belegt/Frei eines Blockabschnitts (Bitmaske für Kanäle 1–16).
* `MSG_BM_RC` (`0x27`): **RailCom-Meldung!**
  * Überträgt die exakte Lok-DCC-Adresse, die gerade auf dem Gleisabschnitt steht (Channel 1 / Channel 2).
  * TrainMaster kann damit automatisch erkennen, welcher Zug sich in welchem Block befindet, ohne manuelles Aufgleisen!
* `MSG_BM_CONFIDENCE` (`0x28`): Zuverlässigkeitswert der RailCom-Messung.
* `MSG_BM_SPEED` (`0x2A`): Echte gemessene Ist-Geschwindigkeit der Lokomotive (km/h) via RailCom Ch2.

### 3.5 Decoder-Programmierung (Service Mode & PoM)
* `MSG_CS_PROG` (`0x61`):
  * Befehle für CV Read, CV Write, CV Bit Manipulation im Service Mode (Programmiergleis).
  * Programming on Main (PoM) zur CV-Verstellung bei laufendem Betrieb.
* Asynchrone Antwort: `MSG_CS_PROG_STATE` (`0x61`) mit Ergebnis (`PROG_OK`, `PROG_NO_ACK`, `PROG_VERIFY_FAILED`) und gelesenem CV-Wert.

---

## 4. Architektur & Implementierung in TrainMaster

### 4.1 Driver-Klasse `BiDiBDriver.ts`
Implementiert das `ICommandStation`-Interface:
```typescript
export class BiDiBDriver implements ICommandStation {
  readonly id: string;
  readonly name = 'BiDiB (OpenDCC / Fichtelbahn / Net-BiDiB)';
  readonly protocol = 'bidib';

  private transport: SerialPort | Socket; // Serial oder UDP/TCP
  private sequence = 0;
  private nodes: Map<string, BiDiBNode> = new Map();

  async connect(config: BiDiBConnectionConfig): Promise<void>;
  async disconnect(): Promise<void>;

  async setPower(state: PowerState): Promise<void>;
  async setLocoSpeed(address: number, speed: number, direction: 'forward' | 'backward', steps?: 14 | 28 | 128): Promise<void>;
  async setLocoFunction(address: number, fn: number, active: boolean): Promise<void>;
  async setTurnout(address: number, state: 'straight' | 'diverging'): Promise<void>;

  // CV Programming
  async readCV(cv: number): Promise<number>;
  async writeCV(cv: number, value: number): Promise<void>;
  async writeCVPoM(address: number, cv: number, value: number): Promise<void>;

  // RailCom Event Handler
  on(event: 'feedbackChanged', listener: (id: string, active: boolean) => void): this;
  on(event: 'railComDetected', listener: (detectorId: string, locoAddress: number, speedKmH?: number) => void): this;
}
```

### 4.2 Framer & CRC-Helper
* Ein robuster Rx/Tx-Stream-Transformator (`BiDiBFramer.ts`), der:
  * Byte-Stuffing (`0xFD`) auflöst.
  * CRC-8 validiert.
  * Bei ungültiger CRC das Paket verwirft und Sequenzfehler loggt.
  * Acknowledgment (`MSG_SYS_ACK`) an die Zentrale sendet.

---

## 5. UI-Konfiguration (Settings)

Unter **Einstellungen -> Digitalzentrale**:
* Dropdown-Option: `BiDiB (OpenDCC / Fichtelbahn ReadyBiDiB)`
* Verbindungstyp:
  * `Seriell (USB)` -> Dropdown mit Com-Ports (z. B. `COM3` oder `/dev/ttyUSB0`) & Baudrate (`115200` / `1000000`).
  * `Net-BiDiB (LAN/WLAN)` -> Host/IP-Adresse und Port (`6214`).
* Checkbox: *RailCom Zugerkennung aktivieren* (automatisches Zuweisen von Loks in Blöcken bei RailCom-Detektion).
* Statusanzeige: Liste aller erkannten BiDiB-Knoten (Unique ID, Typ z. B. GBM16T, Master, Firmware-Version).

---

## 6. Akzeptanzkriterien

- [ ] `BiDiBDriver.ts` implementiert `ICommandStation` vollständig.
- [ ] Verbindung über virtuellen COM-Port (USB) und Net-BiDiB (UDP/TCP Port 6214) unterstützt.
- [ ] Robuster BiDiB-Packet-Framer mit CRC8-Berechnung und Byte-Stuffing vorhanden.
- [ ] Power On, Power Off, Not-Halt steuerbar.
- [ ] Lokomotiven fahren (14/28/128 Fahrstufen, Vorwärts/Rückwärts) und Licht/Funktionen F0–F28 schaltbar.
- [ ] Weichen und Magnetartikel über BiDiB-Zubehörmeldungen ansteuerbar.
- [ ] Rückmelder & Blockbelegung (GBM16T) triggern `feedbackChanged`-Events in TrainMaster.
- [ ] RailCom-Pakete (`MSG_BM_RC`) werden geparst und melden die Lok-Adresse direkt an den zugehörigen Gleisabschnitt.
- [ ] Service Mode Programmiergleis & PoM sind über BiDiB CV-Befehle funktionsfähig.
- [ ] E2E- bzw. Unit-Tests mit synthetischen BiDiB-Frames validieren Parsing und CRC.
