# [Feature] Digitalzentralen-Treiber: Digitrax & Uhlenbrock LocoNet (TCP & USB-Seriell)

**Typ:** Core Hardware / Command Station Driver  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/hal/LocoNetDriver.ts`, `server/src/hal/ICommandStation.ts`, `server/src/types.ts`, `client/src/components/SettingsTab.ts`  
**Labels:** `hardware`, `command-station`, `loconet`, `digitrax`, `uhlenbrock`, `intellibox`

---

## 1. Problemstellung & Motivation

**LocoNet** (von Digitrax entwickelt, in Europa durch Uhlenbrock, Fleischmann und Digikeijs etabliert) ist einer der weltweit erfolgreichsten Modellbahn-Busse:
* Zentralen wie die **Uhlenbrock Intellibox (IB I, IB II, IB-COM)**, **Fleischmann TwinCenter**, **Digitrax DCS240/DCS52** und DIY-Interfaces (GCA50) nutzen LocoNet.
* Viele Modellbahner betreiben LocoNet-Rückmelder und FRED-Handregler.
* Eine Unterstützung sowohl für **USB-Seriell** (direkt per USB-Kabel an die Intellibox) als auch für **LocoNet-over-TCP** (z. B. LBServer auf Port 1234 oder DR5000) macht TrainMaster mit dieser riesigen Hardware-Basis kompatibel.

---

## 2. Technisches Protokoll: Digitrax LocoNet Personal Edition 1.0

* **Verbindungsmöglichkeiten:**
  1. **USB / Seriell:** Standard Virtual COM-Port (`19200` oder `57600` Baud, 8N1).
  2. **TCP / IP:** LocoNet-over-TCP Server (Standard-Port `1234`).
* **Frame-Struktur:** Peer-to-Peer Bus mit Opcode und XOR-Prüfsumme.
  * Erstes Byte: Opcode (Bits 7..5 bestimmen die Paketlänge: 2, 4, 6 oder variable Bytes).
  * Letztes Byte: Checksumme (`~XOR` aller vorherigen Bytes).

---

## 3. Die wichtigsten LocoNet Opcodes

| Opcode | Hex | Beschreibung | Format / Parameter |
| :--- | :--- | :--- | :--- |
| **OPC_LOCO_SPD** | `0xA0` | Lok-Geschwindigkeit (Fahrstufen 0–127) | `[0xA0, Slot, Speed, Checksum]` |
| **OPC_LOCO_DIRF** | `0xA1` | Richtung und F0–F4 | `[0xA1, Slot, Dir_F0_F4, Checksum]` |
| **OPC_LOCO_SND** | `0xA2` | Funktionen F5–F8 | `[0xA2, Slot, F5_F8, Checksum]` |
| **OPC_SW_REQ** | `0xB0` | Weiche / Magnetartikel schalten | `[0xB0, AdrLow, AdrHigh_State, Checksum]` |
| **OPC_INPUT_REP** | `0xB2` | Rückmelder-Event (Sensor aktiv/inaktiv) | `[0xB2, SensorLow, SensorHigh_State, Checksum]` |
| **OPC_GPON** | `0x83` | Global Power ON (Gleisspannung EIN) | `[0x83, 0x7C]` |
| **OPC_GPOFF** | `0x82` | Global Power OFF (Not-Halt / AUS) | `[0x82, 0x7D]` |

---

## 4. Slot-Verwaltung (Dispatching)

LocoNet nutzt wie eine Telefonzentrale **Slots**:
* Um eine Lok mit DCC-Adresse (z. B. #218) zu steuern, fordert TrainMaster per `OPC_LOCO_ADR (0xBF)` einen Slot an.
* Die Zentrale antwortet mit den aktuellen Parametern im Slot.
* Danach steuert TrainMaster die Lok über diese Slot-Nummer.

---

## 5. Implementierung in TrainMaster (`LocoNetDriver.ts`)

```typescript
import net from 'net';
import { SerialPort } from 'serialport';
import { ICommandStation, CommandStationCallbacks } from './ICommandStation.js';

export class LocoNetDriver implements ICommandStation {
  readonly id = 'loconet';
  readonly name = 'Digitrax / Uhlenbrock LocoNet (USB / TCP)';
  readonly type = 'LOCONET' as const;

  // Unterstützt sowohl Netzwerk- als auch direkte serielle USB-Kabelanbindung
  private tcpSocket: net.Socket | null = null;
  private serialPort: SerialPort | null = null;

  async setPower(active: boolean): Promise<void> {
    const opcode = active ? 0x83 : 0x82;
    const checksum = ~opcode & 0xFF;
    this.sendPacket([opcode, checksum]);
  }
}
```

---

## 6. Akzeptanzkriterien

- [ ] Erfolgreiche Verbindung per USB-Kabel (Intellibox) und per TCP-Socket (Port 1234).
- [ ] Züge lassen sich über Slots anfordern und steuern.
- [ ] Weichenbefehle über `OPC_SW_REQ` stellen Weichen und Signale.
- [ ] Rückmelde-Module (z. B. Uhlenbrock 63320 oder Digitrax BDL168) triggern Blockbelegungen.
