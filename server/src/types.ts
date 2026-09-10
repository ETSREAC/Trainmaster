export type Direction = 'FWD' | 'REV';

export type SpeedStepMode = 14 | 28 | 128;

export type TurnoutState = 'STRAIGHT' | 'DIVERGENT';

export type SignalAspect = 'HP0' | 'HP1' | 'HP2' | 'SH0' | 'SH1';

export type SensorType = 'CURRENT' | 'REED' | 'OPTICAL' | 'RAILCOM' | 'WIO' | 'DCC_EX';

export type BlockState = 'FREE' | 'RESERVED' | 'OCCUPIED' | 'GHOST';

export interface Locomotive {
  id: string;
  name: string;
  dccAddress: number;
  speed: number;          // 0 - 128
  targetSpeed: number;    // 0 - 128 (used during BBT ramps)
  direction: Direction;
  functions: Record<number, boolean>; // F0 - F28
  vMin: number;           // Kriechstufe (z.B. 10)
  vMid: number;           // Reisestufe (z.B. 55)
  vMax: number;           // Maximalstufe (z.B. 100)
  lengthCm: number;
  trainType: 'PASSENGER' | 'FREIGHT' | 'COMMUTER' | 'HIGH_SPEED' | 'SHUNTER';
  currentBlockId: string | null;
  image?: string;
  functionLabels?: Record<number, string>;
}

export interface Turnout {
  id: string;
  name: string;
  address: number;
  state: TurnoutState;
  inverted?: boolean;
  locked: boolean;
  lockedByRouteId?: string | null;
}

export type SignalType = 'WIO' | 'DCC_EX' | 'VIRTUAL';

export type SignalKind = 'BLOCK' | 'ENTRY_EXIT' | 'ADVANCED' | 'SHUNTING';

export interface SignalPins {
  red?: number;    // Pin für HP0 (Halt)
  green?: number;  // Pin für HP1 (Fahrt)
  yellow?: number; // Pin für HP2 (Langsamfahrt)
  white?: number;  // Pin für SH1 (Rangierfahrt)
}

export interface Signal {
  id: string;
  name: string;
  address: number;
  aspect: SignalAspect;
  type?: SignalType;
  kind?: SignalKind;    // BLOCK (2-begriffig), ENTRY_EXIT (3-begriffig), ADVANCED (4-begriffig), SHUNTING (Sperrsignal)
  wioUnit?: number;     // ESP32 Unit (z.B. 1)
  wioPins?: SignalPins; // Pins am ESP32
  inverted?: boolean;   // Active Low (Common Anode)
  wioLedIndex?: number; // Optionaler WS2812 NeoPixel Index
}

export function getSignalSupportedAspects(sig: { kind?: SignalKind; wioPins?: SignalPins }): SignalAspect[] {
  const kind = sig.kind || (sig.wioPins?.yellow !== undefined ? 'ENTRY_EXIT' : 'BLOCK');
  switch (kind) {
    case 'BLOCK':
      return ['HP0', 'HP1'];
    case 'ENTRY_EXIT':
      return ['HP0', 'HP1', 'HP2'];
    case 'ADVANCED':
      return ['HP0', 'HP1', 'HP2', 'SH1'];
    case 'SHUNTING':
      return ['SH0', 'SH1'];
    default:
      return ['HP0', 'HP1'];
  }
}

export interface Sensor {
  id: string;
  name: string;
  address: number;
  type: SensorType;
  active: boolean;
  inverted?: boolean;
  lastTriggered?: number;
  wioUnit?: number;
  wioPin?: number;
}

export interface BlockSensors {
  enter: string; // Sensor ID for ENTER event
  in: string;    // Sensor ID for IN event (stop)
}

export type BlockType =
  | 'STATION'        // Hauptbahnhof / Bahnhof (planmäßiger Halt mit Wartezeit & Sounds)
  | 'LOCAL_STATION'  // Regionalbahnhof / Haltepunkt (Halt für Regional, Durchfahrt für ICE & Güter)
  | 'SHADOW_STATION' // Schattenbahnhof (Parken, Zugspeicher, Rotation)
  | 'MAINLINE'       // Freie Strecke (Durchfahrtsblock, kein planmäßiger Halt)
  | 'SIDING';        // Abstellgleis / Rangiergleis

export interface BlockSoundConfig {
  departureFKey?: number;           // DCC F-Taste vor Abfahrt (z. B. 3 für Pfiff)
  departureFKeyDurationMs?: number; // Dauer der Tastenaktivierung in ms (Default 1500)
  departureLeadTimeSec?: number;    // Sekunden vor Abfahrt, wann der Sound ausgelöst wird (Default 3)
  arrivalFKey?: number;             // DCC F-Taste bei Einfahrt
  wioAudioUnit?: number;            // ESP32 Unit für DFPlayer / Lautsprecher
  wioSoundIndex?: number;           // Sound-Track-ID auf dem ESP32
  clientSoundId?: string;           // Optionaler Web Audio Sound-Name im Browser
}

export interface BlockWaitTimer {
  departureTimestamp: number; // Unix-Zeitstempel in ms für geplante Abfahrt
  totalWaitSec: number;        // Gesamte geplante Haltezeit in Sekunden
  status: 'WAITING' | 'DISPATCH_BLOCKED'; // WAITING = Countdown läuft, DISPATCH_BLOCKED = Wartezeit abgelaufen, wartet auf freies Gleis
}

export interface Block {
  id: string;
  name: string;
  type?: BlockType;
  lengthCm: number;
  state: BlockState;
  currentLocoId: string | null;
  reservedForLocoId: string | null;
  direction: '+' | '-';
  sensorsPlus: BlockSensors;  // Fahrrichtung von + nach -
  sensorsMinus: BlockSensors; // Fahrrichtung von - nach +
  minWaitTimeSec?: number;    // Min. Wartezeit in Sekunden (Default 10s)
  maxWaitTimeSec?: number;    // Max. Wartezeit in Sekunden (Default 25s)
  soundConfig?: BlockSoundConfig;
  waitTimer?: BlockWaitTimer | null;
}

export interface BBTEntry {
  locoId: string;
  blockId: string;
  direction: '+' | '-';
  steps: number;        // Anzahl Bremsstufen
  intervalMs: number;   // Zeit pro Bremsstufe in ms
  vStart: number;       // Anfangs-Fahrstufe
  vMin: number;         // Ziel-Kriechfahrstufe
  locked: boolean;      // Automatisches Weiterlernen sperren
  lastRunMetrics?: {
    creepDurationMs: number;
    targetCreepDurationMs: number;
    overranIn: boolean;
    timestamp: number;
  };
}

export interface TrackElement {
  id: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  type: 'STRAIGHT' | 'CURVE' | 'TURNOUT_LEFT' | 'TURNOUT_RIGHT' | 'CROSSING' | 'BUFFER' | 'BLOCK' | 'SIGNAL' | 'SENSOR';
  linkedId?: string; // ID of Turnout, Block, Signal or Sensor
}

export interface RouteTurnoutSetting {
  turnoutId: string;
  state: TurnoutState;
}

export interface Route {
  id: string;
  name: string;
  fromBlockId: string;
  toBlockId: string;
  direction: '+' | '-';
  turnoutSettings: RouteTurnoutSetting[];
  signalSettings?: { signalId: string; aspect: SignalAspect }[];
  active: boolean;
}

export interface CommandStationConfig {
  type: 'VIRTUAL' | 'DCC_EX' | 'Z21';
  connectionType: 'SERIAL' | 'TCP' | 'UDP';
  serialPort?: string;
  baudRate?: number;
  host?: string;
  port?: number;
}

export interface WioConfig {
  enabled: boolean;
  udpPort: number; // Standard 8051 für Rocrail WIO
}

export interface WioNodeInfo {
  unit: number;
  ip: string;
  name?: string;
  type?: string;
  clientver?: string;
  mac?: string;
  connectionType?: 'TCP' | 'UDP' | 'HTTP';
  lastSeen: number;
  packetsReceived: number;
  lastPayload: string;
  pinStates: Record<number, boolean>;
}

export interface DiscoveredEsp {
  ip: string;
  mac?: string;
  name: string;
  title: string;
  isWio: boolean;
  unit?: number;
  webUrl: string;
  tcpConnected: boolean;
  status: 'ONLINE' | 'CONNECTED' | 'DISCOVERED';
}

export interface WioPacketInfo {
  timestamp: number;
  ip: string;
  payload: string;
}

export interface AppSettings {
  commandStation: CommandStationConfig;
  wio?: WioConfig;
  scale: 'H0' | 'N' | 'TT' | 'Z' | '0' | 'G';
  targetCreepMs: number;
  ghostDetectionActive: boolean;
  manualSensorTriggerInRunMode?: boolean;
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  friendlyName?: string;
}

export interface SystemStatus {
  connected: boolean;
  commandStationType: 'VIRTUAL' | 'DCC_EX' | 'Z21';
  trackPower: boolean;
  emergencyStop: boolean;
  automaticMode: boolean; // true = Aquarium/Automatik aktiv
  log: string[];
  settings?: AppSettings;
}

export interface LayoutIssue {
  type: 'OPEN_END' | 'DANGLING_TURNOUT' | 'MISSING_LINK' | 'BLOCK_WITHOUT_SENSOR' | 'INFO';
  message: string;
  x?: number;
  y?: number;
  elementId?: string;
}

export interface BlockAssignmentPreview {
  blockId: string;
  blockName: string;
  sensorsPlus: BlockSensors;
  sensorsMinus: BlockSensors;
  exitSignalPlus?: string;
  exitSignalMinus?: string;
  detectedSensorIds: string[];
}

export interface LayoutInspectionResult {
  valid: boolean;
  issues: LayoutIssue[];
  assignments: BlockAssignmentPreview[];
  generatedRoutes: Route[];
}

export type WSClientAction =
  | { type: 'SET_POWER'; payload: { active: boolean } }
  | { type: 'EMERGENCY_STOP' }
  | { type: 'RESUME_STOP' }
  | { type: 'SET_LOCO_SPEED'; payload: { locoId: string; speed: number; direction?: Direction } }
  | { type: 'SET_LOCO_FUNCTION'; payload: { locoId: string; functionIndex: number; active: boolean } }
  | { type: 'SET_TURNOUT'; payload: { turnoutId: string; state: TurnoutState } }
  | { type: 'CREATE_TURNOUT'; payload: Turnout }
  | { type: 'UPDATE_TURNOUT'; payload: Turnout }
  | { type: 'DELETE_TURNOUT'; payload: { turnoutId: string } }
  | { type: 'SET_SIGNAL'; payload: { signalId: string; aspect: SignalAspect } }
  | { type: 'CREATE_SIGNAL'; payload: Signal }
  | { type: 'UPDATE_SIGNAL'; payload: Signal }
  | { type: 'DELETE_SIGNAL'; payload: { signalId: string } }
  | { type: 'TRIGGER_SENSOR'; payload: { sensorId: string; state?: boolean; autoReset?: boolean } }
  | { type: 'CREATE_SENSOR'; payload: Sensor }
  | { type: 'UPDATE_SENSOR'; payload: Sensor }
  | { type: 'DELETE_SENSOR'; payload: { sensorId: string } }
  | { type: 'CREATE_BLOCK'; payload: Block }
  | { type: 'UPDATE_BLOCK'; payload: Block }
  | { type: 'DELETE_BLOCK'; payload: { blockId: string } }
  | { type: 'FREE_BLOCK'; payload: { blockId: string } }
  | { type: 'ASSIGN_LOCO_TO_BLOCK'; payload: { locoId: string; blockId: string | null } }
  | { type: 'REQUEST_ROUTE'; payload: { fromBlockId: string; toBlockId: string } }
  | { type: 'DISPATCH_BLOCK_NOW'; payload: { blockId: string } }
  | { type: 'TOGGLE_AUTOMATIC_MODE'; payload: { active?: boolean } }
  | { type: 'UPDATE_LAYOUT'; payload: { elements: TrackElement[] } }
  | { type: 'SAVE_BBT_ENTRY'; payload: { entry: BBTEntry } }
  | { type: 'UPDATE_SETTINGS'; payload: AppSettings }
  | { type: 'SCAN_SERIAL_PORTS' }
  | { type: 'SCAN_WIO_NETWORK' }
  | { type: 'CREATE_LOCO'; payload: Locomotive }
  | { type: 'UPDATE_LOCO'; payload: Locomotive }
  | { type: 'DELETE_LOCO'; payload: { locoId: string } }
  | { type: 'AUTO_CREATE_WIO_SENSORS'; payload: { unit: number; count: number } }
  | { type: 'INSPECT_LAYOUT' }
  | { type: 'APPLY_BLOCK_ASSIGNMENTS'; payload: { assignments: BlockAssignmentPreview[] } }
  | { type: 'SAVE_GENERATED_ROUTES'; payload: { routes: Route[]; mode?: 'REPLACE' | 'MERGE' } };

export type WSServerMessage =
  | { type: 'INITIAL_STATE'; payload: { status: SystemStatus; locos: Locomotive[]; turnouts: Turnout[]; signals: Signal[]; sensors: Sensor[]; blocks: Block[]; layout: TrackElement[]; routes: Route[]; bbt: BBTEntry[]; settings: AppSettings; wioNodes?: WioNodeInfo[]; wioPackets?: WioPacketInfo[] } }
  | { type: 'STATUS_UPDATE'; payload: Partial<SystemStatus> }
  | { type: 'SETTINGS_UPDATED'; payload: AppSettings }
  | { type: 'SERIAL_PORTS_LIST'; payload: SerialPortInfo[] }
  | { type: 'WIO_SCAN_RESULTS'; payload: DiscoveredEsp[] }
  | { type: 'LOCO_UPDATED'; payload: Locomotive }
  | { type: 'LOCO_DELETED'; payload: { locoId: string } }
  | { type: 'TURNOUT_UPDATED'; payload: Turnout }
  | { type: 'TURNOUT_DELETED'; payload: { turnoutId: string } }
  | { type: 'SIGNAL_UPDATED'; payload: Signal }
  | { type: 'SIGNAL_DELETED'; payload: { signalId: string } }
  | { type: 'SENSOR_UPDATED'; payload: Sensor }
  | { type: 'SENSOR_DELETED'; payload: { sensorId: string } }
  | { type: 'BLOCK_UPDATED'; payload: Block }
  | { type: 'BLOCK_DELETED'; payload: { blockId: string } }
  | { type: 'ROUTE_UPDATED'; payload: Route }
  | { type: 'ROUTES_UPDATED'; payload: Route[] }
  | { type: 'LAYOUT_UPDATED'; payload: TrackElement[] }
  | { type: 'BBT_UPDATED'; payload: BBTEntry }
  | { type: 'WIO_NODES_UPDATED'; payload: { nodes: WioNodeInfo[]; recentPackets: WioPacketInfo[] } }
  | { type: 'LOG_MESSAGE'; payload: { message: string; timestamp: number; level: 'info' | 'warn' | 'error' } }
  | { type: 'LAYOUT_INSPECTION_RESULT'; payload: LayoutInspectionResult }
  | { type: 'PLAY_SOUND'; payload: { blockId: string; soundType: 'DEPARTURE' | 'ARRIVAL'; clientSoundId?: string } };



