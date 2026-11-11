import net from 'net';
import {
  AmbientLightingConfig,
  AppSettings,
  BBTEntry,
  Block,
  CommandStationConfig,
  Route,
  Sensor,
  Signal,
  SignalAspect,
  TrackElement,
  Turnout
} from './types.js';

/**
 * Eingabeprüfung für alles, was über WebSocket/HTTP/UDP von außen kommt.
 * Jede Funktion liefert ein bereinigtes Objekt oder null (= Nachricht verwerfen).
 */

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Ganzzahl im Bereich, sonst null. Akzeptiert auch Zahl-Strings wie "12". */
export function toInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

/** Zahl auf Bereich begrenzen; bei ungültigem Wert der Ersatzwert. */
export function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** IDs: kurze Zeichenketten ohne Steuerzeichen und ohne HTML-/Anführungszeichen. */
export function toId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 96 || /[\u0000-\u001f<>"'`&\\]/.test(s)) return null;
  return s;
}

/** Optionale ID-Referenz ('' = keine). */
function toRef(v: unknown): string {
  return toId(v) || '';
}

/** Anzeigenamen: Steuerzeichen entfernen, Länge begrenzen. (HTML wird im Client escaped.) */
export function toName(v: unknown, fallback: string, maxLen = 64): string {
  if (typeof v !== 'string') return fallback;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLen);
  return s || fallback;
}

/**
 * Text aus dem Netzwerk (ESP32-Namen, Seitentitel fremder Geräte): nur unkritische Zeichen.
 */
export function toNetLabel(v: unknown, fallback: string, maxLen = 48): string {
  if (typeof v !== 'string' && typeof v !== 'number') return fallback;
  const s = String(v).replace(/[^\p{L}\p{N} ._\-#()+:/]/gu, '').trim().slice(0, maxLen);
  return s || fallback;
}

/** IPv4/IPv6-Adresse oder einfacher Hostname (für Zentrale / Lichtcontroller). */
export function toHost(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 253) return null;
  if (net.isIP(s)) return s;
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(s) ? s : null;
}

const DIRS = ['+', '-'] as const;
const ASPECTS: SignalAspect[] = ['HP0', 'HP1', 'HP2', 'SH0', 'SH1'];

export function isAspect(v: unknown): v is SignalAspect {
  return typeof v === 'string' && (ASPECTS as string[]).includes(v);
}

export function sanitizeTurnout(raw: unknown): Turnout | null {
  if (!isObj(raw)) return null;
  const address = toInt(raw.address, 0, 32767);
  if (address === null) return null;
  const id = raw.id ? toId(raw.id) : `to-${Date.now()}`;
  if (!id) return null;
  return {
    id,
    name: toName(raw.name, `Weiche ${address}`),
    address,
    state: raw.state === 'DIVERGENT' ? 'DIVERGENT' : 'STRAIGHT',
    inverted: !!raw.inverted,
    locked: false,
    lockedByRouteId: null
  };
}

export function sanitizeSignal(raw: unknown): Signal | null {
  if (!isObj(raw)) return null;
  const address = toInt(raw.address, 0, 32767);
  if (address === null) return null;
  const id = raw.id ? toId(raw.id) : `sig-${Date.now()}`;
  if (!id) return null;
  const sig: Signal = {
    id,
    name: toName(raw.name, `Signal ${address}`),
    address,
    aspect: isAspect(raw.aspect) ? raw.aspect : 'HP0',
    inverted: !!raw.inverted
  };
  if (raw.type === 'WIO' || raw.type === 'DCC_EX' || raw.type === 'VIRTUAL') sig.type = raw.type;
  if (['BLOCK', 'ENTRY_EXIT', 'ADVANCED', 'SHUNTING'].includes(raw.kind)) sig.kind = raw.kind;
  const unit = toInt(raw.wioUnit, 0, 65535);
  if (unit !== null) sig.wioUnit = unit;
  const led = toInt(raw.wioLedIndex, 0, 4095);
  if (led !== null) sig.wioLedIndex = led;
  if (isObj(raw.wioPins)) {
    sig.wioPins = {};
    for (const color of ['red', 'green', 'yellow', 'white'] as const) {
      const pin = toInt(raw.wioPins[color], 0, 255);
      if (pin !== null) sig.wioPins[color] = pin;
    }
  }
  return sig;
}

export function sanitizeSensor(raw: unknown): Sensor | null {
  if (!isObj(raw)) return null;
  const address = toInt(raw.address, 0, 1000000);
  if (address === null) return null;
  const id = raw.id ? toId(raw.id) : `sens-${Date.now()}`;
  if (!id) return null;
  const types = ['CURRENT', 'REED', 'OPTICAL', 'RAILCOM', 'WIO', 'DCC_EX'];
  const sensor: Sensor = {
    id,
    name: toName(raw.name, `Sensor ${address}`),
    address,
    type: types.includes(raw.type) ? raw.type : 'CURRENT',
    active: false,
    inverted: !!raw.inverted
  };
  const unit = toInt(raw.wioUnit, 0, 65535);
  if (unit !== null) sensor.wioUnit = unit;
  const pin = toInt(raw.wioPin, 0, 255);
  if (pin !== null) sensor.wioPin = pin;
  return sensor;
}

export function sanitizeBlock(raw: unknown): Block | null {
  if (!isObj(raw)) return null;
  const id = raw.id ? toId(raw.id) : `block-${Date.now()}`;
  if (!id) return null;
  const sensors = (s: unknown) => ({ enter: toRef(isObj(s) ? s.enter : ''), in: toRef(isObj(s) ? s.in : '') });
  const states = ['FREE', 'RESERVED', 'OCCUPIED', 'GHOST'];
  const block: Block = {
    id,
    name: toName(raw.name, 'Block'),
    lengthCm: clampNum(raw.lengthCm, 1, 100000, 180),
    state: states.includes(raw.state) ? raw.state : 'FREE',
    currentLocoId: toId(raw.currentLocoId),
    reservedForLocoId: toId(raw.reservedForLocoId),
    direction: raw.direction === '-' ? '-' : '+',
    sensorsPlus: sensors(raw.sensorsPlus),
    sensorsMinus: sensors(raw.sensorsMinus)
  };
  if (['STATION', 'LOCAL_STATION', 'SHADOW_STATION', 'MAINLINE', 'SIDING'].includes(raw.type)) block.type = raw.type;
  if (raw.minWaitTimeSec !== undefined) block.minWaitTimeSec = clampNum(raw.minWaitTimeSec, 0, 86400, 10);
  if (raw.maxWaitTimeSec !== undefined) block.maxWaitTimeSec = clampNum(raw.maxWaitTimeSec, 0, 86400, 25);
  if (block.minWaitTimeSec !== undefined && block.maxWaitTimeSec !== undefined && block.maxWaitTimeSec < block.minWaitTimeSec) {
    block.maxWaitTimeSec = block.minWaitTimeSec;
  }
  if (isObj(raw.soundConfig)) {
    const sc = raw.soundConfig;
    block.soundConfig = {};
    const fKey = toInt(sc.departureFKey, 1, 28);
    if (fKey !== null) block.soundConfig.departureFKey = fKey;
    const aKey = toInt(sc.arrivalFKey, 1, 28);
    if (aKey !== null) block.soundConfig.arrivalFKey = aKey;
    if (sc.departureFKeyDurationMs !== undefined) block.soundConfig.departureFKeyDurationMs = clampNum(sc.departureFKeyDurationMs, 100, 60000, 1500);
    if (sc.departureLeadTimeSec !== undefined) block.soundConfig.departureLeadTimeSec = clampNum(sc.departureLeadTimeSec, 0, 600, 3);
    const audioUnit = toInt(sc.wioAudioUnit, 0, 65535);
    if (audioUnit !== null) block.soundConfig.wioAudioUnit = audioUnit;
    const soundIdx = toInt(sc.wioSoundIndex, 0, 65535);
    if (soundIdx !== null) block.soundConfig.wioSoundIndex = soundIdx;
    if (typeof sc.clientSoundId === 'string' && /^[\w-]{1,32}$/.test(sc.clientSoundId)) block.soundConfig.clientSoundId = sc.clientSoundId;
  }
  if (raw.stopMode === 'SPLIT' || raw.stopMode === 'POINT') block.stopMode = raw.stopMode;
  if (['AUTO_BY_LENGTH', 'PLATFORM_CENTER', 'SIGNAL'].includes(raw.stopPolicy)) block.stopPolicy = raw.stopPolicy;
  if (raw.trackSplitRatio !== undefined) block.trackSplitRatio = clampNum(raw.trackSplitRatio, 0.2, 0.8, 0.5);
  if (raw.centerStopMarginCm !== undefined) block.centerStopMarginCm = clampNum(raw.centerStopMarginCm, 0, 1000, 10);
  if (raw.signalStopMarginCm !== undefined) block.signalStopMarginCm = clampNum(raw.signalStopMarginCm, 0, 1000, 8);
  return block;
}

export function sanitizeBBTEntry(raw: unknown): BBTEntry | null {
  if (!isObj(raw)) return null;
  const locoId = toId(raw.locoId);
  const blockId = toId(raw.blockId);
  if (!locoId || !blockId || !DIRS.includes(raw.direction)) return null;
  const metric = (m: any) =>
    isObj(m)
      ? {
          timestamp: clampNum(m.timestamp, 0, Number.MAX_SAFE_INTEGER, Date.now()),
          creepDurationMs: clampNum(m.creepDurationMs, 0, 3600000, 0),
          targetCreepDurationMs: clampNum(m.targetCreepDurationMs, 0, 3600000, 0),
          overranIn: !!m.overranIn,
          intervalBeforeMs: m.intervalBeforeMs === undefined ? undefined : clampNum(m.intervalBeforeMs, 0, 60000, 0),
          intervalAfterMs: m.intervalAfterMs === undefined ? undefined : clampNum(m.intervalAfterMs, 0, 60000, 0),
          deltaMs: m.deltaMs === undefined ? undefined : clampNum(m.deltaMs, -3600000, 3600000, 0)
        }
      : undefined;
  const history = Array.isArray(raw.history) ? raw.history.slice(0, 25).map(metric).filter((m: unknown) => !!m) : [];
  return {
    locoId,
    blockId,
    direction: raw.direction,
    // Grenzen: verhindern Endlos-/Dauerfeuer-Rampen (Intervall 0, Millionen Schritte)
    steps: Math.round(clampNum(raw.steps, 1, 500, 40)),
    intervalMs: Math.round(clampNum(raw.intervalMs, 20, 5000, 80)),
    vStart: Math.round(clampNum(raw.vStart, 0, 128, 55)),
    vMin: Math.round(clampNum(raw.vMin, 0, 128, 10)),
    locked: !!raw.locked,
    lastRunMetrics: metric(raw.lastRunMetrics),
    history: history as BBTEntry['history']
  };
}

export function sanitizeRoutes(raw: unknown, maxRoutes = 5000): Route[] | null {
  if (!Array.isArray(raw) || raw.length > maxRoutes) return null;
  const out: Route[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!isObj(r)) return null;
    const id = toId(r.id);
    const fromBlockId = toId(r.fromBlockId);
    const toBlockId = toId(r.toBlockId);
    if (!id || !fromBlockId || !toBlockId || seen.has(id)) return null;
    seen.add(id);
    const turnoutSettings: Route['turnoutSettings'] = [];
    for (const ts of Array.isArray(r.turnoutSettings) ? r.turnoutSettings : []) {
      const turnoutId = isObj(ts) ? toId(ts.turnoutId) : null;
      if (!turnoutId) return null;
      turnoutSettings.push({ turnoutId, state: ts.state === 'DIVERGENT' ? 'DIVERGENT' : 'STRAIGHT' });
    }
    const route: Route = {
      id,
      name: toName(r.name, `${fromBlockId} -> ${toBlockId}`, 120),
      fromBlockId,
      toBlockId,
      direction: r.direction === '-' ? '-' : '+',
      turnoutSettings,
      active: false
    };
    if (Array.isArray(r.signalSettings)) {
      route.signalSettings = [];
      for (const ss of r.signalSettings) {
        const signalId = isObj(ss) ? toId(ss.signalId) : null;
        if (signalId && isAspect(ss.aspect)) route.signalSettings.push({ signalId, aspect: ss.aspect });
      }
    }
    if (Array.isArray(r.crossingIds)) {
      route.crossingIds = r.crossingIds.map(toId).filter((c: string | null): c is string => !!c);
    }
    out.push(route);
  }
  return out;
}

const ELEMENT_TYPES = ['STRAIGHT', 'CURVE', 'TURNOUT_LEFT', 'TURNOUT_RIGHT', 'CROSSING', 'BUFFER', 'BLOCK', 'SIGNAL', 'SENSOR'];

export function sanitizeLayout(raw: unknown, maxElements = 20000): TrackElement[] | null {
  if (!Array.isArray(raw) || raw.length > maxElements) return null;
  const out: TrackElement[] = [];
  for (const e of raw) {
    if (!isObj(e)) return null;
    const id = toId(e.id);
    const x = toInt(e.x, -10000, 10000);
    const y = toInt(e.y, -10000, 10000);
    if (!id || x === null || y === null || !ELEMENT_TYPES.includes(e.type)) return null;
    const rotation = [0, 90, 180, 270].includes(e.rotation) ? e.rotation : 0;
    // Unbekannte Zusatzfelder des Editors bleiben erhalten, die Kernfelder sind geprüft
    const el: TrackElement = { ...e, id, x, y, rotation, type: e.type };
    const linked = toRef(e.linkedId);
    if (linked) el.linkedId = linked;
    else delete el.linkedId;
    out.push(el);
  }
  return out;
}

export function sanitizeCommandStation(raw: unknown, base: CommandStationConfig): CommandStationConfig {
  const cs: CommandStationConfig = { ...base };
  if (!isObj(raw)) return cs;
  if (raw.type === 'VIRTUAL' || raw.type === 'DCC_EX' || raw.type === 'Z21') cs.type = raw.type;
  if (raw.connectionType === 'SERIAL' || raw.connectionType === 'TCP' || raw.connectionType === 'UDP') cs.connectionType = raw.connectionType;
  if (typeof raw.serialPort === 'string' && /^[\w\-./\\:]{1,128}$/.test(raw.serialPort.trim())) cs.serialPort = raw.serialPort.trim();
  const baud = toInt(raw.baudRate, 300, 4000000);
  if (baud !== null) cs.baudRate = baud;
  const host = toHost(raw.host);
  if (host) cs.host = host;
  const port = toInt(raw.port, 1, 65535);
  if (port !== null) cs.port = port;
  // Gemerkte Angaben je Zentralentyp
  if (raw.dccConnectionType === 'SERIAL' || raw.dccConnectionType === 'TCP') cs.dccConnectionType = raw.dccConnectionType;
  const dccHost = toHost(raw.dccHost);
  if (dccHost) cs.dccHost = dccHost;
  const dccPort = toInt(raw.dccPort, 1, 65535);
  if (dccPort !== null) cs.dccPort = dccPort;
  const z21Host = toHost(raw.z21Host);
  if (z21Host) cs.z21Host = z21Host;
  const z21Port = toInt(raw.z21Port, 1, 65535);
  if (z21Port !== null) cs.z21Port = z21Port;
  return cs;
}

export function sanitizeLightingPatch(raw: unknown): Partial<AmbientLightingConfig> {
  const out: Partial<AmbientLightingConfig> = {};
  if (!isObj(raw)) return out;
  for (const key of ['enabled', 'randomWeather', 'soundSyncEnabled', 'isPaused'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  const host = toHost(raw.ip);
  if (host) out.ip = host;
  const port = toInt(raw.port, 1, 65535);
  if (port !== null) out.port = port;
  if (['CIRCADIAN', 'WEATHER', 'MANUAL', 'OFF'].includes(raw.mode)) out.mode = raw.mode;
  if (['CLEAR', 'CLOUDY', 'STORM'].includes(raw.weather)) out.weather = raw.weather;
  if (raw.modelDayMinutes !== undefined) out.modelDayMinutes = clampNum(raw.modelDayMinutes, 0, 1440, 15);
  if (raw.currentModelHour !== undefined) out.currentModelHour = clampNum(raw.currentModelHour, 0, 23.999, 12);
  if (raw.lightningFrequencySec !== undefined) out.lightningFrequencySec = clampNum(raw.lightningFrequencySec, 1, 3600, 25);
  if (isObj(raw.manualColor)) {
    out.manualColor = {
      r: Math.round(clampNum(raw.manualColor.r, 0, 255, 255)),
      g: Math.round(clampNum(raw.manualColor.g, 0, 255, 160)),
      b: Math.round(clampNum(raw.manualColor.b, 0, 255, 60))
    };
  }
  return out;
}

/** Nur bekannte Einstellungen übernehmen; alles andere im Payload wird ignoriert. */
export function sanitizeSettingsPatch(raw: unknown, current: AppSettings): AppSettings {
  const next: AppSettings = { ...current };
  if (!isObj(raw)) return next;
  next.commandStation = sanitizeCommandStation(raw.commandStation, current.commandStation);
  if (['H0', 'N', 'TT', 'Z', '0', 'G'].includes(raw.scale)) next.scale = raw.scale;
  if (raw.targetCreepMs !== undefined) next.targetCreepMs = Math.round(clampNum(raw.targetCreepMs, 100, 20000, current.targetCreepMs || 1200));
  if (typeof raw.ghostDetectionActive === 'boolean') next.ghostDetectionActive = raw.ghostDetectionActive;
  if (typeof raw.manualSensorTriggerInRunMode === 'boolean') next.manualSensorTriggerInRunMode = raw.manualSensorTriggerInRunMode;
  if (isObj(raw.wio)) {
    const port = toInt(raw.wio.udpPort, 1024, 65535);
    next.wio = {
      enabled: typeof raw.wio.enabled === 'boolean' ? raw.wio.enabled : current.wio?.enabled !== false,
      udpPort: port !== null ? port : current.wio?.udpPort || 8051
    };
  }
  if (isObj(raw.ambientLighting) && current.ambientLighting) {
    next.ambientLighting = { ...current.ambientLighting, ...sanitizeLightingPatch(raw.ambientLighting) };
  }
  return next;
}
