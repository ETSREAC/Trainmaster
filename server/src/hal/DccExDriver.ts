import net from 'net';
import { SerialPort } from 'serialport';
import { Direction, SignalAspect, TurnoutState } from '../types.js';
import { CommandStationCallbacks, ICommandStation } from './ICommandStation.js';

export class DccExDriver implements ICommandStation {
  readonly id = 'dcc-ex';
  readonly name = 'DCC-EX CommandStation';
  readonly type = 'DCC_EX' as const;

  private connected: boolean = false;
  private callbacks?: CommandStationCallbacks;

  private isSerial: boolean;
  private portOrHost: string;
  private baudRate: number;
  private tcpPort: number;

  private serialInstance: any = null;
  private socketInstance: net.Socket | null = null;
  private rxBuffer = '';

  private isClosing: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(isSerial: boolean, portOrHost: string, baudRate = 115200, tcpPort = 2560) {
    this.isSerial = isSerial;
    this.portOrHost = portOrHost;
    this.baudRate = baudRate;
    this.tcpPort = tcpPort;
  }

  async connect(callbacks: CommandStationCallbacks): Promise<boolean> {
    this.callbacks = callbacks;
    this.isClosing = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.isSerial) {
      return this.connectSerial();
    } else {
      return this.connectTcp();
    }
  }

  private async connectSerial(): Promise<boolean> {
    try {
      this.callbacks?.onLog?.(`[DCC-EX] Öffne seriellen Port ${this.portOrHost} mit ${this.baudRate} Baud...`, 'info');
      this.serialInstance = new SerialPort({
        path: this.portOrHost,
        baudRate: this.baudRate,
        autoOpen: false
      });

      await new Promise<void>((resolve, reject) => {
        this.serialInstance.open((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.connected = true;
      this.callbacks?.onConnectionChanged?.(true);
      this.callbacks?.onLog?.(`[DCC-EX] ✅ Erfolgreich mit serieller Zentrale an ${this.portOrHost} verbunden!`, 'info');

      this.serialInstance.on('data', (chunk: Buffer) => {
        this.handleIncomingData(chunk.toString('utf-8'));
      });

      this.serialInstance.on('error', (err: any) => {
        this.callbacks?.onLog?.(`[DCC-EX] Serieller Fehler: ${err.message}`, 'error');
      });

      this.serialInstance.on('close', () => {
        this.handleDisconnected('Serielle Verbindung geschlossen');
      });

      this.startHeartbeat();
      this.sendRaw('<s>');
      return true;
    } catch (err: any) {
      this.callbacks?.onLog?.(`[DCC-EX] Konnte seriellen Port ${this.portOrHost} nicht öffnen: ${err.message}`, 'error');
      this.handleDisconnected(err.message);
      return false;
    }
  }

  private async connectTcp(): Promise<boolean> {
    try {
      this.callbacks?.onLog?.(`[DCC-EX] Verbinde mit Zentrale TCP an ${this.portOrHost}:${this.tcpPort}...`, 'info');
      this.socketInstance = new net.Socket();

      await new Promise<void>((resolve, reject) => {
        let timer = setTimeout(() => {
          this.socketInstance?.destroy();
          reject(new Error('TCP Verbindung Timeout (3s)'));
        }, 3000);

        this.socketInstance!.connect(this.tcpPort, this.portOrHost, () => {
          clearTimeout(timer);
          resolve();
        });

        this.socketInstance!.once('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      this.connected = true;
      this.socketInstance.setKeepAlive(true, 3000);
      this.callbacks?.onConnectionChanged?.(true);
      this.callbacks?.onLog?.(`[DCC-EX] ✅ Erfolgreich mit Zentrale (${this.portOrHost}:${this.tcpPort}) verbunden!`, 'info');

      this.socketInstance.on('data', (chunk) => {
        this.handleIncomingData(chunk.toString('utf-8'));
      });

      this.socketInstance.on('error', (err) => {
        this.callbacks?.onLog?.(`[DCC-EX] TCP Socket Fehler: ${err.message}`, 'warn');
      });

      this.socketInstance.on('close', () => {
        this.handleDisconnected('TCP Verbindung geschlossen');
      });

      this.startHeartbeat();
      this.sendRaw('<s>');
      return true;
    } catch (err: any) {
      this.callbacks?.onLog?.(`[DCC-EX] Verbindungsfehler zu ${this.portOrHost}:${this.tcpPort}: ${err.message}`, 'warn');
      this.handleDisconnected(err.message);
      return false;
    }
  }

  private handleDisconnected(reason: string): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.stopHeartbeat();

    if (wasConnected) {
      this.callbacks?.onConnectionChanged?.(false);
      this.callbacks?.onLog?.(`[DCC-EX] Verbindung unterbrochen (${reason}). Auto-Reconnect aktiv...`, 'warn');
    }

    if (this.socketInstance) {
      this.socketInstance.removeAllListeners();
      this.socketInstance.destroy();
      this.socketInstance = null;
    }

    if (this.serialInstance) {
      this.serialInstance.removeAllListeners();
      if (this.serialInstance.isOpen) {
        this.serialInstance.close();
      }
      this.serialInstance = null;
    }

    if (!this.isClosing && !this.reconnectTimeout) {
      this.reconnectTimeout = setTimeout(async () => {
        this.reconnectTimeout = null;
        if (!this.isClosing && !this.connected && this.callbacks) {
          this.callbacks.onLog?.('[DCC-EX] 🔄 Starte automatischen Reconnect zur Zentrale...', 'info');
          if (this.isSerial) {
            await this.connectSerial();
          } else {
            await this.connectTcp();
          }
        }
      }, 3500);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.connected && !this.isClosing) {
        this.sendRaw('<s>');
      }
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async disconnect(): Promise<void> {
    this.isClosing = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopHeartbeat();

    if (this.serialInstance && this.serialInstance.isOpen) {
      this.serialInstance.close();
      this.serialInstance = null;
    }
    if (this.socketInstance) {
      this.socketInstance.destroy();
      this.socketInstance = null;
    }
    this.connected = false;
    this.callbacks?.onConnectionChanged?.(false);
    this.callbacks?.onLog?.('[DCC-EX] Zentrale getrennt.', 'warn');
  }

  isConnected(): boolean {
    return this.connected;
  }

  private sendRaw(cmd: string): void {
    const formatted = cmd.startsWith('<') ? `${cmd}\n` : `<${cmd}>\n`;
    try {
      if (this.isSerial && this.serialInstance && this.serialInstance.isOpen) {
        this.serialInstance.write(formatted);
      } else if (this.socketInstance && !this.socketInstance.destroyed && this.socketInstance.writable) {
        this.socketInstance.write(formatted);
      }
    } catch (err: any) {
      this.callbacks?.onLog?.(`[DCC-EX] Sende-Fehler: ${err.message}`, 'error');
    }
  }

  private handleIncomingData(dataStr: string): void {
    this.rxBuffer += dataStr;
    let startIdx: number;
    let endIdx: number;

    while ((startIdx = this.rxBuffer.indexOf('<')) !== -1 && (endIdx = this.rxBuffer.indexOf('>', startIdx)) !== -1) {
      const msg = this.rxBuffer.substring(startIdx + 1, endIdx).trim();
      this.rxBuffer = this.rxBuffer.substring(endIdx + 1);
      this.parseDccExMessage(msg);
    }
  }

  private parseDccExMessage(msg: string): void {
    // Gleisspannung EIN: z.B. <p1 MAIN>, <p1>, <1>
    if (msg.startsWith('p1') || msg === '1') {
      this.callbacks?.onPowerChanged?.(true);
      this.callbacks?.onLog?.('DCC-EX Gleisspannung: EIN', 'info');
    }
    // Gleisspannung AUS: z.B. <p0 MAIN>, <p0>, <0>
    else if (msg.startsWith('p0') || msg === '0') {
      this.callbacks?.onPowerChanged?.(false);
      this.callbacks?.onLog?.('DCC-EX Gleisspannung: AUS', 'warn');
    }
    // Weichen-Rückmeldung: <H ID STATE> (0 = gerade/geschlossen, 1 = abzweig)
    else if (msg.startsWith('H ') || msg.startsWith('h ')) {
      const parts = msg.split(' ');
      if (parts.length >= 3) {
        const addr = parseInt(parts[1], 10);
        const state: TurnoutState = parts[2] === '0' ? 'STRAIGHT' : 'DIVERGENT';
        this.callbacks?.onTurnoutFeedback?.(addr, state);
        this.callbacks?.onLog?.(`[DCC-EX] Weiche #${addr} steht auf: ${state === 'STRAIGHT' ? 'Gerade' : 'Abzweig'}`, 'info');
      }
    }
    // Sensor-Rückmeldung: <Q SENSOR_ID STATE> oder <q SENSOR_ID STATE>
    else if (msg.startsWith('Q ') || msg.startsWith('q ')) {
      const parts = msg.split(' ');
      if (parts.length >= 3) {
        const addr = parseInt(parts[1], 10);
        const state = parts[2] === '1';
        this.callbacks?.onSensorChanged(addr, state);
      }
    }
    // Versions- & Hardware-Kennung: z.B. <iDCC-EX V-5.6.0 ...>
    else if (msg.startsWith('i')) {
      const infoText = msg.substring(1).trim();
      this.callbacks?.onLog?.(`[DCC-EX] Hardware: ${infoText}`, 'info');
    }
  }

  async setPower(active: boolean): Promise<void> {
    this.sendRaw(active ? '<1>' : '<0>');
  }

  async emergencyStop(address?: number): Promise<void> {
    if (address !== undefined) {
      this.sendRaw(`<t 1 ${address} -1 1>`);
    } else {
      this.sendRaw('<->');
    }
  }

  async resume(): Promise<void> {
    this.sendRaw('<1>');
  }

  async setLocoSpeed(address: number, speed: number, direction: Direction): Promise<void> {
    const dirBit = direction === 'FWD' ? 1 : 0;
    this.sendRaw(`<t 1 ${address} ${speed} ${dirBit}>`);
  }

  async setLocoFunction(address: number, functionIndex: number, active: boolean): Promise<void> {
    this.sendRaw(`<F ${address} ${functionIndex} ${active ? 1 : 0}>`);
  }

  async setTurnout(address: number, state: TurnoutState): Promise<void> {
    // In DCC-EX: <T ID THROW> wobei 0 = STRAIGHT (closed), 1 = DIVERGENT (thrown)
    const throwVal = state === 'STRAIGHT' ? 0 : 1;
    this.sendRaw(`<T ${address} ${throwVal}>`);
    // Ergänzend Zubehörbefehl für einfache DCC-Decoder ohne konfigurierte Weichenliste
    this.sendRaw(`<a ${address} ${throwVal}>`);
    this.callbacks?.onLog?.(`[DCC-EX] Weiche #${address} Befehl: ${state === 'STRAIGHT' ? 'Gerade (<T ${address} 0>)' : 'Abzweig (<T ${address} 1>)'}`, 'info');
  }

  async setSignal(address: number, aspect: SignalAspect): Promise<void> {
    this.callbacks?.onLog?.(`DCC-EX Signal #${address} Begriff: ${aspect}`, 'info');
  }
}
