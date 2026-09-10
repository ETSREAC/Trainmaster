import {
  AppSettings,
  BBTEntry,
  Block,
  DiscoveredEsp,
  Locomotive,
  Route,
  Sensor,
  SerialPortInfo,
  Signal,
  SystemStatus,
  TrackElement,
  Turnout,
  WioNodeInfo,
  WioPacketInfo,
  WSClientAction,
  WSServerMessage,
  LayoutInspectionResult
} from './types.js';

type StateListener = () => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private reconnectTimer?: number;
  private inspectionListeners: Array<(res: LayoutInspectionResult) => void> = [];
  public lastInspectionResult: LayoutInspectionResult | null = null;

  public status: SystemStatus = {
    connected: false,
    commandStationType: 'VIRTUAL',
    trackPower: false,
    emergencyStop: false,
    automaticMode: false,
    log: []
  };

  public locos: Locomotive[] = [];
  public turnouts: Turnout[] = [];
  public signals: Signal[] = [];
  public sensors: Sensor[] = [];
  public blocks: Block[] = [];
  public layout: TrackElement[] = [];
  public routes: Route[] = [];
  public bbt: BBTEntry[] = [];
  public wioNodes: WioNodeInfo[] = [];
  public wioPackets: WioPacketInfo[] = [];
  public discoveredEsps: DiscoveredEsp[] = [];
  public isScanningEsp: boolean = false;
  public settings: AppSettings = {
    commandStation: {
      type: 'VIRTUAL',
      connectionType: 'SERIAL',
      serialPort: 'COM3',
      baudRate: 115200,
      host: '192.168.0.111',
      port: 21105
    },
    scale: 'H0',
    targetCreepMs: 1200,
    ghostDetectionActive: true,
    manualSensorTriggerInRunMode: true
  };
  public serialPorts: SerialPortInfo[] = [];

  private listeners: StateListener[] = [];

  constructor() {
    this.connect();
  }

  public subscribe(fn: StateListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify(): void {
    for (const l of this.listeners) {
      l();
    }
  }

  private connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const wsUrl = `${protocol}//${host}:3001`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.status.connected = true;
      this.notify();
    };

    this.ws.onclose = () => {
      this.status.connected = false;
      this.notify();
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
    };

    this.ws.onerror = () => {
      this.status.connected = false;
      this.notify();
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg: WSServerMessage = JSON.parse(ev.data);
        this.handleMessage(msg);
      } catch (err) {
        console.error('WS Parse Error:', err);
      }
    };
  }

  public send(action: WSClientAction): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(action));
    }
  }

  private handleMessage(msg: WSServerMessage): void {
    switch (msg.type) {
      case 'INITIAL_STATE':
        this.status = msg.payload.status;
        this.locos = msg.payload.locos;
        this.turnouts = msg.payload.turnouts;
        this.signals = msg.payload.signals;
        this.sensors = msg.payload.sensors;
        this.blocks = msg.payload.blocks;
        this.layout = msg.payload.layout;
        this.routes = msg.payload.routes;
        this.bbt = msg.payload.bbt;
        if (msg.payload.wioNodes) {
          this.wioNodes = msg.payload.wioNodes;
        }
        if (msg.payload.wioPackets) {
          this.wioPackets = msg.payload.wioPackets;
        }
        if (msg.payload.settings) {
          this.settings = msg.payload.settings;
        }
        break;

      case 'SETTINGS_UPDATED':
        this.settings = msg.payload;
        break;

      case 'SERIAL_PORTS_LIST':
        this.serialPorts = msg.payload;
        break;

      case 'STATUS_UPDATE':
        this.status = { ...this.status, ...msg.payload };
        break;

      case 'LOCO_UPDATED': {
        const idx = this.locos.findIndex((l) => l.id === msg.payload.id);
        if (idx >= 0) this.locos[idx] = msg.payload;
        else this.locos.push(msg.payload);
        break;
      }

      case 'LOCO_DELETED': {
        this.locos = this.locos.filter((l) => l.id !== msg.payload.locoId);
        break;
      }

      case 'TURNOUT_UPDATED': {
        const idx = this.turnouts.findIndex((t) => t.id === msg.payload.id);
        if (idx >= 0) this.turnouts[idx] = msg.payload;
        else this.turnouts.push(msg.payload);
        break;
      }

      case 'TURNOUT_DELETED': {
        this.turnouts = this.turnouts.filter((t) => t.id !== msg.payload.turnoutId);
        break;
      }

      case 'SIGNAL_UPDATED': {
        const idx = this.signals.findIndex((s) => s.id === msg.payload.id);
        if (idx >= 0) this.signals[idx] = msg.payload;
        else this.signals.push(msg.payload);
        break;
      }

      case 'SIGNAL_DELETED': {
        this.signals = this.signals.filter((s) => s.id !== msg.payload.signalId);
        break;
      }

      case 'BLOCK_UPDATED': {
        const idx = this.blocks.findIndex((b) => b.id === msg.payload.id);
        if (idx >= 0) this.blocks[idx] = msg.payload;
        else this.blocks.push(msg.payload);
        break;
      }

      case 'BLOCK_DELETED': {
        this.blocks = this.blocks.filter((b) => b.id !== msg.payload.blockId);
        break;
      }

      case 'SENSOR_UPDATED': {
        const idx = this.sensors.findIndex((s) => s.id === msg.payload.id);
        if (idx >= 0) this.sensors[idx] = msg.payload;
        else this.sensors.push(msg.payload);
        break;
      }

      case 'SENSOR_DELETED': {
        this.sensors = this.sensors.filter((s) => s.id !== msg.payload.sensorId);
        break;
      }

      case 'LAYOUT_UPDATED': {
        this.layout = msg.payload;
        break;
      }

      case 'ROUTE_UPDATED': {
        const idx = this.routes.findIndex((r) => r.id === msg.payload.id);
        if (idx >= 0) this.routes[idx] = msg.payload;
        else this.routes.push(msg.payload);
        break;
      }

      case 'ROUTES_UPDATED': {
        this.routes = msg.payload;
        break;
      }

      case 'LAYOUT_INSPECTION_RESULT': {
        this.lastInspectionResult = msg.payload;
        this.emitInspection(msg.payload);
        break;
      }

      case 'BBT_UPDATED': {
        const key = (e: BBTEntry) => `${e.locoId}_${e.blockId}_${e.direction}`;
        const idx = this.bbt.findIndex((e) => key(e) === key(msg.payload));
        if (idx >= 0) this.bbt[idx] = msg.payload;
        else this.bbt.push(msg.payload);
        break;
      }

      case 'WIO_NODES_UPDATED': {
        this.wioNodes = msg.payload.nodes;
        this.wioPackets = msg.payload.recentPackets;
        break;
      }

      case 'WIO_SCAN_RESULTS': {
        this.discoveredEsps = msg.payload;
        this.isScanningEsp = false;
        break;
      }

      case 'LOG_MESSAGE': {
        const timeStr = new Date(msg.payload.timestamp).toLocaleTimeString();
        this.status.log.push(`[${timeStr}] ${msg.payload.message}`);
        if (this.status.log.length > 200) this.status.log.shift();
        break;
      }
    }
    this.notify();
  }

  public onInspection(callback: (res: LayoutInspectionResult) => void): () => void {
    this.inspectionListeners.push(callback);
    return () => {
      this.inspectionListeners = this.inspectionListeners.filter((cb) => cb !== callback);
    };
  }

  private emitInspection(res: LayoutInspectionResult): void {
    for (const cb of this.inspectionListeners) {
      try {
        cb(res);
      } catch (err) {
        console.error('Inspection listener error:', err);
      }
    }
  }

  public async triggerEspScan(): Promise<DiscoveredEsp[]> {
    this.isScanningEsp = true;
    this.notify();
    this.send({ type: 'SCAN_WIO_NETWORK' });

    try {
      const host = window.location.hostname || 'localhost';
      const res = await fetch(`http://${host}:3001/api/wio/scan`, { method: 'POST' });
      const data = await res.json();
      if (data && data.devices) {
        this.discoveredEsps = data.devices;
      }
    } catch (e) {
      console.warn('ESP scan fetch fallback error:', e);
    } finally {
      this.isScanningEsp = false;
      this.notify();
    }
    return this.discoveredEsps;
  }
}

export const wsClient = new WSClient();
