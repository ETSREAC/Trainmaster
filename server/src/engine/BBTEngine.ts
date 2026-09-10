import { BBTEntry, Locomotive } from '../types.js';

export interface BBTEvents {
  onSpeedStep: (locoId: string, speed: number) => void;
  onBBTUpdated: (entry: BBTEntry) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

interface ActiveBraking {
  locoId: string;
  blockId: string;
  direction: '+' | '-';
  timerId: NodeJS.Timeout;
  currentStep: number;
  totalSteps: number;
  vStart: number;
  vMin: number;
  intervalMs: number;
  enterTime: number;
  creepStartTime?: number;
}

export class BBTEngine {
  private bbtEntries: Map<string, BBTEntry> = new Map();
  private activeBraking: Map<string, ActiveBraking> = new Map(); // Key: locoId
  private events: BBTEvents;

  // Wunsch-Kriechzeit vor dem Halt am IN-Sensor in Millisekunden
  public targetCreepDurationMs = 1200;

  constructor(initialEntries: BBTEntry[], events: BBTEvents) {
    this.events = events;
    for (const entry of initialEntries) {
      this.bbtEntries.set(this.getEntryKey(entry.locoId, entry.blockId, entry.direction), entry);
    }
  }

  private getEntryKey(locoId: string, blockId: string, direction: '+' | '-'): string {
    return `${locoId}__${blockId}__${direction}`;
  }

  getEntry(locoId: string, blockId: string, direction: '+' | '-'): BBTEntry | undefined {
    return this.bbtEntries.get(this.getEntryKey(locoId, blockId, direction));
  }

  saveEntry(entry: BBTEntry): void {
    const key = this.getEntryKey(entry.locoId, entry.blockId, entry.direction);
    this.bbtEntries.set(key, entry);
    this.events.onBBTUpdated(entry);
  }

  getAllEntries(): BBTEntry[] {
    return Array.from(this.bbtEntries.values());
  }

  /**
   * Startet die BBT-Bremsrampe beim ENTER-Ereignis
   */
  startBraking(loco: Locomotive, blockId: string, direction: '+' | '-'): void {
    // Falls bereits eine Bremsung für diese Lok läuft, abbrechen
    this.cancelBraking(loco.id);

    let entry = this.getEntry(loco.id, blockId, direction);
    if (!entry) {
      // Automatisches Anlegen eines neuen BBT-Profils
      entry = {
        locoId: loco.id,
        blockId,
        direction,
        steps: Math.max(10, loco.speed - loco.vMin),
        intervalMs: 80, // Default 80ms pro Stufe
        vStart: loco.speed,
        vMin: loco.vMin,
        locked: false
      };
      this.saveEntry(entry);
      this.events.onLog(`Neues BBT-Profil erstellt für Lok ${loco.name} in Block ${blockId}`, 'info');
    }

    const vStart = loco.speed > 0 ? loco.speed : entry.vStart;
    const vMin = entry.vMin;
    const totalSteps = Math.max(1, entry.steps);
    const speedDelta = vStart - vMin;

    if (speedDelta <= 0) {
      return; // Bereits auf oder unter Kriechgeschwindigkeit
    }

    const stepSpeedDecrement = speedDelta / totalSteps;
    let currentStep = 0;
    const enterTime = Date.now();

    this.events.onLog(`[BBT] Bremsphase gestartet: Lok ${loco.name}, ${vStart} -> ${vMin} in ${totalSteps} Schritten (${entry.intervalMs}ms/Schritt)`, 'info');

    const runStep = () => {
      currentStep++;
      const newSpeed = Math.round(vStart - (currentStep * stepSpeedDecrement));

      if (currentStep >= totalSteps || newSpeed <= vMin) {
        // Kriechgeschwindigkeit erreicht
        this.events.onSpeedStep(loco.id, vMin);
        const active = this.activeBraking.get(loco.id);
        if (active) {
          active.creepStartTime = Date.now();
        }
        this.events.onLog(`[BBT] Kriechgeschwindigkeit ${vMin} erreicht, warte auf IN-Sensor...`, 'info');
        return;
      }

      this.events.onSpeedStep(loco.id, newSpeed);

      // Nächsten Schritt timen
      const timerId = setTimeout(runStep, entry!.intervalMs);
      const active = this.activeBraking.get(loco.id);
      if (active) {
        active.timerId = timerId;
        active.currentStep = currentStep;
      }
    };

    const timerId = setTimeout(runStep, entry.intervalMs);
    this.activeBraking.set(loco.id, {
      locoId: loco.id,
      blockId,
      direction,
      timerId,
      currentStep: 0,
      totalSteps,
      vStart,
      vMin,
      intervalMs: entry.intervalMs,
      enterTime
    });
  }

  /**
   * Wird aufgerufen, wenn der IN-Sensor auslöst (Ziel-Haltepunkt)
   */
  handleInEvent(loco: Locomotive, blockId: string, direction: '+' | '-'): void {
    const active = this.activeBraking.get(loco.id);
    const now = Date.now();

    // Lok sofort auf 0 stoppen
    this.events.onSpeedStep(loco.id, 0);

    if (!active) {
      return;
    }

    clearTimeout(active.timerId);
    this.activeBraking.delete(loco.id);

    const entry = this.getEntry(loco.id, blockId, direction);
    if (!entry || entry.locked) {
      return; // Profil gesperrt gegen automatisches Lernen
    }

    const overranIn = !active.creepStartTime;
    let creepDurationMs = 0;

    if (overranIn) {
      // Zug hat IN erreicht, bevor er fertig abgebremst war! Bremsung war zu zögerlich/langsam.
      this.events.onLog(`[BBT LERNEN] Lok ${loco.name} hat IN überfahren (war noch in Bremsrampe)! Verkürze Intervall.`, 'warn');
      const adjustedInterval = Math.max(30, Math.round(entry.intervalMs * 0.75));
      entry.intervalMs = adjustedInterval;
    } else {
      creepDurationMs = now - active.creepStartTime!;
      const diff = creepDurationMs - this.targetCreepDurationMs;

      // Adaptiver Lernschritt (Glättung)
      const correctionPerStep = (diff * 0.25) / Math.max(1, entry.steps);
      const newInterval = Math.max(35, Math.min(300, Math.round(entry.intervalMs + correctionPerStep)));

      this.events.onLog(`[BBT LERNEN] Kriechzeit: ${creepDurationMs}ms (Soll: ${this.targetCreepDurationMs}ms). Intervall: ${entry.intervalMs}ms -> ${newInterval}ms`, 'info');
      entry.intervalMs = newInterval;
    }

    entry.lastRunMetrics = {
      creepDurationMs,
      targetCreepDurationMs: this.targetCreepDurationMs,
      overranIn,
      timestamp: now
    };

    this.saveEntry(entry);
  }

  cancelBraking(locoId: string): void {
    const active = this.activeBraking.get(locoId);
    if (active) {
      clearTimeout(active.timerId);
      this.activeBraking.delete(locoId);
    }
  }
}
