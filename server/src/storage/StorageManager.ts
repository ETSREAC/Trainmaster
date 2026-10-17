import fs from 'fs';
import path from 'path';
import { AppSettings, BBTEntry, Block, Locomotive, Route, Sensor, Signal, TrackElement, Turnout } from '../types.js';

export interface StorageData {
  locos: Locomotive[];
  turnouts: Turnout[];
  signals: Signal[];
  sensors: Sensor[];
  blocks: Block[];
  layout: TrackElement[];
  routes: Route[];
  bbt: BBTEntry[];
  settings: AppSettings;
}

export class StorageManager {
  private dataDir: string;
  private dataFilePath: string;

  constructor(baseDir?: string) {
    this.dataDir = baseDir || path.resolve(process.cwd(), 'data');
    const localPath = path.join(this.dataDir, 'layout.local.json');
    const defaultPath = path.join(this.dataDir, 'layout.json');

    if (fs.existsSync(localPath)) {
      this.dataFilePath = localPath;
    } else if (fs.existsSync(defaultPath)) {
      try {
        fs.copyFileSync(defaultPath, localPath);
        this.dataFilePath = localPath;
      } catch {
        this.dataFilePath = defaultPath;
      }
    } else {
      this.dataFilePath = localPath;
    }
  }

  loadData(): StorageData {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const raw = fs.readFileSync(this.dataFilePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Konnte bestehende Daten nicht laden, erstelle Standard-Demo-Layout:', err);
    }
    const initial = this.getDefaultData();
    this.saveData(initial);
    return initial;
  }

  ensureSettings(data: StorageData): StorageData {
    const defaultSettings = this.getDefaultData().settings;
    if (!data.settings || typeof data.settings !== 'object') {
      data.settings = defaultSettings;
    } else {
      const mergedCS = {
        ...defaultSettings.commandStation,
        ...(data.settings.commandStation && typeof data.settings.commandStation === 'object' ? data.settings.commandStation : {})
      };
      if (!mergedCS.type) {
        mergedCS.type = 'VIRTUAL';
      }

      const mergedWio = defaultSettings.wio ? {
        ...defaultSettings.wio,
        ...(data.settings.wio && typeof data.settings.wio === 'object' ? data.settings.wio : {})
      } : undefined;

      const mergedLighting = defaultSettings.ambientLighting ? {
        ...defaultSettings.ambientLighting,
        ...(data.settings.ambientLighting && typeof data.settings.ambientLighting === 'object' ? data.settings.ambientLighting : {})
      } : undefined;

      data.settings = {
        ...defaultSettings,
        ...data.settings,
        commandStation: mergedCS,
        wio: mergedWio,
        ambientLighting: mergedLighting
      };
    }
    if (!data.bbt) {
      data.bbt = [];
    }
    for (const b of data.bbt) {
      if (!b.history) {
        b.history = b.lastRunMetrics ? [b.lastRunMetrics] : [];
      }
    }
    return data;
  }

  getDataDir(): string {
    return this.dataDir;
  }

  saveData(data: StorageData): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Fehler beim Speichern der Layout-Daten:', err);
    }
  }

  private getDefaultData(): StorageData {
    const locos: Locomotive[] = [
      {
        id: 'loco-br-218',
        name: 'DB BR 218 (Diesel)',
        dccAddress: 218,
        speed: 0,
        targetSpeed: 0,
        direction: 'FWD',
        functions: { 0: false, 1: false, 2: false, 3: false },
        vMin: 12,
        vMid: 55,
        vMax: 105,
        lengthCm: 19.5,
        trainType: 'PASSENGER',
        currentBlockId: 'block-bf-gl1'
      },
      {
        id: 'loco-ice-3',
        name: 'DB ICE 3 (Triebzug)',
        dccAddress: 3,
        speed: 0,
        targetSpeed: 0,
        direction: 'FWD',
        functions: { 0: false, 1: false, 2: false, 3: false },
        vMin: 15,
        vMid: 70,
        vMax: 126,
        lengthCm: 45.0,
        trainType: 'HIGH_SPEED',
        currentBlockId: null
      }
    ];

    const turnouts: Turnout[] = [
      { id: 'to-1', name: 'Weiche W1 (Einfahrt Ost)', address: 1, state: 'STRAIGHT', locked: false },
      { id: 'to-2', name: 'Weiche W2 (Ausfahrt West)', address: 2, state: 'STRAIGHT', locked: false }
    ];

    const signals: Signal[] = [
      {
        id: 'sig-1',
        name: 'Ausfahrsignal N1',
        address: 101,
        aspect: 'HP0',
        type: 'WIO',
        wioUnit: 1,
        wioPins: { red: 12, green: 13, yellow: 14, white: 15 },
        inverted: false
      },
      {
        id: 'sig-2',
        name: 'Ausfahrsignal N2',
        address: 102,
        aspect: 'HP0',
        type: 'WIO',
        wioUnit: 1,
        wioPins: { red: 16, green: 17, yellow: 18 },
        inverted: false
      }
    ];

    const sensors: Sensor[] = [
      { id: 'sens-1', name: 'Bf Gl1 ENTER (+)', address: 1, type: 'CURRENT', active: false },
      { id: 'sens-2', name: 'Bf Gl1 IN (+)', address: 2, type: 'CURRENT', active: false },
      { id: 'sens-3', name: 'Bf Gl2 ENTER (+)', address: 3, type: 'CURRENT', active: false },
      { id: 'sens-4', name: 'Bf Gl2 IN (+)', address: 4, type: 'CURRENT', active: false },
      { id: 'sens-5', name: 'Strecke ENTER (+)', address: 5, type: 'CURRENT', active: false },
      { id: 'sens-6', name: 'Strecke IN (+)', address: 6, type: 'CURRENT', active: false }
    ];

    const blocks: Block[] = [
      {
        id: 'block-bf-gl1',
        name: 'Bahnhof Gleis 1',
        lengthCm: 180,
        state: 'OCCUPIED',
        currentLocoId: 'loco-br-218',
        reservedForLocoId: null,
        direction: '+',
        sensorsPlus: { enter: 'sens-1', in: 'sens-2' },
        sensorsMinus: { enter: 'sens-2', in: 'sens-1' }
      },
      {
        id: 'block-bf-gl2',
        name: 'Bahnhof Gleis 2 (Ausweichgleis)',
        lengthCm: 160,
        state: 'FREE',
        currentLocoId: null,
        reservedForLocoId: null,
        direction: '+',
        sensorsPlus: { enter: 'sens-3', in: 'sens-4' },
        sensorsMinus: { enter: 'sens-4', in: 'sens-3' }
      },
      {
        id: 'block-strecke',
        name: 'Freie Strecke Nord',
        lengthCm: 250,
        state: 'FREE',
        currentLocoId: null,
        reservedForLocoId: null,
        direction: '+',
        sensorsPlus: { enter: 'sens-5', in: 'sens-6' },
        sensorsMinus: { enter: 'sens-6', in: 'sens-5' }
      }
    ];

    const routes: Route[] = [
      {
        id: 'route-gl1-to-strecke',
        name: 'Fahrstraße Gl 1 -> Strecke',
        fromBlockId: 'block-bf-gl1',
        toBlockId: 'block-strecke',
        direction: '+',
        turnoutSettings: [{ turnoutId: 'to-2', state: 'STRAIGHT' }],
        signalSettings: [{ signalId: 'sig-1', aspect: 'HP1' }],
        active: false
      },
      {
        id: 'route-gl2-to-strecke',
        name: 'Fahrstraße Gl 2 -> Strecke',
        fromBlockId: 'block-bf-gl2',
        toBlockId: 'block-strecke',
        direction: '+',
        turnoutSettings: [{ turnoutId: 'to-2', state: 'DIVERGENT' }],
        signalSettings: [{ signalId: 'sig-2', aspect: 'HP2' }],
        active: false
      },
      {
        id: 'route-strecke-to-gl1',
        name: 'Fahrstraße Strecke -> Gl 1',
        fromBlockId: 'block-strecke',
        toBlockId: 'block-bf-gl1',
        direction: '+',
        turnoutSettings: [{ turnoutId: 'to-1', state: 'STRAIGHT' }],
        active: false
      },
      {
        id: 'route-strecke-to-gl2',
        name: 'Fahrstraße Strecke -> Gl 2',
        fromBlockId: 'block-strecke',
        toBlockId: 'block-bf-gl2',
        direction: '+',
        turnoutSettings: [{ turnoutId: 'to-1', state: 'DIVERGENT' }],
        active: false
      }
    ];

    const bbt: BBTEntry[] = [
      {
        locoId: 'loco-br-218',
        blockId: 'block-bf-gl1',
        direction: '+',
        steps: 45,
        intervalMs: 80,
        vStart: 55,
        vMin: 12,
        locked: false
      },
      {
        locoId: 'loco-br-218',
        blockId: 'block-strecke',
        direction: '+',
        steps: 60,
        intervalMs: 90,
        vStart: 65,
        vMin: 12,
        locked: false
      }
    ];

    // Raster-Gleisplan Layout (Oval mit 2 Bahnhofsgleisen)
    const layout: TrackElement[] = [
      // Obere Strecke
      { id: 't-1', x: 2, y: 1, rotation: 0, type: 'CURVE' },
      { id: 't-2', x: 3, y: 1, rotation: 90, type: 'STRAIGHT' },
      { id: 't-3', x: 4, y: 1, rotation: 90, type: 'BLOCK', linkedId: 'block-strecke' },
      { id: 't-4', x: 5, y: 1, rotation: 90, type: 'STRAIGHT' },
      { id: 't-5', x: 6, y: 1, rotation: 90, type: 'CURVE' },

      // Rechte Kurve
      { id: 't-6', x: 6, y: 2, rotation: 180, type: 'CURVE' },
      { id: 't-7', x: 6, y: 3, rotation: 0, type: 'STRAIGHT' },
      { id: 't-8', x: 6, y: 4, rotation: 270, type: 'CURVE' },

      // Untere Bahnhofsebene - Weiche 2 links, Weiche 1 rechts
      { id: 't-9', x: 5, y: 4, rotation: 270, type: 'TURNOUT_RIGHT', linkedId: 'to-1' },
      { id: 't-10', x: 4, y: 4, rotation: 90, type: 'BLOCK', linkedId: 'block-bf-gl1' },
      { id: 't-11', x: 3, y: 4, rotation: 90, type: 'TURNOUT_LEFT', linkedId: 'to-2' },

      // Ausweichgleis (Gleis 2) parallel darunter
      { id: 't-12', x: 5, y: 5, rotation: 270, type: 'CURVE' },
      { id: 't-13', x: 4, y: 5, rotation: 90, type: 'BLOCK', linkedId: 'block-bf-gl2' },
      { id: 't-14', x: 3, y: 5, rotation: 180, type: 'CURVE' },

      // Linke Kurve zurück nach oben
      { id: 't-15', x: 2, y: 4, rotation: 180, type: 'CURVE' },
      { id: 't-16', x: 2, y: 3, rotation: 0, type: 'STRAIGHT' },
      { id: 't-17', x: 2, y: 2, rotation: 90, type: 'CURVE' }
    ];

    const settings: AppSettings = {
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
      manualSensorTriggerInRunMode: true,
      ambientLighting: {
        enabled: true,
        ip: '192.168.1.50',
        port: 5577,
        mode: 'CIRCADIAN',
        modelDayMinutes: 15,
        currentModelHour: 14.0,
        manualColor: { r: 255, g: 160, b: 60 },
        weather: 'CLEAR',
        randomWeather: false,
        lightningFrequencySec: 25,
        soundSyncEnabled: true,
        isPaused: false
      }
    };

    return { locos, turnouts, signals, sensors, blocks, layout, routes, bbt, settings };
  }
}
