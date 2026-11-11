import { Direction, Locomotive } from '../types.js';
import { MAX_FUNCTION_INDEX, sanitizeAutoFunctions, sanitizeFunctionLabels } from './locoFunctions.js';

function sanitizeLocoName(name: string): string {
  if (typeof name !== 'string') return 'Lokomotive';
  const cleaned = name.replace(/<[^>]*>?/gm, '').replace(/[<>'"/`]/g, '').trim();
  return cleaned.slice(0, 64) || 'Lokomotive';
}

const TRAIN_TYPES = ['PASSENGER', 'FREIGHT', 'COMMUTER', 'HIGH_SPEED', 'SHUNTER'];

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Gültige DCC-Lokadresse (1–10239) oder null. */
export function validDccAddress(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 10239 ? n : null;
}

/** Stammdaten einer Lok prüfen (alles, was der Client frei setzen darf). */
function sanitizeLocoConfig(loco: Locomotive): Pick<Locomotive, 'vMin' | 'vMid' | 'vMax' | 'lengthCm' | 'trainType'> {
  const vMin = Math.round(num(loco.vMin, 0, 128, 10));
  const vMax = Math.max(vMin, Math.round(num(loco.vMax, 0, 128, 100)));
  const vMid = Math.min(vMax, Math.max(vMin, Math.round(num(loco.vMid, 0, 128, 55))));
  return {
    vMin,
    vMid,
    vMax,
    lengthCm: num(loco.lengthCm, 1, 10000, 20),
    trainType: TRAIN_TYPES.includes(loco.trainType) ? loco.trainType : 'PASSENGER'
  };
}

export interface LocoEvents {
  onLocoUpdated: (loco: Locomotive) => void;
  onLocoDeleted?: (locoId: string) => void;
  onSpeedChanged: (loco: Locomotive) => void;
  onFunctionChanged: (loco: Locomotive, functionIndex: number, active: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

export class LocoManager {
  private locos: Map<string, Locomotive> = new Map();
  private events: LocoEvents;

  constructor(initialLocos: Locomotive[], events: LocoEvents) {
    this.events = events;
    for (const l of initialLocos) {
      this.locos.set(l.id, { ...l, name: sanitizeLocoName(l.name), autoFunctions: sanitizeAutoFunctions(l.autoFunctions) });
    }
  }

  getLoco(id: string): Locomotive | undefined {
    return this.locos.get(id);
  }

  getAllLocos(): Locomotive[] {
    return Array.from(this.locos.values());
  }

  setSpeed(id: string, speed: number, direction?: Direction): boolean {
    const loco = this.locos.get(id);
    if (!loco) return false;
    // Ungültige Werte (Text, NaN, null) nie an die Zentrale weiterreichen
    if (typeof speed !== 'number' || !Number.isFinite(speed)) return false;

    loco.speed = Math.max(0, Math.min(128, Math.round(speed)));
    loco.targetSpeed = loco.speed;
    if (direction === 'FWD' || direction === 'REV') {
      loco.direction = direction;
    }

    this.events.onLocoUpdated(loco);
    this.events.onSpeedChanged(loco);
    return true;
  }

  setFunction(id: string, functionIndex: number, active: boolean): boolean {
    const loco = this.locos.get(id);
    if (!loco) return false;
    if (!Number.isInteger(functionIndex) || functionIndex < 0 || functionIndex > MAX_FUNCTION_INDEX) return false;

    loco.functions[functionIndex] = !!active;
    this.events.onLocoUpdated(loco);
    this.events.onFunctionChanged(loco, functionIndex, !!active);
    return true;
  }

  emergencyStopAll(): void {
    for (const loco of this.locos.values()) {
      loco.speed = 0;
      loco.targetSpeed = 0;
      this.events.onLocoUpdated(loco);
      this.events.onSpeedChanged(loco);
    }
    this.events.onLog('Alle Lokomotiven per Nothalt gestoppt (Fahrstufe 0).', 'warn');
  }

  setLocoBlock(id: string, blockId: string | null): void {
    const loco = this.locos.get(id);
    if (!loco) return;
    loco.currentBlockId = blockId;
    this.events.onLocoUpdated(loco);
  }

  addLoco(loco: Locomotive): boolean {
    if (!loco || typeof loco !== 'object') return false;
    const dccAddress = validDccAddress(loco.dccAddress);
    if (dccAddress === null) {
      this.events.onLog(`Lok nicht angelegt: ungültige DCC-Adresse (${String(loco.dccAddress)}). Erlaubt ist 1–10239.`, 'warn');
      return false;
    }
    const id = typeof loco.id === 'string' && /^[^\u0000-\u001f<>"'`&\\]{1,96}$/.test(loco.id) ? loco.id : `loco-${Date.now()}`;
    if (this.locos.has(id)) {
      this.events.onLog(`Lok nicht angelegt: ID "${id}" existiert bereits.`, 'warn');
      return false;
    }
    const sanitized: Locomotive = {
      id,
      name: sanitizeLocoName(loco.name),
      dccAddress,
      // Laufzeitwerte starten immer neutral, unabhängig vom Client
      speed: 0,
      targetSpeed: 0,
      direction: loco.direction === 'REV' ? 'REV' : 'FWD',
      functions: {},
      ...sanitizeLocoConfig(loco),
      currentBlockId: null,
      functionLabels: sanitizeFunctionLabels(loco.functionLabels),
      autoFunctions: sanitizeAutoFunctions(loco.autoFunctions),
      image: undefined // nur über den Upload-Endpunkt setzbar
    };
    this.locos.set(sanitized.id, sanitized);
    this.events.onLocoUpdated(sanitized);
    this.events.onLog(`Neue Lokomotive "${sanitized.name}" (DCC #${sanitized.dccAddress}) erfolgreich angelegt.`, 'info');
    return true;
  }

  updateLoco(loco: Locomotive): boolean {
    if (!loco || typeof loco !== 'object') return false;
    const existing = this.locos.get(loco.id);
    if (!existing) return false;
    const dccAddress = validDccAddress(loco.dccAddress);
    if (dccAddress === null) {
      this.events.onLog(`Lok "${existing.name}" nicht geändert: ungültige DCC-Adresse (${String(loco.dccAddress)}).`, 'warn');
      return false;
    }

    // Bestehendes Objekt aktualisieren (Laufzeitwerte und Referenzen anderer Module bleiben gültig)
    existing.name = sanitizeLocoName(loco.name);
    existing.dccAddress = dccAddress;
    Object.assign(existing, sanitizeLocoConfig(loco));
    existing.functionLabels = sanitizeFunctionLabels(loco.functionLabels);
    existing.autoFunctions = sanitizeAutoFunctions(loco.autoFunctions);
    this.events.onLocoUpdated(existing);
    this.events.onLog(`Lokomotive "${existing.name}" aktualisiert.`, 'info');
    return true;
  }

  /** Setzt oder entfernt das Lokbild (Pfad vom LocoImageStore). */
  setImage(id: string, image: string | undefined): boolean {
    const loco = this.locos.get(id);
    if (!loco) return false;
    loco.image = image;
    this.events.onLocoUpdated(loco);
    return true;
  }

  deleteLoco(id: string): void {
    const loco = this.locos.get(id);
    if (loco) {
      this.locos.delete(id);
      this.events.onLocoDeleted?.(id);
      this.events.onLog(`Lokomotive "${loco.name}" gelöscht.`, 'warn');
    }
  }
}
