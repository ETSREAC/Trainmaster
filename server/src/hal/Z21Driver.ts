import dgram from 'dgram';
import net from 'net';
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

  private tickTimer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private lastRxTime = 0;
  private lastPower: boolean | null = null;
  private offlineLogged = false;
  private onFirstReply: (() => void) | null = null;
  /** Letzter bekannter Zustand je R-Bus-Modul (8 Eingänge pro Byte) */
  private rbusState: Map<number, number> = new Map();

  private static readonly TICK_MS = 3000;
  /** Die Z21 trennt Clients nach ca. 60 s ohne Nachricht: alle 15 s ein Lebenszeichen senden */
  private static readonly KEEPALIVE_TICKS = 5;
  /** Kommt so lange nichts von der Zentrale, gilt die Verbindung als verloren */
  private static readonly RX_TIMEOUT_MS = 40000;
  private static readonly HANDSHAKE_TIMEOUT_MS = 1500;
  // Broadcast-Flags: 0x1 = Fahren/Schalten/Gleisspannung, 0x2 = R-Bus-Rückmelder
  private static readonly BROADCAST_FLAGS = 0x00000003;

  constructor(host = '192.168.0.111', port = 21105) {
    this.host = host;
    this.port = port;
  }

  /**
   * UDP kennt keine Verbindung. "Verbunden" heißt hier: die Zentrale hat geantwortet.
   * Antwortet sie beim Start nicht, wird im Hintergrund weiter angefragt und der Status
   * wechselt automatisch, sobald sie erreichbar ist.
   */
  async connect(callbacks: CommandStationCallbacks): Promise<boolean> {
    this.callbacks = callbacks;
    try {
      const socket = dgram.createSocket('udp4');
      this.socket = socket;

      socket.on('message', (msg, rinfo) => {
        // Nur Pakete der eingestellten Zentrale annehmen (sofern eine IP eingetragen ist)
        if (net.isIP(this.host) && rinfo.address !== this.host) return;
        this.handleDatagram(msg);
      });

      socket.on('error', (err) => {
        this.callbacks?.onLog?.(`Z21 UDP Fehler: ${err.message}`, 'error');
      });

      this.callbacks.onLog?.(`Z21: suche Zentrale unter ${this.host}:${this.port}...`, 'info');

      const answered = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          this.onFirstReply = null;
          resolve(false);
        }, Z21Driver.HANDSHAKE_TIMEOUT_MS);
        this.onFirstReply = () => {
          clearTimeout(timer);
          resolve(true);
        };
        // Seriennummer abfragen: jede Z21 antwortet darauf
        this.sendPacket(0x0010, Buffer.alloc(0));
      });

      if (this.socket !== socket) return false; // inzwischen getrennt

      if (!answered) {
        this.offlineLogged = true;
        this.callbacks.onLog?.(
          `Z21 antwortet nicht unter ${this.host}:${this.port}. Bitte IP-Adresse und Netzwerk prüfen – es wird weiter versucht.`,
          'warn'
        );
      }

      this.tickCount = 0;
      this.tickTimer = setInterval(() => this.tick(), Z21Driver.TICK_MS);
      return this.connected;
    } catch (err: any) {
      this.callbacks.onLog?.(`Fehler beim Verbinden mit Z21: ${err.message}`, 'error');
      return false;
    }
  }

  private tick(): void {
    if (!this.socket) return;
    this.tickCount++;
    if (!this.connected) {
      // Zentrale (noch) nicht erreichbar: weiter anfragen
      this.sendPacket(0x0010, Buffer.alloc(0));
      return;
    }
    if (Date.now() - this.lastRxTime > Z21Driver.RX_TIMEOUT_MS) {
      this.connected = false;
      this.lastPower = null;
      this.offlineLogged = true;
      this.callbacks?.onConnectionChanged?.(false);
      this.callbacks?.onLog?.('Z21 antwortet nicht mehr. Verbindung unterbrochen, es wird weiter versucht...', 'warn');
      return;
    }
    if (this.tickCount % Z21Driver.KEEPALIVE_TICKS === 0) {
      // Lebenszeichen + aktueller Zustand (Gleisspannung): LAN_X_GET_STATUS
      this.sendXPressNet([0x21, 0x24]);
    }
  }

  private markConnected(): void {
    if (this.connected) return;
    this.connected = true;
    // Rückmeldungen abonnieren und den aktuellen Zustand abholen
    const flags = Buffer.alloc(4);
    flags.writeUInt32LE(Z21Driver.BROADCAST_FLAGS, 0);
    this.sendPacket(0x0050, flags);
    this.sendXPressNet([0x21, 0x24]);
    this.sendPacket(0x0081, Buffer.from([0x00])); // R-Bus Gruppe 0 (Module 1–10)
    this.sendPacket(0x0081, Buffer.from([0x01])); // R-Bus Gruppe 1 (Module 11–20)
    if (this.offlineLogged) {
      this.callbacks?.onLog?.(`Z21 unter ${this.host}:${this.port} ist jetzt erreichbar.`, 'info');
      this.offlineLogged = false;
    }
    this.callbacks?.onConnectionChanged?.(true);
  }

  async disconnect(): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.onFirstReply = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      if (this.connected) {
        // LAN_LOGOFF: die Zentrale gibt den Client-Platz sofort frei
        await new Promise<void>((resolve) => {
          const buf = Buffer.from([0x04, 0x00, 0x30, 0x00]);
          socket.send(buf, this.port, this.host, () => resolve());
        });
      }
      try {
        socket.close();
      } catch {}
    }
    const wasConnected = this.connected;
    this.connected = false;
    this.lastPower = null;
    this.rbusState.clear();
    if (wasConnected) this.callbacks?.onConnectionChanged?.(false);
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

  /** Ein UDP-Datagramm kann mehrere Z21-Pakete hintereinander enthalten. */
  private handleDatagram(msg: Buffer): void {
    let off = 0;
    let valid = false;
    while (msg.length - off >= 4) {
      const len = msg.readUInt16LE(off);
      if (len < 4 || off + len > msg.length) break;
      valid = true;
      this.handleMessage(msg.subarray(off, off + len));
      off += len;
    }
    if (!valid) return;
    this.lastRxTime = Date.now();
    this.markConnected();
    const cb = this.onFirstReply;
    this.onFirstReply = null;
    cb?.();
  }

  private reportPower(on: boolean): void {
    if (this.lastPower === on) return;
    this.lastPower = on;
    this.callbacks?.onPowerChanged?.(on);
    this.callbacks?.onLog?.(`Z21 meldet Gleisspannung: ${on ? 'EIN' : 'AUS'}`, on ? 'info' : 'warn');
  }

  private handleMessage(msg: Buffer): void {
    const header = msg.readUInt16LE(2);

    // LAN_GET_SERIAL_NUMBER (Antwort)
    if (header === 0x0010 && msg.length >= 8) {
      if (!this.connected) {
        this.callbacks?.onLog?.(`Z21 Zentrale erkannt! Seriennummer: ${msg.readUInt32LE(4)}`, 'info');
      }
      return;
    }

    // LAN_RMBUS_DATACHANGED: Gruppenindex + 10 Bytes (je Byte ein Modul mit 8 Eingängen)
    if (header === 0x0080 && msg.length >= 15) {
      const group = msg[4];
      for (let i = 0; i < 10; i++) {
        const module = group * 10 + i;
        const value = msg[5 + i];
        const prev = this.rbusState.get(module) ?? 0;
        if (value === prev) continue;
        this.rbusState.set(module, value);
        for (let bit = 0; bit < 8; bit++) {
          const mask = 1 << bit;
          if ((value & mask) !== (prev & mask)) {
            this.callbacks?.onSensorChanged(module * 8 + bit + 1, (value & mask) !== 0);
          }
        }
      }
      return;
    }

    // X-Bus-Tunnel
    if (header === 0x0040 && msg.length >= 6) {
      const xh = msg[4];
      const db0 = msg[5];
      // LAN_X_BC_TRACK_POWER_OFF / _ON
      if (xh === 0x61 && (db0 === 0x00 || db0 === 0x01)) {
        this.reportPower(db0 === 0x01);
      }
      // LAN_X_BC_TRACK_SHORT_CIRCUIT
      else if (xh === 0x61 && db0 === 0x08) {
        this.callbacks?.onLog?.('Z21 meldet KURZSCHLUSS am Gleis!', 'error');
        this.reportPower(false);
      }
      // LAN_X_BC_STOPPED: Not-Halt an der Zentrale / am Handregler ausgelöst
      else if (xh === 0x81 && db0 === 0x00) {
        this.callbacks?.onEmergencyStop?.();
      }
      // LAN_X_STATUS_CHANGED: Bit 1 = Gleisspannung aus, Bit 2 = Kurzschluss
      else if (xh === 0x62 && db0 === 0x22 && msg.length >= 8) {
        this.reportPower((msg[6] & 0x06) === 0);
      }
      // LAN_X_TURNOUT_INFO: 43 MSB LSB 000000ZZ (01 = Ausgang 1 / Abzweig, 10 = Ausgang 2 / Gerade)
      else if (xh === 0x43 && msg.length >= 9) {
        const address = ((msg[5] << 8) | msg[6]) + 1;
        const zz = msg[7] & 0x03;
        if (zz === 0x01) this.callbacks?.onTurnoutFeedback?.(address, 'DIVERGENT');
        else if (zz === 0x02) this.callbacks?.onTurnoutFeedback?.(address, 'STRAIGHT');
      }
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

  /**
   * Lokadresse nach Z21-Spez. (§4.1): Adr_MSB = (Adr >> 8) & 0x3F, ab Adresse 128
   * zusätzlich | 0xC0 (lange Adresse). Adr_LSB = Adr & 0xFF.
   * Kurze Adressen 1–127 haben Adr_MSB = 0x00.
   */
  static encodeLocoAddress(address: number): [number, number] {
    const msb = ((address >> 8) & 0x3F) | (address >= 128 ? 0xC0 : 0x00);
    return [msb, address & 0xFF];
  }

  async setLocoSpeed(address: number, speed: number, direction: Direction): Promise<void> {
    const [adrMsb, adrLsb] = Z21Driver.encodeLocoAddress(address);

    // 128 Fahrstufen: Bit 7 = Richtung (1=Vor, 0=Zurück), Bit 0-6 = Fahrstufe (0=Halt, 1=Not-Halt, 2-127=Stufen)
    const dirBit = direction === 'FWD' ? 0x80 : 0x00;
    let stepByte = speed === 0 ? 0 : Math.min(127, speed + 1);
    stepByte |= dirBit;

    this.sendXPressNet([0xE4, 0x13, adrMsb, adrLsb, stepByte]);
  }

  async setLocoFunction(address: number, functionIndex: number, active: boolean): Promise<void> {
    const [adrMsb, adrLsb] = Z21Driver.encodeLocoAddress(address);

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
