import { Direction, SignalAspect, TurnoutState } from '../types.js';
import { CommandStationCallbacks, ICommandStation } from './ICommandStation.js';

interface SimulatedLoco {
  address: number;
  speed: number;
  direction: Direction;
  functions: Record<number, boolean>;
}

export class VirtualSimulator implements ICommandStation {
  readonly id = 'virtual-simulator';
  readonly name = 'Virtueller DCC-Simulator (Offline)';
  readonly type = 'VIRTUAL' as const;

  private connected: boolean = false;
  private power: boolean = true;
  private eStop: boolean = false;
  private callbacks?: CommandStationCallbacks;

  private locos: Map<number, SimulatedLoco> = new Map();
  private turnouts: Map<number, TurnoutState> = new Map();
  private signals: Map<number, SignalAspect> = new Map();
  private sensors: Map<number, boolean> = new Map();

  async connect(callbacks: CommandStationCallbacks): Promise<boolean> {
    this.callbacks = callbacks;
    this.connected = true;
    this.power = true;
    this.eStop = false;
    this.callbacks.onLog?.('Virtueller DCC-Simulator erfolgreich gestartet. Gleisspannung: EIN.', 'info');
    return true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.callbacks?.onLog?.('Virtueller DCC-Simulator getrennt.', 'warn');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async setPower(active: boolean): Promise<void> {
    this.power = active;
    this.callbacks?.onPowerChanged?.(active);
    this.callbacks?.onLog?.(`Gleisspannung geschaltet: ${active ? 'EIN' : 'AUS'}`, 'info');
  }

  async emergencyStop(address?: number): Promise<void> {
    if (address !== undefined) {
      const loco = this.locos.get(address);
      if (loco) {
        loco.speed = 0;
      }
      this.callbacks?.onLog?.(`Not-Halt für Lok Adresse ${address} ausgelöst!`, 'warn');
    } else {
      this.eStop = true;
      for (const loco of this.locos.values()) {
        loco.speed = 0;
      }
      this.callbacks?.onEmergencyStop?.();
      this.callbacks?.onLog?.('GENERAL-NOTHALT: Alle Züge gestoppt!', 'error');
    }
  }

  async resume(): Promise<void> {
    this.eStop = false;
    this.callbacks?.onLog?.('Not-Halt aufgehoben. Normalbetrieb freigegeben.', 'info');
  }

  async setLocoSpeed(address: number, speed: number, direction: Direction): Promise<void> {
    let loco = this.locos.get(address);
    if (!loco) {
      loco = { address, speed: 0, direction: 'FWD', functions: {} };
      this.locos.set(address, loco);
    }
    loco.speed = Math.max(0, Math.min(128, speed));
    loco.direction = direction;
  }

  async setLocoFunction(address: number, functionIndex: number, active: boolean): Promise<void> {
    let loco = this.locos.get(address);
    if (!loco) {
      loco = { address, speed: 0, direction: 'FWD', functions: {} };
      this.locos.set(address, loco);
    }
    loco.functions[functionIndex] = active;
  }

  async setTurnout(address: number, state: TurnoutState, pulseMs = 250): Promise<void> {
    this.turnouts.set(address, state);
    this.callbacks?.onLog?.(`Weiche #${address} gestellt: ${state === 'STRAIGHT' ? 'Gerade' : 'Abzweig'} (Impuls: ${pulseMs}ms)`, 'info');
  }

  async setSignal(address: number, aspect: SignalAspect): Promise<void> {
    this.signals.set(address, aspect);
    this.callbacks?.onLog?.(`Signal #${address} Begriff: ${aspect}`, 'info');
  }

  triggerVirtualSensor(address: number, active: boolean): void {
    this.sensors.set(address, active);
    this.callbacks?.onSensorChanged(address, active);
    this.callbacks?.onLog?.(`Rückmelder #${address} Zustand: ${active ? 'BELEGT' : 'FREI'}`, 'info');
  }
}
