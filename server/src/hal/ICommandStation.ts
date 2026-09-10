import { Direction, SignalAspect, TurnoutState } from '../types.js';

export interface CommandStationCallbacks {
  onSensorChanged: (sensorAddress: number, active: boolean) => void;
  onLocoIdentified?: (locoAddress: number, blockSensorAddress: number) => void; // RailCom
  onPowerChanged?: (power: boolean) => void;
  onEmergencyStop?: () => void;
  onConnectionChanged?: (connected: boolean) => void;
  onTurnoutFeedback?: (address: number, state: TurnoutState) => void;
  onLog?: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

export interface ICommandStation {
  readonly id: string;
  readonly name: string;
  readonly type: 'VIRTUAL' | 'DCC_EX' | 'Z21';

  connect(callbacks: CommandStationCallbacks): Promise<boolean>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Gleisspannung & Not-Halt
  setPower(active: boolean): Promise<void>;
  emergencyStop(address?: number): Promise<void>;
  resume(): Promise<void>;

  // Lokomotiv-Befehle
  setLocoSpeed(address: number, speed: number, direction: Direction): Promise<void>;
  setLocoFunction(address: number, functionIndex: number, active: boolean): Promise<void>;

  // Zubehör (Weichen, Signale, Entkuppler)
  setTurnout(address: number, state: TurnoutState, pulseMs?: number): Promise<void>;
  setSignal(address: number, aspect: SignalAspect): Promise<void>;

  // Simulation / Test Helper
  triggerVirtualSensor?(address: number, active: boolean): void;
}
