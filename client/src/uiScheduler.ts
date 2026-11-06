// Gemeinsamer Neuzeichnen-Schutz für alle HTML-Listen (Depot, Rückmelder, Signale, BBT ...).
//
// Problem: Jede Server-Nachricht (Log, Sensor, Lichtsteuerung jede Sekunde) hat ganze Bereiche per
// innerHTML neu gebaut – auch zwischen Drücken und Loslassen der Maustaste. Der Klick traf dann ein
// Element, das es nicht mehr gab, und ging verloren.
//
// Lösung:
//  1. Neuzeichnen nur, wenn sich die Daten des Bereichs wirklich geändert haben (Signatur-Vergleich).
//  2. Höchstens einmal pro Frame.
//  3. Nie, solange eine Maustaste/ein Finger gedrückt ist – dann direkt nach dem Loslassen
//     (der click-Event ist zu diesem Zeitpunkt bereits verarbeitet).

type Job = { signature: () => string; render: () => void; last: string | null };

const jobs = new Map<string, Job>();
const dirty = new Set<string>();
let pointerDown = false;
let frameQueued = false;
let safetyTimer: number | null = null;

function flushSoon(): void {
  if (frameQueued || pointerDown || dirty.size === 0) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    if (pointerDown) return;
    const keys = [...dirty];
    dirty.clear();
    for (const key of keys) {
      const job = jobs.get(key);
      if (!job) continue;
      let sig: string;
      try {
        sig = job.signature();
      } catch {
        sig = String(Math.random()); // im Zweifel neu zeichnen
      }
      if (sig === job.last) continue;
      job.last = sig;
      job.render();
    }
  });
}

function release(): void {
  pointerDown = false;
  if (safetyTimer !== null) {
    window.clearTimeout(safetyTimer);
    safetyTimer = null;
  }
  flushSoon();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => {
    pointerDown = true;
    if (safetyTimer !== null) window.clearTimeout(safetyTimer);
    // Falls pointerup verloren geht (Fenster verlassen): nicht ewig einfrieren
    safetyTimer = window.setTimeout(release, 4000);
  }, true);
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('blur', release);
}

/**
 * Bereich registrieren. `signature` beschreibt alle Daten, die der Bereich anzeigt;
 * `render` baut ihn auf. Gibt eine Funktion zurück, die ein (geprüftes) Neuzeichnen anfordert.
 */
export function registerView(key: string, signature: () => string, render: () => void): (force?: boolean) => void {
  const job: Job = { signature, render, last: null };
  jobs.set(key, job);
  return (force = false) => {
    if (force) job.last = null;
    dirty.add(key);
    flushSoon();
  };
}

/** Sofort und ungeprüft zeichnen (z. B. nach einer eigenen Nutzeraktion), Signatur merken. */
export function renderViewNow(key: string): void {
  const job = jobs.get(key);
  if (!job) return;
  try {
    job.last = job.signature();
  } catch {
    job.last = null;
  }
  job.render();
}
