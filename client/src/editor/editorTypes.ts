// Typen für die Editor-Logik, bewusst ohne Laufzeit-Imports (siehe editorCore.ts).

export type EditorTool =
  | 'STRAIGHT'
  | 'CURVE'
  | 'TURNOUT_LEFT'
  | 'TURNOUT_RIGHT'
  | 'BLOCK'
  | 'SIGNAL'
  | 'BUFFER'
  | 'SENSOR'
  | 'INSPECT'
  | 'ROTATE'
  | 'DELETE';

/** Minimale Form eines Gleisplan-Elements, die die Editor-Logik braucht. */
export interface TrackElementLike {
  id: string;
  x: number;
  y: number;
  rotation: number;
  type: string;
  linkedId?: string;
}
