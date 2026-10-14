# [Feature] Digitalzentralen-Treiber: Märklin Central Station 2 & 3 (CAN-over-UDP)

**Typ:** Core Hardware / Command Station Driver  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/hal/MaerklinCsDriver.ts`, `server/src/hal/ICommandStation.ts`, `server/src/types.ts`, `client/src/components/SettingsTab.ts`  
**Labels:** `hardware`, `command-station`, `maerklin`, `cs2`, `cs3`, `can-bus`, `udp`

---

## 1. Problemstellung & Motivation

Märklin ist der traditionsreichste und im deutschsprachigen Raum marktführende Modellbahnhersteller (insbes. Spur H0 Wechselstrom / 3-Leiter sowie mfx/DCC).  
Zehntausende Modellbahner steuern ihre Anlagen mit einer:
* **Märklin Central Station 2 (CS2 - 60213, 60214, 60215)**
* **Märklin Central Station 3 & 3 plus (CS3 - 60226, 60216)**

Beide Zentralen besitzen eine eingebaute Ethernet-Netzwerkbuchse. Eine native TrainMaster-Anbindung erschließt die gesamte Märklin-Community für TrainMaster!

---

## 2. Technisches Protokoll: Märklin CAN-over-Ethernet Spezifikation

Märklin hat das Netzwerk-Protokoll der CS2/CS3 **vollständig und offiziell auf maerklin.de dokumentiert**:

* **Verbindung:** **UDP Datagramme**
  * **Sende-Port (an CS2/CS3):** `15731`
  * **Empfangs-Port (von CS2/CS3):** `15730` (oder TCP auf Port `15731`)
* **Format:** **Festes 13-Byte Frame-Format** (jeder CAN-Bus-Frame wird exakt in 13 Bytes gekapselt).

### Das 13-Byte Paketformat:

```text
Byte 0..3:  CAN Identifier (29-bit, Big Endian / Motorola Format)
            - Bit 28..17: Command / Hash (Opcode)
            - Bit 16:     Response-Bit (0=Command vom Client, 1=Antwort von CS)
            - Bit 15..0:  Hash / Absender-Kennung
Byte 4:     Data Length Code (DLC, 0 bis 8 Bytes)
Byte 5..12: Nutzdaten (8 Bytes, ungenutzte Bytes mit 0x00 gepuffert)
```

---

## 3. Die wichtigsten CAN-Opcodes

| Befehl | CAN-Kommando | DLC | Nutzdaten (Bytes 5..12) |
| :--- | :--- | :--- | :--- |
| **System Stop (Not-Aus)** | `0x0000` (Subcmd `0x00`) | 5 | `[0x00, 0x00, 0x00, 0x00, 0x00]` |
| **System Go (Gleisstrom EIN)** | `0x0000` (Subcmd `0x01`) | 5 | `[0x00, 0x00, 0x00, 0x00, 0x01]` |
| **Lok-Geschwindigkeit** | `0x0008` (Speed) | 6 | `[UID (4 Bytes), SpeedMSB, SpeedLSB]` *(0–1000)* |
| **Lok-Richtung** | `0x000A` (Direction) | 5 | `[UID (4 Bytes), 1=Vor / 2=Zurück]` |
| **Lok-Funktion (F0–F31)** | `0x000C` (Function) | 6 | `[UID (4 Bytes), FnIdx, 1=Ein / 0=Aus]` |
| **Weiche / Zubehör** | `0x0016` (Accessory) | 6 | `[UID (4 Bytes), State (0/1), Power (0/1)]` |
| **S88 Rückmelder-Event** | `0x0022` (S88 Event) | 8 | `[DeviceID, ContactID, State]` |

---

## 4. Lok-Adressierung (Protokoll-Präfixe)

Märklin kodiert die Decoder-Art direkt in die 4-Byte-UID:
* **DCC:** `0xC000` + DCC-Adresse (z. B. DCC #3 = `0xC003`)
* **MM2 (Märklin Motorola):** `0x0000` + MM-Adresse (z. B. MM #24 = `0x0018`)
* **MFX:** Dynamische 32-Bit-UID aus dem MFX-Binding der Central Station.

---

## 5. Implementierung in TrainMaster (`MaerklinCsDriver.ts`)

```typescript
import dgram from 'dgram';
import { ICommandStation, CommandStationCallbacks } from './ICommandStation.js';

export class MaerklinCsDriver implements ICommandStation {
  readonly id = 'maerklin_cs';
  readonly name = 'Märklin Central Station 2 / 3 (UDP)';
  readonly type = 'MAERKLIN_CS' as const;

  private socket: dgram.Socket | null = null;
  private host: string;
  private sendPort = 15731;
  private recvPort = 15730;

  constructor(host = '192.168.1.111') {
    this.host = host;
  }

  private sendCanFrame(cmd: number, dlc: number, data: number[]): void {
    const buf = Buffer.alloc(13, 0);
    // 29-bit CAN ID zusammenbauen
    const canId = (cmd << 17) | 0x0300; // Hash
    buf.writeUInt32BE(canId, 0);
    buf.writeUInt8(dlc, 4);
    for (let i = 0; i < data.length && i < 8; i++) {
      buf.writeUInt8(data[i], 5 + i);
    }
    this.socket?.send(buf, this.sendPort, this.host);
  }
}
```

---

## 6. Akzeptanzkriterien

- [ ] Kommunikation über Port 15731/15730 mit CS2 und CS3 verifiziert.
- [ ] Gleisspannung (GO / STOP) schaltet die Märklin-Gleisbox / Booster korrekt.
- [ ] DCC- und Motorola-Lokomotiven reagieren verzögerungsfrei auf Fahrstufen und F-Tasten.
- [ ] Weichen und Signale (Märklin Digital-Decoder) schalten zuverlässig.
- [ ] s88-Rückmeldungen der CS2/CS3 lösen Blockbelegungen in TrainMaster aus.
