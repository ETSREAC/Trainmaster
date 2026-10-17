import { Direction, Locomotive } from '../types.js';

function sanitizeLocoName(name: string): string {
  if (typeof name !== 'string') return 'Lokomotive';
  const cleaned = name.replace(/<[^>]*>?/gm, '').replace(/[<>'"/`]/g, '').trim();
  return cleaned.slice(0, 64) || 'Lokomotive';
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
      this.locos.set(l.id, { ...l, name: sanitizeLocoName(l.name) });
    }
  }

  getLoco(id: string): Locomotive | undefined {
    return this.locos.get(id);
  }

  getAllLocos(): Locomotive[] {
    return Array.from(this.locos.values());
  }

  setSpeed(id: string, speed: number, direction?: Direction): void {
    const loco = this.locos.get(id);
    if (!loco) return;

    loco.speed = Math.max(0, Math.min(128, Math.round(speed)));
    loco.targetSpeed = loco.speed;
    if (direction) {
      loco.direction = direction;
    }

    this.events.onLocoUpdated(loco);
    this.events.onSpeedChanged(loco);
  }

  setFunction(id: string, functionIndex: number, active: boolean): void {
    const loco = this.locos.get(id);
    if (!loco) return;

    loco.functions[functionIndex] = active;
    this.events.onLocoUpdated(loco);
    this.events.onFunctionChanged(loco, functionIndex, active);
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

  addLoco(loco: Locomotive): void {
    const sanitized: Locomotive = {
      ...loco,
      name: sanitizeLocoName(loco.name),
      image: undefined // nur über den Upload-Endpunkt setzbar
    };
    this.locos.set(sanitized.id, sanitized);
    this.events.onLocoUpdated(sanitized);
    this.events.onLog(`Neue Lokomotive "${sanitized.name}" (DCC #${sanitized.dccAddress}) erfolgreich angelegt.`, 'info');
  }

  updateLoco(loco: Locomotive): void {
    const existing = this.locos.get(loco.id);
    const speed = existing ? existing.speed : 0;
    const direction = existing ? existing.direction : 'FWD';
    const functions = existing ? existing.functions : {};
    const currentBlockId = existing ? existing.currentBlockId : null;

    const updated: Locomotive = {
      ...loco,
      name: sanitizeLocoName(loco.name),
      speed,
      targetSpeed: speed,
      direction,
      functions,
      currentBlockId,
      image: existing?.image // Client-Wert ignorieren, nur Upload-Endpunkt setzt das Bild
    };
    this.locos.set(loco.id, updated);
    this.events.onLocoUpdated(updated);
    this.events.onLog(`Lokomotive "${updated.name}" aktualisiert.`, 'info');
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
