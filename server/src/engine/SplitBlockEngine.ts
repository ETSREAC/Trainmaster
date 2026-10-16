import { BBTEntry, Block, BlockStopPolicy, Locomotive } from '../types.js';

/**
 * 50/50-Gleisaufteilung: dynamischer Haltepunkt nach Zuglänge.
 *
 * Melder A (ENTER der Fahrtrichtung) startet eine Messung, Melder B (IN der Fahrtrichtung, ab der
 * Teilungsmarke) liefert die Referenzposition. Aus der bekannten Strecke der ersten Gleishälfte und
 * den gesendeten Fahrstufen wird der Umrechnungsfaktor cm/(Fahrstufe·ms) bestimmt und daraus eine
 * Bremsrampe bis zum Haltepunkt geplant, die mit einem virtuellen IN endet.
 */

export type SplitStopTarget = 'CENTER' | 'SIGNAL';

export interface EffectiveSplitConfig {
  blockLengthCm: number;
  ratio: number;
  policy: BlockStopPolicy;
  centerStopMarginCm: number;
  signalStopMarginCm: number;
  firstSensorId: string;
  secondSensorId: string;
}

export interface StopPlanInput {
  startSpeed: number;     // aktuelle Fahrstufe bei Melder B
  vMin: number;           // Kriechfahrstufe
  cmPerStepMs: number;    // gemessener Faktor k
  distanceCm: number;     // Reststrecke bis zum Haltepunkt
  rampSteps: number;      // Stufenzahl aus BBT-Profil
  rampIntervalMs: number; // Intervall aus BBT-Profil
}

export interface StopPlan {
  steps: number[];        // nacheinander zu sendende Fahrstufen (letzte = Kriechstufe)
  intervalMs: number;
  creepSpeed: number;
  creepMs: number;
  totalMs: number;
  plannedDistanceCm: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Reine Planungsfunktion (ohne Seiteneffekte, direkt testbar). */
export function planStop(input: StopPlanInput): StopPlan {
  const k = input.cmPerStepMs;
  const D = Math.max(0, input.distanceCm);
  const s0 = Math.max(0, Math.round(input.startSpeed));
  const vMin = Math.max(1, Math.round(input.vMin));

  // Bereits auf/unter Kriechstufe: nur noch kriechen
  if (s0 <= vMin) {
    const creepSpeed = s0;
    const creepMs = creepSpeed > 0 && k > 0 ? Math.round(D / (k * creepSpeed)) : 0;
    return { steps: [], intervalMs: 0, creepSpeed, creepMs, totalMs: creepMs, plannedDistanceCm: k * creepSpeed * creepMs };
  }

  const MIN_INTERVAL_MS = 20;
  const build = (n: number) => {
    const steps: number[] = [];
    for (let i = 1; i <= n; i++) {
      steps.push(i === n ? vMin : Math.round(s0 - (i * (s0 - vMin)) / n));
    }
    // Während Intervall i fährt die Lok mit der zuvor gesendeten Stufe (s0, s1, ..., s_{n-1})
    const sumDriven = s0 + steps.slice(0, -1).reduce((a, b) => a + b, 0);
    return { steps, sumDriven };
  };

  let n = Math.max(1, Math.min(Math.round(input.rampSteps) || 10, s0 - vMin));
  let { steps, sumDriven } = build(n);
  let intervalMs = Math.max(MIN_INTERVAL_MS, Math.round(input.rampIntervalMs) || 80);
  let rampDist = k * intervalMs * sumDriven;

  // Reststrecke zu kurz für die Rampe: erst Intervall verkürzen, dann Stufenzahl reduzieren
  if (rampDist > 0.85 * D) {
    intervalMs = Math.max(MIN_INTERVAL_MS, Math.floor((0.85 * D) / (k * sumDriven)));
    rampDist = k * intervalMs * sumDriven;
    while (rampDist > 0.85 * D && n > 1) {
      n = Math.max(1, Math.min(n - 1, Math.floor((n * 0.85 * D) / rampDist)));
      ({ steps, sumDriven } = build(n));
      rampDist = k * intervalMs * sumDriven;
    }
  }

  const creepMs = Math.max(0, Math.round((D - rampDist) / (k * vMin)));
  const totalMs = intervalMs * n + creepMs;
  return { steps, intervalMs, creepSpeed: vMin, creepMs, totalMs, plannedDistanceCm: rampDist + k * vMin * creepMs };
}

export interface SplitBlockEvents {
  onSpeedStep: (locoId: string, speed: number) => void;
  onVirtualIn: (locoId: string, blockId: string) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

interface LocoTrack {
  blockId: string;
  direction: '+' | '-';
  target: SplitStopTarget;
  phase: 'MEASURING' | 'STOPPING';
  startTs: number;
  lastTs: number;
  lastSpeed: number;
  integral: number; // Σ Fahrstufe·ms seit Melder A
  token: number;
  timer?: unknown;
}

export type FirstSensorResult =
  | { mode: 'POINT' }
  | { mode: 'SPLIT'; target: SplitStopTarget; duplicate: boolean };

export class SplitBlockEngine {
  private tracks = new Map<string, LocoTrack>();
  private tokenSeq = 0;
  private now: () => number;
  private setTimer: (fn: () => void, ms: number) => unknown;
  private clearTimer: (handle: unknown) => void;

  constructor(private events: SplitBlockEvents) {
    this.now = events.now ?? (() => Date.now());
    this.setTimer = events.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = events.clearTimer ?? ((h) => clearTimeout(h as NodeJS.Timeout));
  }

  /**
   * Liefert die wirksame 50/50-Konfiguration für eine Fahrtrichtung.
   * null = Punktmelder-Modus; { reason } = SPLIT gewählt, aber nicht nutzbar (Fallback auf POINT).
   */
  static resolveConfig(block: Block, direction: '+' | '-'): { config?: EffectiveSplitConfig; reason?: string } | null {
    if (block.stopMode !== 'SPLIT') return null;
    const sensors = direction === '+' ? block.sensorsPlus : block.sensorsMinus;
    if (!sensors?.enter || !sensors?.in) {
      return { reason: `Block "${block.name}" (${direction}): für 50/50 werden zwei Melder (ENTER = A, IN = B) benötigt` };
    }
    if (sensors.enter === sensors.in) {
      return { reason: `Block "${block.name}" (${direction}): Melder A und B dürfen nicht identisch sein` };
    }
    if (!(typeof block.lengthCm === 'number' && block.lengthCm > 0)) {
      return { reason: `Block "${block.name}": für 50/50 ist eine gültige Blocklänge nötig` };
    }
    const policy: BlockStopPolicy =
      block.stopPolicy === 'PLATFORM_CENTER' || block.stopPolicy === 'SIGNAL' ? block.stopPolicy : 'AUTO_BY_LENGTH';
    return {
      config: {
        blockLengthCm: block.lengthCm,
        ratio: clamp(num(block.trackSplitRatio, 0.5), 0.2, 0.8),
        policy,
        centerStopMarginCm: clamp(num(block.centerStopMarginCm, 10), 0, 100),
        signalStopMarginCm: clamp(num(block.signalStopMarginCm, 8), 0, 100),
        firstSensorId: sensors.enter,
        secondSensorId: sensors.in
      }
    };
  }

  static resolveTarget(cfg: EffectiveSplitConfig, loco: Locomotive): SplitStopTarget {
    if (cfg.policy === 'PLATFORM_CENTER') return 'CENTER';
    if (cfg.policy === 'SIGNAL') return 'SIGNAL';
    const len = loco.lengthCm;
    // Unbekannte Länge -> Signal, damit Einfahrweichen sicher geräumt werden
    return typeof len === 'number' && len > 0 && len <= cfg.blockLengthCm * cfg.ratio ? 'CENTER' : 'SIGNAL';
  }

  isRunning(locoId: string): boolean {
    return this.tracks.get(locoId)?.phase === 'STOPPING';
  }

  /** Integrator der gesendeten Fahrstufen (aus onSpeedChanged gespeist). */
  notifySpeed(locoId: string, speed: number): void {
    const t = this.tracks.get(locoId);
    if (!t || t.phase !== 'MEASURING') return;
    const now = this.now();
    t.integral += t.lastSpeed * Math.max(0, now - t.lastTs);
    t.lastTs = now;
    t.lastSpeed = Math.max(0, speed);
  }

  /** Melder A: Messung starten und Haltestrategie festlegen. */
  onFirstSensor(block: Block, loco: Locomotive, direction: '+' | '-'): FirstSensorResult {
    const resolved = SplitBlockEngine.resolveConfig(block, direction);
    if (!resolved) return { mode: 'POINT' };
    if (!resolved.config) {
      this.events.onLog(`[50/50] ${resolved.reason} – Punktmelder-Verhalten aktiv.`, 'warn');
      return { mode: 'POINT' };
    }

    const existing = this.tracks.get(loco.id);
    if (existing && existing.blockId === block.id) {
      return { mode: 'SPLIT', target: existing.target, duplicate: true };
    }
    // Stehende Lok (z. B. Zugende prellt auf Melder A): keine neue Fahrt
    if (loco.speed <= 0) {
      return { mode: 'SPLIT', target: SplitBlockEngine.resolveTarget(resolved.config, loco), duplicate: true };
    }

    this.cancel(loco.id);
    const target = SplitBlockEngine.resolveTarget(resolved.config, loco);
    const now = this.now();
    this.tracks.set(loco.id, {
      blockId: block.id, direction, target, phase: 'MEASURING',
      startTs: now, lastTs: now, lastSpeed: loco.speed, integral: 0, token: ++this.tokenSeq
    });
    this.events.onLog(
      `[50/50] ${loco.name} fährt in "${block.name}" ein (${loco.lengthCm || '?'} cm) → Halt ${target === 'CENTER' ? 'Bahnsteigmitte' : 'am Signal'}.`,
      'info'
    );
    return { mode: 'SPLIT', target, duplicate: false };
  }

  /**
   * Melder B: Halteplan ausführen.
   * @returns true = übernommen (kein sofortiger IN), false = sofortiger IN (Punktmelder-Verhalten).
   */
  onSecondSensor(block: Block, loco: Locomotive, direction: '+' | '-', bbt?: BBTEntry): boolean {
    const resolved = SplitBlockEngine.resolveConfig(block, direction);
    if (!resolved?.config) return false;
    const cfg = resolved.config;

    const t = this.tracks.get(loco.id);
    if (t && t.blockId === block.id && t.phase === 'STOPPING') return true; // Prellen ignorieren
    if (loco.speed <= 0) return true; // steht bereits, nichts zu tun

    if (!t || t.blockId !== block.id) {
      this.events.onLog(`[50/50] ${loco.name}: Melder B in "${block.name}" ohne vorherigen Melder A – Halt an der Teilungsmarke.`, 'warn');
      return false;
    }

    this.notifySpeed(loco.id, loco.speed); // Integral bis jetzt abschließen
    const firstHalfCm = cfg.blockLengthCm * cfg.ratio;
    const elapsed = this.now() - t.startTs;
    if (elapsed <= 0 || t.integral <= 0) {
      this.tracks.delete(loco.id);
      this.events.onLog(`[50/50] ${loco.name}: keine gültige Geschwindigkeitsmessung – Halt an der Teilungsmarke.`, 'warn');
      return false;
    }
    const k = firstHalfCm / t.integral;

    const distanceCm = t.target === 'CENTER'
      ? Math.max(0, (loco.lengthCm || 0) / 2 + cfg.centerStopMarginCm)
      : Math.max(0, cfg.blockLengthCm * (1 - cfg.ratio) - cfg.signalStopMarginCm);

    const plan = planStop({
      startSpeed: loco.speed,
      vMin: bbt?.vMin ?? loco.vMin ?? 10,
      cmPerStepMs: k,
      distanceCm,
      rampSteps: bbt?.steps ?? 10,
      rampIntervalMs: bbt?.intervalMs ?? 80
    });

    const frontCm = firstHalfCm + plan.plannedDistanceCm;
    const tailCm = frontCm - (loco.lengthCm || 0);
    this.events.onLog(
      `[50/50] ${loco.name}: ${(firstHalfCm / elapsed * 1000).toFixed(1)} cm/s gemessen, Halt nach ${Math.round(distanceCm)} cm ` +
      `(Spitze bei ~${Math.round(frontCm)} von ${cfg.blockLengthCm} cm, ${plan.totalMs} ms).`,
      'info'
    );
    if (tailCm < 0) {
      this.events.onLog(`[50/50] ${loco.name} passt nicht vollständig in "${block.name}" (Zugende ${Math.round(-tailCm)} cm vor dem Block).`, 'warn');
    }

    t.phase = 'STOPPING';
    t.token = ++this.tokenSeq;
    this.runPlan(loco.id, block.id, plan, t.token);
    return true;
  }

  private runPlan(locoId: string, blockId: string, plan: StopPlan, token: number): void {
    const valid = () => this.tracks.get(locoId)?.token === token;
    let i = 0;
    const finish = () => {
      if (!valid()) return;
      this.tracks.delete(locoId);
      this.events.onVirtualIn(locoId, blockId);
    };
    const next = () => {
      if (!valid()) return;
      if (i < plan.steps.length) {
        this.events.onSpeedStep(locoId, plan.steps[i++]);
        // Nach der letzten Stufe (Kriechstufe) nur noch die Kriechzeit bis zum virtuellen IN
        if (i < plan.steps.length) this.schedule(locoId, next, plan.intervalMs);
        else this.schedule(locoId, finish, plan.creepMs);
        return;
      }
      finish();
    };
    if (plan.steps.length === 0) this.schedule(locoId, finish, plan.creepMs);
    else this.schedule(locoId, next, plan.intervalMs);
  }

  private schedule(locoId: string, fn: () => void, ms: number): void {
    const t = this.tracks.get(locoId);
    if (!t) return;
    t.timer = this.setTimer(fn, Math.max(0, ms));
  }

  cancel(locoId: string): void {
    const t = this.tracks.get(locoId);
    if (!t) return;
    if (t.timer !== undefined) this.clearTimer(t.timer);
    this.tracks.delete(locoId);
  }

  cancelAll(): void {
    for (const id of [...this.tracks.keys()]) this.cancel(id);
  }
}
