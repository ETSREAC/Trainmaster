import { Locomotive } from '../types.js';

/** Höchste Funktionsnummer, die TrainMaster verwaltet (F0–F28). */
export const MAX_FUNCTION_INDEX = 28;

/** Standard, wenn für eine Lok nichts eingestellt ist: nur F0 (Spitzenlicht nach NMRA). */
export const DEFAULT_AUTO_FUNCTIONS: readonly number[] = [0];

/**
 * Funktionen, die der Automatikbetrieb für diese Lok einschaltet
 * (beim Start der Automatik, bei Abfahrt und nach Richtungswechsel).
 * Leeres Array = Automatik schaltet nichts.
 */
export function getAutoFunctions(loco: Pick<Locomotive, 'autoFunctions'>): number[] {
  return Array.isArray(loco.autoFunctions) ? [...loco.autoFunctions] : [...DEFAULT_AUTO_FUNCTIONS];
}

function isFunctionIndex(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_FUNCTION_INDEX;
}

/** Client-Eingabe prüfen: nur ganze Zahlen 0–28, ohne Doppelte, sortiert. `undefined` = Standard. */
export function sanitizeAutoFunctions(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter(isFunctionIndex))].sort((a, b) => a - b);
}

/** Funktionsnamen prüfen: Schlüssel 0–28, Text ohne spitze Klammern, max. 64 Zeichen, leere entfernt. */
export function sanitizeFunctionLabels(value: unknown): Record<number, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<number, string> = {};
  for (const [key, label] of Object.entries(value as Record<string, unknown>)) {
    const idx = Number(key);
    if (!isFunctionIndex(idx) || typeof label !== 'string') continue;
    const clean = label.replace(/[<>]/g, '').trim().slice(0, 64);
    if (clean) out[idx] = clean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
