// Schutz für alle Dialogfenster (.modal-overlay):
//  - Ein Klick neben das Fenster schließt es NICHT mehr (vorher waren alle Eingaben weg).
//  - Esc schließt das oberste Fenster. Wurde etwas geändert, wird vorher gefragt.
//  - Speichern per Doppelklick legt nichts doppelt an (Formular wird kurz gesperrt).

const OPEN_SNAPSHOT = new WeakMap<HTMLElement, string>();
const SUBMIT_LOCK_MS = 900;

function isOpen(modal: HTMLElement): boolean {
  return getComputedStyle(modal).display !== 'none';
}

/** Alle Eingabewerte eines Fensters als Text – zum Erkennen ungespeicherter Änderungen. */
function snapshot(modal: HTMLElement): string {
  const parts: string[] = [];
  modal.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach((el) => {
    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') parts.push(`${el.id || el.name}:${el.checked}`);
      else if (el.type !== 'file' && el.type !== 'hidden') parts.push(`${el.id || el.name}:${el.value}`);
    } else {
      parts.push(`${el.id || el.name}:${el.value}`);
    }
  });
  return parts.join('|');
}

function closeModal(modal: HTMLElement): void {
  // Vorhandenen Schließen-/Abbrechen-Knopf benutzen, damit die Komponente aufräumen kann
  const btn = modal.querySelector<HTMLButtonElement>(
    '[id^="btn-"][id$="-close"], [id^="btn-"][id$="-cancel"], .modal-close, .btn-close'
  );
  if (btn) btn.click();
  else modal.style.display = 'none';
}

function topmostOpenModal(): HTMLElement | null {
  const open = Array.from(document.querySelectorAll<HTMLElement>('.modal-overlay')).filter(isOpen);
  if (open.length === 0) return null;
  // Höchster z-index gewinnt, bei Gleichstand das zuletzt im DOM stehende
  return open.reduce((a, b) => (Number(getComputedStyle(b).zIndex) || 0) >= (Number(getComputedStyle(a).zIndex) || 0) ? b : a);
}

export function initModalGuard(): void {
  const modals = Array.from(document.querySelectorAll<HTMLElement>('.modal-overlay'));

  for (const modal of modals) {
    // Beim Öffnen den Ausgangszustand merken (Fenster werden per style.display geöffnet).
    // Kurz warten, weil die Komponenten die Felder direkt nach dem Öffnen befüllen.
    const observer = new MutationObserver(() => {
      if (isOpen(modal)) {
        if (!OPEN_SNAPSHOT.has(modal)) {
          OPEN_SNAPSHOT.set(modal, snapshot(modal));
          requestAnimationFrame(() => {
            if (isOpen(modal)) OPEN_SNAPSHOT.set(modal, snapshot(modal));
          });
        }
      } else {
        OPEN_SNAPSHOT.delete(modal);
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });

    // Klick auf den abgedunkelten Hintergrund abfangen, bevor ein Komponenten-Handler das Fenster schließt
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        e.stopImmediatePropagation();
        const dialog = modal.firstElementChild as HTMLElement | null;
        dialog?.classList.remove('modal-nudge');
        void dialog?.offsetWidth; // Animation neu starten
        dialog?.classList.add('modal-nudge');
      }
    }, true);
  }

  // Esc schließt das oberste Fenster – mit Rückfrage bei ungespeicherten Änderungen
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = topmostOpenModal();
    if (!modal) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const before = OPEN_SNAPSHOT.get(modal);
    const changed = before !== undefined && before !== snapshot(modal);
    if (changed && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
    closeModal(modal);
  }, true);

  // Doppelklick auf "Speichern" → nur eine Speicherung
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    const now = Date.now();
    const last = Number(form.dataset.lastSubmit || 0);
    if (now - last < SUBMIT_LOCK_MS) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    form.dataset.lastSubmit = String(now);
    const buttons = form.querySelectorAll<HTMLButtonElement>('button[type="submit"], input[type="submit"]');
    buttons.forEach((b) => { b.disabled = true; });
    window.setTimeout(() => buttons.forEach((b) => { b.disabled = false; }), SUBMIT_LOCK_MS);
  }, true);
}
