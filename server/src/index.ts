import http from 'http';
import net from 'net';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { StorageManager } from './storage/StorageManager.js';
import { VirtualSimulator } from './hal/VirtualSimulator.js';
import { DccExDriver } from './hal/DccExDriver.js';
import { Z21Driver } from './hal/Z21Driver.js';
import { ICommandStation, CommandStationCallbacks } from './hal/ICommandStation.js';
import { BlockManager } from './engine/BlockManager.js';
import { TurnoutManager } from './engine/TurnoutManager.js';
import { LocoManager } from './engine/LocoManager.js';
import { BBTEngine } from './engine/BBTEngine.js';
import { RouteEngine } from './engine/RouteEngine.js';
import { TrackTopology } from './engine/TrackTopology.js';
import { RouteGenerator } from './engine/RouteGenerator.js';
import { AmbientLightingEngine } from './engine/AmbientLightingEngine.js';
import { SplitBlockEngine } from './engine/SplitBlockEngine.js';
import { WioDriver, WioSensorEvent } from './hal/WioDriver.js';
import {
  AppSettings,
  CommandStationConfig,
  SerialPortInfo,
  SystemStatus,
  SignalAspect,
  WSClientAction,
  WSServerMessage,
  LayoutInspectionResult,
  Route,
  TurnoutState,
  getSignalSupportedAspects
} from './types.js';

import { SerialPort } from 'serialport';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

const app = express();
// TM-01: CORS-Einschränkung auf Localhost, LAN & mDNS
const allowedOrigins = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
  /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/,
  /^http:\/\/.*\.local(:\d+)?$/
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some((pattern) => pattern.test(origin));
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[Security] Abgewiesene CORS-Anfrage von unzulässigem Origin: ${origin}`);
      callback(new Error('CORS Origin not allowed'));
    }
  }
}));
app.use(express.json());

const server = http.createServer(app);

// TM-03: maxPayload (2MB) gegen Memory-DoS & unhandled error handler
const wss = new WebSocketServer({ 
  server,
  maxPayload: 2 * 1024 * 1024
});

wss.on('error', (err) => {
  console.error('[WSS] Globaler WebSocket-Server-Fehler abgefangen:', err);
});

// Daten & Einstellungen laden
const storage = new StorageManager();
const rawData = storage.loadData();
const data = storage.ensureSettings(rawData);

// System-Status
const status: SystemStatus = {
  connected: true,
  commandStationType: data.settings.commandStation.type,
  trackPower: true,
  emergencyStop: false,
  automaticMode: false,
  log: [],
  settings: data.settings
};

function broadcast(msg: WSServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function addLog(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const timestamp = Date.now();
  const timeStr = new Date(timestamp).toLocaleTimeString();
  console.log(`[${timeStr}] [${level.toUpperCase()}] ${message}`);
  status.log.push(`[${timeStr}] ${message}`);
  if (status.log.length > 200) status.log.shift();
  broadcast({ type: 'LOG_MESSAGE', payload: { message, timestamp, level } });
}

// Hardware Driver Variable
let hal: ICommandStation = new VirtualSimulator();

const halCallbacks: CommandStationCallbacks = {
  onSensorChanged: (addr, active) => {
    const s = data.sensors.find((x) => x.address === addr);
    if (s) {
      const effectiveState = s.inverted ? !active : active;
      triggerSensor(s.id, effectiveState, false, true);
    }
  },
  onEmergencyStop: () => {
    triggerEmergencyStop();
  },
  onPowerChanged: (power) => {
    const wasOn = status.trackPower;
    status.trackPower = power;
    broadcast({ type: 'STATUS_UPDATE', payload: { trackPower: power } });
    // Funktionen nur beim echten Wechsel AUS -> EIN neu senden, nicht bei jeder Statusmeldung
    if (power && !wasOn) {
      syncAllLocoFunctionsToHardware();
    }
  },
  onConnectionChanged: (connected) => {
    const wasConnected = status.connected;
    status.connected = connected;
    broadcast({ type: 'STATUS_UPDATE', payload: { connected } });
    // Nach (Wieder-)Verbindung, z. B. Neustart der Zentrale: Lokfunktionen wiederherstellen
    if (connected && !wasConnected) {
      syncAllLocoFunctionsToHardware();
    }
  },
  onTurnoutFeedback: (address, state) => {
    const to = data.turnouts.find((t) => t.address === address);
    if (to) {
      const effectiveState = to.inverted ? (state === 'STRAIGHT' ? 'DIVERGENT' : 'STRAIGHT') : state;
      to.state = effectiveState;
      broadcast({ type: 'TURNOUT_UPDATED', payload: to });
    }
  },
  onLog: addLog
};

async function applyCommandStation(cfg: CommandStationConfig): Promise<void> {
  addLog(`Wechsle Zentrale zu: ${cfg.type} (${cfg.connectionType})...`, 'info');
  if (hal) {
    await hal.disconnect();
  }

  if (cfg.type === 'VIRTUAL') {
    hal = new VirtualSimulator();
  } else if (cfg.type === 'DCC_EX') {
    const isSerial = cfg.connectionType === 'SERIAL';
    const portOrHost = isSerial ? (cfg.serialPort || 'COM3') : (cfg.host || '192.168.4.1');
    hal = new DccExDriver(isSerial, portOrHost, cfg.baudRate || 115200, cfg.port || 2560);
  } else if (cfg.type === 'Z21') {
    hal = new Z21Driver(cfg.host || '192.168.0.111', cfg.port || 21105);
  }

  const ok = await hal.connect(halCallbacks);
  status.connected = ok;
  status.commandStationType = cfg.type;
  broadcast({ type: 'STATUS_UPDATE', payload: { connected: ok, commandStationType: cfg.type } });
  if (ok && status.trackPower) {
    syncAllLocoFunctionsToHardware();
  }
}

// Core Engines
let locoManager: LocoManager;
let turnoutManager: TurnoutManager;
let blockManager: BlockManager;
let bbtEngine: BBTEngine;
let routeEngine: RouteEngine;
let lightingEngine: AmbientLightingEngine;
let splitEngine: SplitBlockEngine;

locoManager = new LocoManager(data.locos, {
  onLocoUpdated: (loco) => {
    data.locos = locoManager.getAllLocos();
    saveAllData();
    broadcast({ type: 'LOCO_UPDATED', payload: loco });
  },
  onLocoDeleted: (locoId) => {
    data.locos = locoManager.getAllLocos();
    saveAllData();
    broadcast({ type: 'LOCO_DELETED', payload: { locoId } });
  },
  onSpeedChanged: (loco) => {
    splitEngine?.notifySpeed(loco.id, loco.speed); // 50/50-Geschwindigkeitsmessung
    if (status.emergencyStop && loco.speed > 0) {
      addLog(`[Not-Halt] Fahrbefehl für ${loco.name} (Speed: ${loco.speed}) blockiert, da Not-Halt aktiv ist!`, 'warn');
      return;
    }
    hal.setLocoSpeed(loco.dccAddress, loco.speed, loco.direction);
  },
  onFunctionChanged: (loco, fnIdx, active) => {
    hal.setLocoFunction(loco.dccAddress, fnIdx, active);
  },
  onLog: addLog
});

function syncAllLocoFunctionsToHardware(): void {
  if (!hal || !locoManager || !status.connected || !status.trackPower) return;
  for (const loco of locoManager.getAllLocos()) {
    for (const [fnStr, active] of Object.entries(loco.functions)) {
      const fnIdx = parseInt(fnStr, 10);
      if (!isNaN(fnIdx) && active) {
        hal.setLocoFunction(loco.dccAddress, fnIdx, true);
      }
    }
  }
}

turnoutManager = new TurnoutManager(data.turnouts, {
  onTurnoutUpdated: (to) => {
    broadcast({ type: 'TURNOUT_UPDATED', payload: to });
    const effectiveState = to.inverted ? (to.state === 'STRAIGHT' ? 'DIVERGENT' : 'STRAIGHT') : to.state;
    hal.setTurnout(to.address, effectiveState);
  },
  onLog: addLog
});

bbtEngine = new BBTEngine(data.bbt, {
  onSpeedStep: (locoId, speed) => {
    // CR-02: Während Not-Halt darf keine Rampe den Lokzustand wieder erhöhen
    if (status.emergencyStop && speed > 0) return;
    locoManager.setSpeed(locoId, speed);
  },
  onBBTUpdated: (entry) => {
    data.bbt = bbtEngine.getAllEntries();
    saveAllData();
    broadcast({ type: 'BBT_UPDATED', payload: entry });
  },
  onLog: addLog
});
// 50/50-Gleisaufteilung: Halteplan nach Zuglänge, Ende = virtueller IN
splitEngine = new SplitBlockEngine({
  onSpeedStep: (locoId, speed) => {
    if (status.emergencyStop && speed > 0) return;
    locoManager.setSpeed(locoId, speed);
  },
  onVirtualIn: (locoId, blockId) => {
    if (status.emergencyStop) return;
    const loco = locoManager.getLoco(locoId);
    if (loco) blockManager.triggerVirtualIn(blockId, loco);
  },
  onLog: addLog
});

// CR-19: Gespeicherte Ziel-Kriechzeit beim Start übernehmen
if (typeof data.settings.targetCreepMs === 'number' && data.settings.targetCreepMs > 0) {
  bbtEngine.targetCreepDurationMs = data.settings.targetCreepMs;
}

blockManager = new BlockManager(data.blocks, {
  onBlockUpdated: (block) => {
    data.blocks = blockManager.getAllBlocks();
    saveAllData();
    broadcast({ type: 'BLOCK_UPDATED', payload: block });
  },
  onEnterTriggered: (block, loco) => {
    locoManager.setLocoBlock(loco.id, block.id);
    data.locos = locoManager.getAllLocos();
    data.blocks = blockManager.getAllBlocks();
    saveAllData();
    // 50/50: Langzug fährt ohne Bremsung bis Melder B; Wiederholungs-/Prell-Ereignisse starten nichts neu
    const split = splitEngine.onFirstSensor(block, loco, block.direction);
    if (split.mode === 'SPLIT' && (split.duplicate || split.target === 'SIGNAL')) return;
    bbtEngine.startBraking(loco, block.id, block.direction);
  },
  onSplitSecondSensor: (block, loco, direction) => {
    // BBT-Profil aus der ersten Hälfte lernen lassen, ohne die Lok anzuhalten
    bbtEngine.handleInEvent(loco, block.id, direction, { stop: false });
    const handled = splitEngine.onSecondSensor(block, loco, direction, bbtEngine.getEntry(loco.id, block.id, direction));
    if (handled) {
      locoManager.setLocoBlock(loco.id, block.id);
      data.blocks = blockManager.getAllBlocks();
      saveAllData();
    }
    return handled;
  },
  onInTriggered: (block, loco) => {
    locoManager.setLocoBlock(loco.id, block.id);
    bbtEngine.handleInEvent(loco, block.id, block.direction);
    routeEngine.releaseRoute(block.id);
    routeEngine.notifyTrainArrival(block.id, loco.id);
    data.locos = locoManager.getAllLocos();
    data.blocks = blockManager.getAllBlocks();
    saveAllData();
  },
  onGhostDetected: () => {
    if (data.settings.ghostDetectionActive) {
      triggerEmergencyStop();
    } else {
      addLog('Geisterzug erkannt, Not-Halt jedoch in den Einstellungen deaktiviert.', 'warn');
    }
  },
  isAutomaticMode: () => (routeEngine ? routeEngine.isAutomaticMode() : false),
  isBlockDeparting: (blockId) => (routeEngine ? routeEngine.isBlockDeparting(blockId) : false),
  isSensorInActiveRoute: (sensorId) => (routeEngine ? routeEngine.isSensorInActiveRoute(sensorId) : false),
  isAnyRouteActive: () => (routeEngine ? routeEngine.isAnyRouteActive() : false),
  onLog: addLog
});

function setSignalState(sig: (typeof data.signals)[0], aspect: SignalAspect): void {
  const supported = getSignalSupportedAspects(sig);
  let effectiveAspect = aspect;

  // Wenn ein 2-begriffiges Blocksignal kein HP2 (Gelb) oder SH1 (Weiß) unterstützt -> auf HP1 mappen
  if (!supported.includes(effectiveAspect)) {
    if (effectiveAspect === 'HP2' && supported.includes('HP1')) {
      effectiveAspect = 'HP1';
    } else if (effectiveAspect === 'SH1' && supported.includes('HP1')) {
      effectiveAspect = 'HP1';
    } else if (supported.length > 0) {
      effectiveAspect = supported[0];
    }
  }

  sig.aspect = effectiveAspect;
  if (sig.type === 'WIO' || (!sig.type && wioDriver)) {
    wioDriver?.sendSignalCommand(sig, effectiveAspect);
  }
  hal.setSignal?.(sig.address, effectiveAspect);
  saveAllData();
  broadcast({ type: 'SIGNAL_UPDATED', payload: sig });
  addLog(`Signal "${sig.name}" geschaltet auf Begriff ${effectiveAspect}.`, 'info');
}

routeEngine = new RouteEngine(
  data.routes,
  blockManager,
  turnoutManager,
  locoManager,
  {
    onRouteUpdated: (route) => {
      broadcast({ type: 'ROUTE_UPDATED', payload: route });
    },
    onBlockUpdated: (block) => {
      broadcast({ type: 'BLOCK_UPDATED', payload: block });
    },
    onSignalSet: (signalId, aspect) => {
      const sig = data.signals.find((s) => s.id === signalId);
      if (sig) {
        setSignalState(sig, aspect);
      }
    },
    onSoundTriggered: (block, soundType) => {
      broadcast({
        type: 'PLAY_SOUND',
        payload: {
          blockId: block.id,
          soundType,
          clientSoundId: block.soundConfig?.clientSoundId || 'whistle'
        }
      });
    },
    isEmergencyStop: () => status.emergencyStop,
    isBlockSensorsConfigured: (blockId, direction) => {
      const b = blockManager.getBlock(blockId);
      if (!b) return false;
      const sens = direction === '+' ? b.sensorsPlus : b.sensorsMinus;
      const enterExists = data.sensors.some((s) => s.id === sens.enter);
      const inExists = data.sensors.some((s) => s.id === sens.in);
      return enterExists && inExists;
    },
    onLog: addLog
  }
);

lightingEngine = new AmbientLightingEngine(data.settings.ambientLighting, {
  onConfigUpdated: (cfg, saveToDisk = true) => {
    data.settings.ambientLighting = cfg;
    if (saveToDisk) {
      saveAllData();
    }
    broadcast({ type: 'LIGHTING_CONFIG_UPDATED', payload: cfg });
  },
  onLightningStrike: (thunderDelayMs) => {
    broadcast({ type: 'LIGHTNING_STRIKE', payload: { thunderDelayMs } });
    addLog('[Raumlicht] ⚡ Gewitterblitz gezündet (Test 1)!', 'info');
  },
  onLog: addLog
});

// Virtuelle Züge simulieren: automatisches Weiterfahren bei aktiver Fahrstraße
const activeSimulations = new Set<string>();

setInterval(() => {
  if (status.emergencyStop || !status.trackPower) return;
  // Nur im Virtual-Modus simulieren wir die Sensoren automatisch
  if (status.commandStationType !== 'VIRTUAL') return;

  for (const route of routeEngine.getAllRoutes()) {
    if (route.active && !activeSimulations.has(route.id)) {
      const toBlock = blockManager.getBlock(route.toBlockId);
      if (!toBlock) continue;

      activeSimulations.add(route.id);

      // Simuliere ENTER nach 2.5s
      setTimeout(() => {
        if (!route.active) {
          activeSimulations.delete(route.id);
          return;
        }
        const enterSensorId = toBlock.direction === '+' ? toBlock.sensorsPlus.enter : toBlock.sensorsMinus.enter;
        if (enterSensorId) {
          triggerSensor(enterSensorId, true, true);
        }

        // Simuliere IN nach weiteren 3.0s
        setTimeout(() => {
          activeSimulations.delete(route.id);
          if (!route.active) return;
          const inSensorId = toBlock.direction === '+' ? toBlock.sensorsPlus.in : toBlock.sensorsMinus.in;
          if (inSensorId) {
            triggerSensor(inSensorId, true, true);
          }
        }, 3000);
      }, 2500);
    }
  }
}, 500);

function triggerSensor(sensorId: string, state: boolean, autoReset = false, fromHal = false): void {
  const sensor = data.sensors.find((s) => s.id === sensorId);
  if (sensor) {
    sensor.active = state;
    sensor.lastTriggered = Date.now();
    broadcast({ type: 'SENSOR_UPDATED', payload: sensor });
    if (!fromHal) {
      hal.triggerVirtualSensor?.(sensor.address, state);
    }
  }
  blockManager.handleSensorTrigger(sensorId, state, (id) => locoManager.getLoco(id));

  if (state && autoReset) {
    setTimeout(() => {
      if (sensor) {
        sensor.active = false;
        broadcast({ type: 'SENSOR_UPDATED', payload: sensor });
        blockManager.handleSensorTrigger(sensorId, false, (id) => locoManager.getLoco(id));
      }
    }, 500);
  }
}

function handleWioEvent(event: WioSensorEvent): void {
  let sensor: (typeof data.sensors)[0] | undefined;

  // 1. Suche nach direkter ID
  if (event.id) {
    sensor = data.sensors.find((s) => s.id === event.id);
  }
  // 2. Suche nach WIO Unit + Pin
  if (!sensor && event.unit !== undefined && event.pin !== undefined) {
    sensor = data.sensors.find((s) => s.type === 'WIO' && s.wioUnit === event.unit && s.wioPin === event.pin);
  }
  // 3. Suche nach Adresse
  if (!sensor && event.address !== undefined) {
    sensor = data.sensors.find((s) => s.address === event.address);
  }

  if (sensor) {
    const effectiveState = sensor.inverted ? !event.state : event.state;
    // CR-13: Zustandsabgleich nach Verbindung nur bei tatsächlicher Abweichung weiterverarbeiten
    if (event.snapshot && !!sensor.active === effectiveState) {
      return;
    }
    addLog(
      `[WIO] ESP32 Rückmeldung: "${sensor.name}" (${sensor.id}) -> ${effectiveState ? 'BELEGT' : 'FREI'}${event.sourceIp ? ` von ${event.sourceIp}` : ''}`,
      'info'
    );
    triggerSensor(sensor.id, effectiveState, false);
  } else {
    addLog(
      `[WIO] Empfang für unkonfigurierten Sensor: Unit=${event.unit ?? '?'}, Pin=${event.pin ?? '?'}, Addr=${event.address ?? '?'}, ID=${event.id ?? '?'} (Status: ${event.state ? '1' : '0'})`,
      'warn'
    );
  }
}

// WIO Driver initialisieren & starten
let wioDriver = new WioDriver(data.settings.wio?.udpPort || 8051, {
  onSensorTriggered: handleWioEvent,
  onNodeUpdated: (_node) => {
    broadcast({
      type: 'WIO_NODES_UPDATED',
      payload: {
        nodes: wioDriver.getDiscoveredNodes(),
        recentPackets: wioDriver.getRecentPackets()
      }
    });
  },
  onLog: addLog
});

if (data.settings.wio?.enabled !== false) {
  wioDriver.start();
}

function triggerEmergencyStop(): void {
  if (status.emergencyStop) return;
  status.emergencyStop = true;
  status.automaticMode = false;
  hal.emergencyStop();
  bbtEngine.cancelAll(); // CR-02
  splitEngine.cancelAll(); // 50/50-Haltepläne abbrechen, kein virtueller IN
  locoManager.emergencyStopAll();
  if (routeEngine) {
    routeEngine.toggleAutomaticMode(false);
    routeEngine.resetActiveRoutes();
  }
  broadcast({ type: 'STATUS_UPDATE', payload: { emergencyStop: true, automaticMode: false } });
  addLog('GENERAL-NOTHALT AKTIVIERT! Automatikbetrieb sofort gestoppt.', 'error');
}

function resumeStop(): void {
  if (!status.emergencyStop) return;
  status.emergencyStop = false;
  hal.resume();
  broadcast({ type: 'STATUS_UPDATE', payload: { emergencyStop: false } });
  addLog('Not-Halt aufgehoben. Normalbetrieb aktiv.', 'info');
}

function inspectLayout(): LayoutInspectionResult {
  const topology = new TrackTopology(data.layout);
  const issues = topology.validateLayout(
    blockManager.getAllBlocks(),
    turnoutManager.getAllTurnouts(),
    data.signals,
    data.sensors
  );
  const assignments = topology.autoAssignBlocks(
    blockManager.getAllBlocks(),
    data.signals,
    data.sensors
  );
  const generator = new RouteGenerator(
    topology,
    blockManager.getAllBlocks(),
    turnoutManager.getAllTurnouts(),
    data.signals
  );
  const generatedRoutes = generator.generateAllRoutes();
  const valid = issues.filter((i) => i.type === 'OPEN_END' || i.type === 'MISSING_LINK').length === 0;

  return {
    valid,
    issues,
    assignments,
    generatedRoutes
  };
}

// Initiale Zentrale starten
applyCommandStation(data.settings.commandStation);

// WebSocket Verbindungen
wss.on('connection', (ws, req) => {
  // TM-03: Socket-Fehlerbehandlung (verhindert ungefangene Abstürze bei ungültigen Frames wie Bad UTF-8)
  ws.on('error', (err) => {
    console.warn('[WSS] Client-Socket-Fehler abgefangen:', err.message);
  });

  // TM-01: WebSocket Origin-Validierung
  const origin = req?.headers?.origin;
  if (origin) {
    try {
      const parsedUrl = new URL(origin);
      const host = parsedUrl.hostname;
      const isAllowedHost = 
        host === 'localhost' || 
        host === '127.0.0.1' || 
        host.startsWith('192.168.') || 
        host.startsWith('10.') || 
        (host.startsWith('172.') && parseInt(host.split('.')[1], 10) >= 16 && parseInt(host.split('.')[1], 10) <= 31) ||
        host.endsWith('.local');
      if (!isAllowedHost) {
        console.warn(`[WSS] Abgewiesene Verbindung von unzulässigem Origin: ${origin}`);
        ws.close(1008, 'Origin not allowed');
        return;
      }
    } catch {
      ws.close(1008, 'Invalid Origin');
      return;
    }
  }

  const isThrottle = req?.url?.includes('throttle') || req?.url?.includes('hmi');
  const initialMsg: WSServerMessage = {
    type: 'INITIAL_STATE',
    payload: {
      status,
      locos: locoManager.getAllLocos(),
      turnouts: isThrottle ? [] : turnoutManager.getAllTurnouts(),
      signals: isThrottle ? [] : data.signals,
      sensors: isThrottle ? [] : data.sensors,
      blocks: isThrottle ? [] : blockManager.getAllBlocks(),
      layout: isThrottle ? [] : data.layout,
      routes: isThrottle ? [] : routeEngine.getAllRoutes(),
      bbt: isThrottle ? [] : bbtEngine.getAllEntries(),
      settings: data.settings,
      wioNodes: isThrottle ? [] : wioDriver.getDiscoveredNodes(),
      wioPackets: isThrottle ? [] : wioDriver.getRecentPackets()
    }
  };
  ws.send(JSON.stringify(initialMsg));

  ws.on('message', async (raw) => {
    try {
      const action: WSClientAction = JSON.parse(raw.toString());
      switch (action.type) {
        case 'SET_POWER':
          status.trackPower = action.payload.active;
          hal.setPower(action.payload.active);
          broadcast({ type: 'STATUS_UPDATE', payload: { trackPower: status.trackPower } });
          if (status.trackPower) {
            syncAllLocoFunctionsToHardware();
          }
          break;

        case 'EMERGENCY_STOP':
          triggerEmergencyStop();
          break;

        case 'RESUME_STOP':
          resumeStop();
          break;

        case 'SET_LOCO_SPEED':
          locoManager.setSpeed(action.payload.locoId, action.payload.speed, action.payload.direction);
          break;

        case 'SET_LOCO_FUNCTION':
          locoManager.setFunction(action.payload.locoId, action.payload.functionIndex, action.payload.active);
          break;

        case 'SET_TURNOUT': {
          const rawState = action.payload.state;
          const targetState: TurnoutState = (rawState === 'TURNOUT' || rawState === 'DIVERGENT') ? 'DIVERGENT' : 'STRAIGHT';
          turnoutManager.setTurnoutState(action.payload.turnoutId, targetState);
          break;
        }

        case 'SET_SIGNAL':
        case 'SET_SIGNAL_ASPECT': {
          const sig = data.signals.find((s) => s.id === action.payload.signalId);
          if (sig) {
            setSignalState(sig, action.payload.aspect);
          }
          break;
        }

        case 'CREATE_SIGNAL': {
          const s = action.payload;
          if (!s.id) s.id = `sig-${Date.now()}`;
          data.signals.push(s);
          saveAllData();
          broadcast({ type: 'SIGNAL_UPDATED', payload: s });
          addLog(`Signal "${s.name}" (Adr: #${s.address}, Typ: ${s.type || 'WIO'}) angelegt.`, 'info');
          break;
        }

        case 'UPDATE_SIGNAL': {
          const s = action.payload;
          const idx = data.signals.findIndex((x) => x.id === s.id);
          if (idx >= 0) {
            data.signals[idx] = s;
            saveAllData();
            broadcast({ type: 'SIGNAL_UPDATED', payload: s });
            addLog(`Signal "${s.name}" aktualisiert.`, 'info');
          }
          break;
        }

        case 'DELETE_SIGNAL': {
          const { signalId } = action.payload;
          data.signals = data.signals.filter((s) => s.id !== signalId);
          saveAllData();
          broadcast({ type: 'SIGNAL_DELETED', payload: { signalId } });
          addLog(`Signal #${signalId} gelöscht.`, 'warn');
          break;
        }

        case 'TRIGGER_SENSOR': {
          const { sensorId, state, active, autoReset } = action.payload;
          const sensor = data.sensors.find((s) => s.id === sensorId);
          if (sensor) {
            const targetState = state !== undefined ? state : (active !== undefined ? active : !sensor.active);
            const reset = autoReset !== undefined ? autoReset : (targetState === true);
            triggerSensor(sensorId, targetState, reset);
            addLog(`⚡ Rückmelder "${sensor.name}" manuell ausgelöst (${targetState ? 'BELEGT' : 'FREI'}${reset ? ' - Impuls' : ''}).`, 'info');
          }
          break;
        }

        case 'CREATE_SENSOR': {
          const s = action.payload;
          if (!s.id) s.id = `sens-${Date.now()}`;
          data.sensors.push(s);
          saveAllData();
          broadcast({ type: 'SENSOR_UPDATED', payload: s });
          addLog(`Sensor "${s.name}" (Adr: #${s.address}, Typ: ${s.type}) hinzugefügt.`, 'info');
          break;
        }

        case 'UPDATE_SENSOR': {
          const s = action.payload;
          const idx = data.sensors.findIndex((x) => x.id === s.id);
          if (idx >= 0) {
            data.sensors[idx] = s;
            saveAllData();
            broadcast({ type: 'SENSOR_UPDATED', payload: s });
            addLog(`Sensor "${s.name}" aktualisiert.`, 'info');
          }
          break;
        }

        case 'DELETE_SENSOR': {
          const { sensorId } = action.payload;
          data.sensors = data.sensors.filter((s) => s.id !== sensorId);
          for (const b of blockManager.getAllBlocks()) {
            let modified = false;
            if (b.sensorsPlus.enter === sensorId) { b.sensorsPlus.enter = ''; modified = true; }
            if (b.sensorsPlus.in === sensorId) { b.sensorsPlus.in = ''; modified = true; }
            if (b.sensorsMinus.enter === sensorId) { b.sensorsMinus.enter = ''; modified = true; }
            if (b.sensorsMinus.in === sensorId) { b.sensorsMinus.in = ''; modified = true; }
            if (modified) {
              blockManager.updateBlock(b);
              broadcast({ type: 'BLOCK_UPDATED', payload: b });
            }
          }
          saveAllData();
          broadcast({ type: 'SENSOR_DELETED', payload: { sensorId } });
          addLog(`Sensor #${sensorId} gelöscht.`, 'warn');
          break;
        }

        case 'CREATE_BLOCK': {
          const b = action.payload;
          if (!b.id) b.id = `block-${Date.now()}`;
          data.blocks.push(b);
          blockManager.updateBlock(b);
          saveAllData();
          broadcast({ type: 'BLOCK_UPDATED', payload: b });
          addLog(`Block "${b.name}" angelegt.`, 'info');
          break;
        }

        case 'UPDATE_BLOCK': {
          const b = action.payload;
          blockManager.updateBlock(b);
          const idx = data.blocks.findIndex((x) => x.id === b.id);
          if (idx >= 0) data.blocks[idx] = b;
          saveAllData();
          broadcast({ type: 'BLOCK_UPDATED', payload: b });
          addLog(`Block "${b.name}" aktualisiert (Sensoren: ${b.sensorsPlus.enter || '-'}/${b.sensorsPlus.in || '-'}).`, 'info');
          break;
        }

        case 'DELETE_BLOCK': {
          const { blockId } = action.payload;
          // CR-17: Aus dem Manager (Quelle für saveAllData) löschen und Referenzen bereinigen
          if (routeEngine.getAllRoutes().some((r) => r.active && (r.fromBlockId === blockId || r.toBlockId === blockId))) {
            addLog(`Block #${blockId} kann nicht gelöscht werden: aktive Fahrstraße vorhanden.`, 'warn');
            break;
          }
          blockManager.deleteBlock(blockId);
          data.blocks = blockManager.getAllBlocks();
          for (const l of locoManager.getAllLocos()) {
            if (l.currentBlockId === blockId) locoManager.setLocoBlock(l.id, null);
          }
          const remainingRoutes = routeEngine.getAllRoutes().filter((r) => r.fromBlockId !== blockId && r.toBlockId !== blockId);
          if (remainingRoutes.length !== routeEngine.getAllRoutes().length) {
            routeEngine.setRoutes(remainingRoutes);
            data.routes = remainingRoutes;
            broadcast({ type: 'ROUTES_UPDATED', payload: remainingRoutes });
          }
          saveAllData();
          broadcast({ type: 'BLOCK_DELETED', payload: { blockId } });
          addLog(`Block #${blockId} gelöscht.`, 'warn');
          break;
        }

        case 'CREATE_TURNOUT': {
          const t = action.payload;
          if (!t.id) t.id = `to-${Date.now()}`;
          data.turnouts.push(t);
          turnoutManager.updateTurnout(t);
          saveAllData();
          broadcast({ type: 'TURNOUT_UPDATED', payload: t });
          addLog(`Weiche "${t.name}" (Adr: #${t.address}) angelegt.`, 'info');
          break;
        }

        case 'UPDATE_TURNOUT': {
          const t = action.payload;
          turnoutManager.updateTurnout(t);
          const idx = data.turnouts.findIndex((x) => x.id === t.id);
          if (idx >= 0) data.turnouts[idx] = t;
          saveAllData();
          broadcast({ type: 'TURNOUT_UPDATED', payload: t });
          addLog(`Weiche "${t.name}" aktualisiert (DCC #${t.address}, Invertiert: ${t.inverted ? 'Ja' : 'Nein'}).`, 'info');
          break;
        }

        case 'DELETE_TURNOUT': {
          const { turnoutId } = action.payload;
          // CR-17: Aus dem Manager löschen; verriegelte Weichen nicht entfernen
          if (turnoutManager.getTurnout(turnoutId)?.locked) {
            addLog(`Weiche #${turnoutId} kann nicht gelöscht werden: durch aktive Fahrstraße verriegelt.`, 'warn');
            break;
          }
          turnoutManager.deleteTurnout(turnoutId);
          data.turnouts = turnoutManager.getAllTurnouts();
          const routesWithoutTurnout = routeEngine.getAllRoutes().filter((r) => !r.turnoutSettings.some((ts) => ts.turnoutId === turnoutId));
          if (routesWithoutTurnout.length !== routeEngine.getAllRoutes().length) {
            routeEngine.setRoutes(routesWithoutTurnout);
            data.routes = routesWithoutTurnout;
            broadcast({ type: 'ROUTES_UPDATED', payload: routesWithoutTurnout });
            addLog(`Fahrstraßen über Weiche #${turnoutId} entfernt.`, 'warn');
          }
          saveAllData();
          broadcast({ type: 'TURNOUT_DELETED', payload: { turnoutId } });
          addLog(`Weiche #${turnoutId} gelöscht.`, 'warn');
          break;
        }

        case 'ASSIGN_LOCO_TO_BLOCK': {
          const { locoId, blockId } = action.payload;
          blockManager.assignLocoToBlock(locoId, blockId);
          for (const l of locoManager.getAllLocos()) {
            if (l.id === locoId) {
              locoManager.setLocoBlock(l.id, blockId);
            } else if (blockId && l.currentBlockId === blockId) {
              locoManager.setLocoBlock(l.id, null);
            }
          }
          data.locos = locoManager.getAllLocos();
          data.blocks = blockManager.getAllBlocks();
          saveAllData();
          break;
        }

        case 'FREE_BLOCK': {
          const { blockId } = action.payload;
          const targetBlock = blockManager.getBlock(blockId);
          const currentLocoId = targetBlock?.currentLocoId;
          const reservedLocoId = targetBlock?.reservedForLocoId;
          // Laufenden 50/50-Halteplan abbrechen, sonst belegt der virtuelle IN den Block erneut
          if (currentLocoId) splitEngine.cancel(currentLocoId);
          if (reservedLocoId) splitEngine.cancel(reservedLocoId);

          // Eventuelle Fahrstraßen auflösen, die von/zu diesem Block führen
          routeEngine.releaseRoute(blockId);
          for (const r of routeEngine.getAllRoutes()) {
            if (r.fromBlockId === blockId && r.active) {
              routeEngine.releaseRoute(r.toBlockId);
            }
          }

          // Alle Loks freigeben, die im Block standen, dafür reserviert waren oder noch darauf verweisen
          for (const l of locoManager.getAllLocos()) {
            if (l.id === currentLocoId || l.id === reservedLocoId || l.currentBlockId === blockId) {
              locoManager.setLocoBlock(l.id, null);
            }
          }
          blockManager.freeBlock(blockId);
          data.locos = locoManager.getAllLocos();
          data.blocks = blockManager.getAllBlocks();
          saveAllData();
          break;
        }

        case 'REQUEST_ROUTE':
          routeEngine.requestRoute(action.payload.fromBlockId, action.payload.toBlockId);
          break;

        case 'DISPATCH_BLOCK_NOW': {
          const { blockId } = action.payload;
          const target = blockManager.getBlock(blockId);
          const ok = routeEngine.dispatchBlockNow(blockId);
          if (ok) {
            addLog(`Sofortige Abfahrt aus ${target?.name || blockId} veranlasst.`, 'info');
          } else {
            addLog(`Sofortige Abfahrt aus ${target?.name || blockId}: Keine freie Ausfahrt verfügbar.`, 'warn');
          }
          break;
        }

        case 'TOGGLE_AUTOMATIC_MODE':
          status.automaticMode = routeEngine.toggleAutomaticMode(action.payload.active);
          broadcast({ type: 'STATUS_UPDATE', payload: { automaticMode: status.automaticMode } });
          break;

        case 'UPDATE_LAYOUT':
          data.layout = action.payload.elements;
          saveAllData();
          broadcast({ type: 'LAYOUT_UPDATED', payload: data.layout });
          addLog('Gleisplan erfolgreich gespeichert.', 'info');
          break;

        case 'SAVE_BBT_ENTRY':
          bbtEngine.saveEntry(action.payload.entry);
          break;

        case 'UPDATE_SETTINGS': {
          const payload = action.payload;
          if (!payload || typeof payload !== 'object') {
            console.warn('[Security] UPDATE_SETTINGS ignoriert: Payload ist kein gültiges Objekt.');
            break;
          }
          const prevWioPort = data.settings.wio?.udpPort;
          const prevWioEnabled = data.settings.wio?.enabled;
          // TM-04: Sichere Zusammenführung mit Schema-Garantien gegen korrupte Payloads
          data.settings = storage.ensureSettings({
            ...data,
            settings: {
              ...data.settings,
              ...payload,
              commandStation: {
                ...data.settings.commandStation,
                ...(payload.commandStation && typeof payload.commandStation === 'object' ? payload.commandStation : {})
              }
            }
          }).settings;

          bbtEngine.targetCreepDurationMs = data.settings.targetCreepMs || 1000;
          saveAllData();
          await applyCommandStation(data.settings.commandStation);

          if (data.settings.wio && (data.settings.wio.udpPort !== prevWioPort || data.settings.wio.enabled !== prevWioEnabled)) {
            await wioDriver.stop();
            if (data.settings.wio.enabled) {
              wioDriver = new WioDriver(data.settings.wio.udpPort || 8051, {
                onSensorTriggered: handleWioEvent,
                onNodeUpdated: (_node) => {
                  broadcast({
                    type: 'WIO_NODES_UPDATED',
                    payload: {
                      nodes: wioDriver.getDiscoveredNodes(),
                      recentPackets: wioDriver.getRecentPackets()
                    }
                  });
                },
                onLog: addLog
              });
              await wioDriver.start();
            }
          }

          if (data.settings.ambientLighting) {
            lightingEngine.updateConfig(data.settings.ambientLighting);
          }

          broadcast({ type: 'SETTINGS_UPDATED', payload: data.settings });
          addLog('Einstellungen erfolgreich übernommen und gespeichert.', 'info');
          break;
        }

        case 'UPDATE_LIGHTING_CONFIG':
          lightingEngine.updateConfig(action.payload);
          break;

        case 'TRIGGER_LIGHTNING':
          lightingEngine.triggerLightning();
          break;

        case 'SCAN_SERIAL_PORTS': {
          const ports: SerialPortInfo[] = [];
          try {
            const list = await SerialPort.list();
            for (const p of list) {
              ports.push({
                path: p.path,
                manufacturer: p.manufacturer,
                friendlyName: (p as any).friendlyName || p.path
              });
            }
          } catch (err) {
            console.warn('Fehler beim Auflisten der COM-Ports:', err);
          }
          ws.send(JSON.stringify({ type: 'SERIAL_PORTS_LIST', payload: ports }));
          break;
        }

        case 'SCAN_WIO_NETWORK': {
          addLog('[WIO] Starte aktiven Netzwerk-Scan nach ESP32...', 'info');
          const results = await wioDriver.scanNetwork();
          broadcast({ type: 'WIO_SCAN_RESULTS', payload: results });
          break;
        }

        case 'CREATE_LOCO':
          locoManager.addLoco(action.payload);
          saveAllData();
          break;

        case 'UPDATE_LOCO':
          locoManager.updateLoco(action.payload);
          saveAllData();
          break;

        case 'DELETE_LOCO': {
          // CR-18: Fahrende Lok nicht löschen; danach alle Block-/Routen-/BBT-Referenzen auflösen
          const { locoId } = action.payload;
          const loco = locoManager.getLoco(locoId);
          if (!loco) break;
          if (loco.speed > 0) {
            addLog(`Lok "${loco.name}" kann während der Fahrt nicht gelöscht werden. Bitte zuerst anhalten.`, 'warn');
            break;
          }
          bbtEngine.cancelBraking(locoId);
          splitEngine.cancel(locoId);
          for (const b of blockManager.getAllBlocks()) {
            if (b.currentLocoId === locoId || b.reservedForLocoId === locoId) {
              routeEngine.releaseRoute(b.id);
              for (const r of routeEngine.getAllRoutes()) {
                if (r.active && r.fromBlockId === b.id) routeEngine.releaseRoute(r.toBlockId);
              }
              routeEngine.clearBlockTimer(b.id);
              blockManager.freeBlock(b.id);
            }
          }
          routeEngine.forgetLoco(locoId);
          locoManager.deleteLoco(locoId);
          data.blocks = blockManager.getAllBlocks();
          saveAllData();
          break;
        }

        case 'AUTO_CREATE_WIO_SENSORS': {
          const { unit, count } = action.payload;
          const pinsToCreate = count > 16
            ? [4, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39]
            : Array.from({ length: count }, (_, i) => i + 1);
          let createdCount = 0;
          for (const pin of pinsToCreate) {
            const exists = data.sensors.some((s) => s.type === 'WIO' && s.wioUnit === unit && s.wioPin === pin);
            if (!exists) {
              const newSensor = {
                id: `sens-wio-u${unit}-p${pin}`,
                name: `WIO ${unit} Pin ${pin}`,
                type: 'WIO' as const,
                address: unit * 100 + pin,
                active: false,
                wioUnit: unit,
                wioPin: pin
              };
              data.sensors.push(newSensor);
              broadcast({ type: 'SENSOR_UPDATED', payload: newSensor });
              createdCount++;
            }
          }
          if (createdCount > 0) {
            saveAllData();
            addLog(`${createdCount} Rückmelder für WIO Unit ${unit} automatisch angelegt.`, 'info');
          }
          break;
        }

        case 'INSPECT_LAYOUT': {
          const result = inspectLayout();
          ws.send(JSON.stringify({ type: 'LAYOUT_INSPECTION_RESULT', payload: result }));
          addLog(`Gleisplan-Prüfung abgeschlossen: ${result.issues.length} Hinweise, ${result.assignments.length} Blöcke analysiert, ${result.generatedRoutes.length} Fahrstraßen generiert.`, 'info');
          break;
        }

        case 'APPLY_BLOCK_ASSIGNMENTS': {
          const { assignments } = action.payload;
          for (const a of assignments) {
            const block = blockManager.getBlock(a.blockId);
            if (block) {
              block.sensorsPlus = a.sensorsPlus;
              block.sensorsMinus = a.sensorsMinus;
              blockManager.updateBlock(block);
              const idx = data.blocks.findIndex((b) => b.id === block.id);
              if (idx >= 0) data.blocks[idx] = block;
              broadcast({ type: 'BLOCK_UPDATED', payload: block });
            }
          }
          saveAllData();
          addLog(`Sensoren & Signale für ${assignments.length} Blöcke automatisch zugewiesen und gespeichert.`, 'info');
          break;
        }

        case 'SAVE_GENERATED_ROUTES': {
          const { routes, mode } = action.payload;
          let finalRoutes: Route[] = [];
          if (mode === 'MERGE') {
            const existing = routeEngine.getAllRoutes();
            const existingIds = new Set(existing.map((r) => r.id));
            finalRoutes = [...existing, ...routes.filter((r) => !existingIds.has(r.id))];
          } else {
            finalRoutes = routes;
          }
          routeEngine.setRoutes(finalRoutes);
          data.routes = finalRoutes;
          saveAllData();
          broadcast({ type: 'ROUTES_UPDATED', payload: finalRoutes });
          addLog(`${finalRoutes.length} Fahrstraßen erfolgreich im Stellwerk gespeichert & aktiviert.`, 'info');
          break;
        }
      }
    } catch (err) {
      console.error('Fehler bei WS-Nachricht:', err);
    }
  });
});

function saveAllData(): void {
  storage.saveData({
    locos: locoManager.getAllLocos(),
    turnouts: turnoutManager.getAllTurnouts(),
    signals: data.signals,
    sensors: data.sensors,
    blocks: blockManager.getAllBlocks(),
    layout: data.layout,
    routes: routeEngine.getAllRoutes(),
    bbt: bbtEngine.getAllEntries(),
    settings: data.settings
  });
}

// REST API
app.get('/api/status', (_req, res) => {
  res.json(status);
});

app.get('/api/turnouts', (_req, res) => {
  res.json(turnoutManager.getAllTurnouts());
});

app.get('/api/locos', (_req, res) => {
  res.json(locoManager.getAllLocos());
});

// TM-09: Sichere IP-Bereinigung & Validierung gegen SSRF / Header-Spoofing
function getCleanClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const candidate = forwarded.split(',')[0].trim();
    if (net.isIP(candidate)) {
      return candidate;
    }
  }
  const remote = req.socket.remoteAddress || '127.0.0.1';
  const clean = remote.includes('::ffff:') ? remote.replace('::ffff:', '') : remote;
  if (clean === '::1' || clean === 'localhost') return '127.0.0.1';
  return net.isIP(clean) ? clean : '127.0.0.1';
}

// WIO REST API Endpunkte für ESP32 (HTTP POST)
app.post('/api/wio/sensor', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ error: 'Ungültiger JSON-Payload' });
    return;
  }
  const cleanIp = getCleanClientIp(req);
  wioDriver.parseJsonPacket(payload, JSON.stringify(payload), cleanIp);
  res.json({ success: true, processed: payload });
});

// TM-01: GET /api/wio/sensor erlaubt keine zustandsändernden Mutationen mehr (CSRF-Schutz)
app.get('/api/wio/sensor', (_req, res) => {
  res.status(405).json({
    error: 'Method Not Allowed',
    message: 'Zustandsänderungen via GET sind aus Sicherheitsgründen deaktiviert. Bitte POST /api/wio/sensor verwenden.'
  });
});

app.get('/api/wio/status', (_req, res) => {
  res.json(wioDriver.getStatus());
});

app.get('/api/wio/nodes', (_req, res) => {
  res.json({
    nodes: wioDriver.getDiscoveredNodes(),
    recentPackets: wioDriver.getRecentPackets()
  });
});

app.get('/api/wio/scan', async (_req, res) => {
  const devices = await wioDriver.scanNetwork();
  res.json({ success: true, count: devices.length, devices });
});

app.post('/api/wio/scan', async (_req, res) => {
  const devices = await wioDriver.scanNetwork();
  broadcast({ type: 'WIO_SCAN_RESULTS', payload: devices });
  res.json({ success: true, count: devices.length, devices });
});

server.listen(PORT, () => {
  console.log(`🚂 TrainMaster Server läuft auf http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server bereit (v1.8.1).`);
});
