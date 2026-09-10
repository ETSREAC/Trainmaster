import http from 'http';
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
  getSignalSupportedAspects
} from './types.js';

import { SerialPort } from 'serialport';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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
    status.trackPower = power;
    broadcast({ type: 'STATUS_UPDATE', payload: { trackPower: power } });
  },
  onConnectionChanged: (connected) => {
    status.connected = connected;
    broadcast({ type: 'STATUS_UPDATE', payload: { connected } });
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
}

// Core Engines
let locoManager: LocoManager;
let turnoutManager: TurnoutManager;
let blockManager: BlockManager;
let bbtEngine: BBTEngine;
let routeEngine: RouteEngine;

locoManager = new LocoManager(data.locos, {
  onLocoUpdated: (loco) => {
    broadcast({ type: 'LOCO_UPDATED', payload: loco });
  },
  onLocoDeleted: (locoId) => {
    broadcast({ type: 'LOCO_DELETED', payload: { locoId } });
  },
  onSpeedChanged: (loco) => {
    hal.setLocoSpeed(loco.dccAddress, loco.speed, loco.direction);
  },
  onFunctionChanged: (loco, fnIdx, active) => {
    hal.setLocoFunction(loco.dccAddress, fnIdx, active);
  },
  onLog: addLog
});

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
    locoManager.setSpeed(locoId, speed);
  },
  onBBTUpdated: (entry) => {
    broadcast({ type: 'BBT_UPDATED', payload: entry });
  },
  onLog: addLog
});

blockManager = new BlockManager(data.blocks, {
  onBlockUpdated: (block) => {
    broadcast({ type: 'BLOCK_UPDATED', payload: block });
  },
  onEnterTriggered: (block, loco) => {
    bbtEngine.startBraking(loco, block.id, block.direction);
  },
  onInTriggered: (block, loco) => {
    bbtEngine.handleInEvent(loco, block.id, block.direction);
    routeEngine.releaseRoute(block.id);
  },
  onGhostDetected: () => {
    if (data.settings.ghostDetectionActive) {
      triggerEmergencyStop();
    } else {
      addLog('Geisterzug erkannt, Not-Halt jedoch in den Einstellungen deaktiviert.', 'warn');
    }
  },
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
    onSignalSet: (signalId, aspect) => {
      const sig = data.signals.find((s) => s.id === signalId);
      if (sig) {
        setSignalState(sig, aspect);
      }
    },
    onLog: addLog
  }
);

// Virtuelle Züge simulieren: automatisches Weiterfahren bei aktiver Fahrstraße
setInterval(() => {
  if (status.emergencyStop || !status.trackPower) return;
  // Nur im Virtual-Modus simulieren wir die Sensoren automatisch
  if (status.commandStationType !== 'VIRTUAL') return;

  for (const route of routeEngine.getAllRoutes()) {
    if (route.active) {
      const fromBlock = blockManager.getBlock(route.fromBlockId);
      const toBlock = blockManager.getBlock(route.toBlockId);
      if (!fromBlock || !toBlock) continue;

      const loco = fromBlock.currentLocoId ? locoManager.getLoco(fromBlock.currentLocoId) : null;
      if (loco && loco.speed > 0) {
        if (toBlock.state === 'RESERVED') {
          setTimeout(() => {
            const enterSensorId = toBlock.direction === '+' ? toBlock.sensorsPlus.enter : toBlock.sensorsMinus.enter;
            triggerSensor(enterSensorId, true);
          }, 3500);
        } else if (toBlock.state === 'OCCUPIED' && loco.speed > 0) {
          setTimeout(() => {
            const inSensorId = toBlock.direction === '+' ? toBlock.sensorsPlus.in : toBlock.sensorsMinus.in;
            triggerSensor(inSensorId, true);
          }, 4500);
        }
      }
    }
  }
}, 1000);

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
  hal.emergencyStop();
  locoManager.emergencyStopAll();
  broadcast({ type: 'STATUS_UPDATE', payload: { emergencyStop: true } });
  addLog('GENERAL-NOTHALT AKTIVIERT!', 'error');
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
wss.on('connection', (ws) => {
  const initialMsg: WSServerMessage = {
    type: 'INITIAL_STATE',
    payload: {
      status,
      locos: locoManager.getAllLocos(),
      turnouts: turnoutManager.getAllTurnouts(),
      signals: data.signals,
      sensors: data.sensors,
      blocks: blockManager.getAllBlocks(),
      layout: data.layout,
      routes: routeEngine.getAllRoutes(),
      bbt: bbtEngine.getAllEntries(),
      settings: data.settings,
      wioNodes: wioDriver.getDiscoveredNodes(),
      wioPackets: wioDriver.getRecentPackets()
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

        case 'SET_TURNOUT':
          turnoutManager.setTurnoutState(action.payload.turnoutId, action.payload.state);
          break;

        case 'SET_SIGNAL': {
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
          const { sensorId, state, autoReset } = action.payload;
          const sensor = data.sensors.find((s) => s.id === sensorId);
          if (sensor) {
            const targetState = state !== undefined ? state : !sensor.active;
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
          data.blocks = data.blocks.filter((b) => b.id !== blockId);
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
          data.turnouts = data.turnouts.filter((t) => t.id !== turnoutId);
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
          const prevWioPort = data.settings.wio?.udpPort;
          const prevWioEnabled = data.settings.wio?.enabled;
          data.settings = action.payload;
          bbtEngine.targetCreepDurationMs = data.settings.targetCreepMs;
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

          broadcast({ type: 'SETTINGS_UPDATED', payload: data.settings });
          addLog('Einstellungen erfolgreich übernommen und gespeichert.', 'info');
          break;
        }

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

        case 'DELETE_LOCO':
          locoManager.deleteLoco(action.payload.locoId);
          saveAllData();
          break;

        case 'AUTO_CREATE_WIO_SENSORS': {
          const { unit, count } = action.payload;
          let createdCount = 0;
          for (let pin = 1; pin <= count; pin++) {
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

// WIO REST API Endpunkte für ESP32 (HTTP POST / GET)
app.post('/api/wio/sensor', (req, res) => {
  const payload = req.body;
  const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'HTTP';
  const cleanIp = rawIp.includes('::1') || rawIp === '127.0.0.1' ? '127.0.0.1' : rawIp.replace(/^.*:/, '');
  wioDriver.parseJsonPacket(payload, JSON.stringify(payload), cleanIp);
  res.json({ success: true, processed: payload });
});

app.get('/api/wio/sensor', (req, res) => {
  const query = req.query;
  const unit = query.unit ? parseInt(String(query.unit), 10) : undefined;
  const pin = query.pin ? parseInt(String(query.pin), 10) : undefined;
  const address = query.address ? parseInt(String(query.address), 10) : query.addr ? parseInt(String(query.addr), 10) : undefined;
  const state = query.state === '1' || query.state === 'true' || query.state === 'on';
  const id = query.id ? String(query.id) : undefined;
  const rawIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'HTTP';
  const cleanIp = rawIp.includes('::1') || rawIp === '127.0.0.1' ? '127.0.0.1' : rawIp.replace(/^.*:/, '');

  wioDriver.recordNodeActivity(
    cleanIp,
    unit || 1,
    pin,
    state,
    `GET unit=${unit || 1} pin=${pin || '?'} state=${state ? '1' : '0'}`
  );
  handleWioEvent({ id, unit, pin, address, state, sourceIp: cleanIp });
  res.json({ success: true, processed: { id, unit, pin, address, state } });
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
  console.log(`🔌 WebSocket Server bereit.`);
});
