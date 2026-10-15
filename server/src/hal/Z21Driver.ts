import dgram from 'dgram';
import { Direction, SignalAspect, TurnoutState } from '../types.js';
import { CommandStationCallbacks, ICommandStation } from './ICommandStation.js';

export class Z21Driver implements ICommandStation {
  readonly id = 'z21';
  readonly name = 'Roco Z21 / z21 start (LAN/WLAN)';
  readonly type = 'Z21' as const;

  private connected: boolean = false;
  private callbacks?: CommandStationCallbacks;
  private host: string;
  private port: number;
  private socket: dgram.Socket | null = null;

  constructor(host = '192.168.0.111', port = 21105) {
    this.host = host;
    this.port = port;
  }

  async connect(callbacks: CommandStationCallbacks): Promise<boolean> {
    this.callbacks = callbacks;
    try {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('message', (msg) => {
        this.handleMessage(msg);
      });

      this.socket.on('error', (err) => {
        this.callbacks?.onLog?.(`Z21 UDP Fehler: ${err.message}`, 'error');
      });

      this.connected = true;
      this.callbacks.onLog?.(`Z21 Treiber aktiv für ${this.host}:${this.port}`, 'info');

      // Seriennummer abfragen zum Test
      this.sendPacket(0x0010, Buffer.alloc(0));
      return true;
    } catch (err: any) {
      this.callbacks.onLog?.(`Fehler beim Verbinden mit Z21: ${err.message}`, 'error');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    this.callbacks?.onLog?.('Z21 getrennt.', 'warn');
  }

  isConnected(): boolean {
    return this.connected;
  }

  private sendPacket(header: number, data: Buffer): void {
    if (!this.socket) return;
    const length = 4 + data.length;
    const buf = Buffer.alloc(length);
    buf.writeUInt16LE(length, 0);
    buf.writeUInt16LE(header, 2);
    data.copy(buf, 4);

    this.socket.send(buf, this.port, this.host, (err) => {
      if (err) {
        this.callbacks?.onLog?.(`Z21 Sende-Fehler: ${err.message}`, 'error');
      }
    });
  }

  private sendXPressNet(db: number[]): void {
    let xor = 0;
    for (const b of db) {
      xor ^= b;
    }
    const data = Buffer.from([...db, xor]);
    this.sendPacket(0x0040, data);
  }

  private handleMessage(msg: Buffer): void {
    if (msg.length < 4) return;
    const header = msg.readUInt16LE(2);

    if (header === 0x0010 && msg.length >= 8) {
      const serial = msg.readUInt32LE(4);
      this.callbacks?.onLog?.(`Z21 Zentrale erkannt! Seriennummer: ${serial}`, 'info');
    }
  }

  async setPower(active: boolean): Promise<void> {
    // 0x21 0x81 = ON, 0x21 0x80 = OFF
    this.sendXPressNet([0x21, active ? 0x81 : 0x80]);
    this.callbacks?.onLog?.(`Z21 Gleisspannung: ${active ? 'EIN' : 'AUS'}`, 'info');
  }

  async emergencyStop(_address?: number): Promise<void> {
    // 0x80 = Not-Halt
    this.sendXPressNet([0x80]);
    this.callbacks?.onLog?.('Z21 General-Nothalt gesendet!', 'error');
  }

  async resume(): Promise<void> {
    this.setPower(true);
  }

  async setLocoSpeed(address: number, speed: number, direction: Direction): Promise<void> {
    const isLong = address >= 100;
    const adrMsb = isLong ? (0xC0 | (address >> 8)) : 0x00;
    const adrLsb = isLong ? (address & 0xFF) : address;

    // 128 Fahrstufen: Bit 7 = Richtung (1=Vor, 0=Zurück), Bit 0-6 = Fahrstufe (0=Halt, 1=Not-Halt, 2-127=Stufen)
    const dirBit = direction === 'FWD' ? 0x80 : 0x00;
    let stepByte = speed === 0 ? 0 : Math.min(127, speed + 1);
    stepByte |= dirBit;

    this.sendXPressNet([0xE4, 0x13, adrMsb, adrLsb, stepByte]);
  }

  async setLocoFunction(address: number, functionIndex: number, active: boolean): Promise<void> {
    const isLong = address >= 100;
    const adrMsb = isLong ? (0xC0 | (address >> 8)) : 0x00;
    const adrLsb = isLong ? (address & 0xFF) : address;

    // CR-14: LAN_X_SET_LOCO_FUNCTION (Z21-Spez. §4.3.1): E4 F8 MSB LSB TTNNNNNN
    // TT: 00 = aus, 01 = ein; NNNNNN = Funktionsindex 0..31
    if (functionIndex < 0 || functionIndex > 31) {
      this.callbacks?.onLog?.(`Z21: Funktion F${functionIndex} wird nicht unterstützt (0-31).`, 'warn');
      return;
    }
    const db3 = ((active ? 0x01 : 0x00) << 6) | (functionIndex & 0x3F);
    this.sendXPressNet([0xE4, 0xF8, adrMsb, adrLsb, db3]);
  }

  async setTurnout(address: number, state: TurnoutState): Promise<void> {
    const adrMsb = (address - 1) >> 8;
    const adrLsb = (address - 1) & 0xFF;
    const posBit = state === 'STRAIGHT' ? 0x01 : 0x00;
    // CR-10: LAN_X_SET_TURNOUT (Z21-Spez. §5.2): DB2 = 10Q0A00P (A = Ausgang aktivieren)
    this.sendXPressNet([0x53, adrMsb, adrLsb, 0x88 | posBit]);
    // Nach kurzem Impuls deaktivieren
    setTimeout(() => {
      this.sendXPressNet([0x53, adrMsb, adrLsb, 0x80 | posBit]);
    }, 150);
  }

  async setSignal(address: number, aspect: SignalAspect): Promise<void> {
    this.callbacks?.onLog?.(`Z21 Signal #${address} Begriff: ${aspect}`, 'info');
  }
}
