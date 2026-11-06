// Kleine Hinweis-Einblendung unten am Bildschirm, optional mit Aktion (z. B. "Rückgängig").
// Ersetzt blockierende alert()-Fenster für Meldungen, die keine Entscheidung brauchen.
import { escapeHtml } from './sanitize.js';

let hideTimer: number | null = null;

function getHost(): HTMLElement {
  let host = document.getElementById('tm-toast');
  if (!host) {
    host = document.createElement('div');
    host.id = 'tm-toast';
    host.className = 'tm-toast';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

export function showToast(
  message: string,
  opts: { actionLabel?: string; onAction?: () => void; durationMs?: number; tone?: 'info' | 'warn' } = {}
): void {
  const host = getHost();
  host.className = `tm-toast visible${opts.tone === 'warn' ? ' warn' : ''}`;
  host.innerHTML = `<span class="tm-toast-text">${escapeHtml(message)}</span>`;

  if (opts.actionLabel && opts.onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tm-toast-action';
    btn.textContent = opts.actionLabel;
    let used = false;
    btn.addEventListener('click', () => {
      if (used) return; // Doppelklick löst die Aktion nur einmal aus
      used = true;
      hideToast();
      opts.onAction?.();
    });
    host.appendChild(btn);
  }

  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hideToast, opts.durationMs ?? 5000);
}

export function hideToast(): void {
  const host = document.getElementById('tm-toast');
  if (host) host.className = 'tm-toast';
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}
