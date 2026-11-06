// Reine Editor-Logik ohne DOM-Zugriff (testbar mit `node --test`, siehe scripts/test_editor_core.mjs).
// Nur `import type`, damit Node die Datei ohne Bundler laden kann.
import type { EditorTool, TrackElementLike } from './editorTypes.ts';

/** Undo/Redo-Verlauf als Liste von Gleisplan-Schnappschüssen (JSON). */
export class LayoutHistory {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private readonly limit: number;

  // Keine Parameter-Properties: Node lädt diese Datei im "strip-only"-Modus
  constructor(limit = 100) {
    this.limit = limit;
  }

  /** Zustand VOR einer Änderung merken. Neue Änderung verwirft den Redo-Verlauf. */
  record(layout: readonly TrackElementLike[]): void {
    const snap = JSON.stringify(layout);
    if (this.undoStack[this.undoStack.length - 1] === snap) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo<T extends TrackElementLike>(current: readonly T[]): T[] | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(JSON.stringify(current));
    return JSON.parse(prev) as T[];
  }

  redo<T extends TrackElementLike>(current: readonly T[]): T[] | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(JSON.stringify(current));
    return JSON.parse(next) as T[];
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

export type GridClickDecision =
  | { kind: 'place' }
  | { kind: 'select'; elemId: string }
  | { kind: 'deselect' }
  | { kind: 'rotate'; elemId: string }
  | { kind: 'delete'; elemId: string }
  | { kind: 'inspect'; elemId: string }
  | { kind: 'none' };

const PLACE_TOOLS: ReadonlySet<EditorTool> = new Set<EditorTool>([
  'STRAIGHT', 'CURVE', 'TURNOUT_LEFT', 'TURNOUT_RIGHT', 'BLOCK', 'SIGNAL', 'BUFFER', 'SENSOR'
]);

export function isPlaceTool(tool: EditorTool): boolean {
  return PLACE_TOOLS.has(tool);
}

/**
 * Was passiert bei einem Klick auf ein Rasterfeld?
 * Grundregel gegen Fehlklicks: Platzieren nur auf LEERE Felder. Ein Klick auf ein
 * vorhandenes Element wählt es aus (zweiter Klick hebt die Auswahl auf) – es wird
 * nie stillschweigend ersetzt oder gedreht.
 */
export function decideGridClick(
  existing: TrackElementLike | null,
  tool: EditorTool,
  selectedId: string | null
): GridClickDecision {
  if (tool === 'DELETE') return existing ? { kind: 'delete', elemId: existing.id } : { kind: 'none' };
  if (tool === 'ROTATE') return existing ? { kind: 'rotate', elemId: existing.id } : { kind: 'none' };
  if (tool === 'INSPECT') {
    return existing ? { kind: 'inspect', elemId: existing.id } : (selectedId ? { kind: 'deselect' } : { kind: 'none' });
  }
  if (!existing) return { kind: 'place' };
  if (existing.id === selectedId) return { kind: 'deselect' };
  return { kind: 'select', elemId: existing.id };
}

export function rotateBy90(rotation: number): 0 | 90 | 180 | 270 {
  return (((rotation + 90) % 360 + 360) % 360) as 0 | 90 | 180 | 270;
}

/**
 * Bündelt Neuzeichnungen auf höchstens eine pro Frame und hält sie zurück, solange
 * eine Maustaste/ein Finger gedrückt ist. Sonst ersetzt ein Server-Update das
 * angeklickte SVG-Element zwischen Drücken und Loslassen, und der Klick geht verloren.
 */
export class RenderScheduler {
  private pending = false;
  private frameQueued = false;
  private holds = 0;
  private holdSafety: ReturnType<typeof setTimeout> | null = null;

  private readonly renderNow: () => void;
  private readonly requestFrame: (cb: () => void) => void;
  private readonly maxHoldMs: number;

  constructor(renderNow: () => void, requestFrame: (cb: () => void) => void, maxHoldMs = 4000) {
    this.renderNow = renderNow;
    this.requestFrame = requestFrame;
    this.maxHoldMs = maxHoldMs;
  }

  request(): void {
    this.pending = true;
    this.queue();
  }

  /** Neuzeichnen zurückhalten (pointerdown). */
  hold(): void {
    this.holds++;
    if (this.holdSafety) clearTimeout(this.holdSafety);
    // Falls ein pointerup verloren geht (Fenster verlassen o. Ä.), nicht ewig einfrieren
    this.holdSafety = setTimeout(() => this.releaseAll(), this.maxHoldMs);
  }

  release(): void {
    if (this.holds > 0) this.holds--;
    if (this.holds === 0) this.releaseAll();
  }

  get isHeld(): boolean {
    return this.holds > 0;
  }

  private releaseAll(): void {
    this.holds = 0;
    if (this.holdSafety) {
      clearTimeout(this.holdSafety);
      this.holdSafety = null;
    }
    this.queue();
  }

  private queue(): void {
    if (!this.pending || this.frameQueued || this.holds > 0) return;
    this.frameQueued = true;
    this.requestFrame(() => {
      this.frameQueued = false;
      if (this.holds > 0 || !this.pending) return;
      this.pending = false;
      this.renderNow();
    });
  }
}

/**
 * Mehrfachklick-Schutz: `MouseEvent.detail` zählt schnelle Klicks an derselben Stelle.
 * Nur der erste Klick einer Serie löst eine Aktion aus (Doppelklick = eine Aktion).
 */
export function isRepeatClick(e: { detail?: number }): boolean {
  return typeof e.detail === 'number' && e.detail > 1;
}
