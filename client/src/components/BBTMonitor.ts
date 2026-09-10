import { BBTEntry } from '../types.js';
import { wsClient } from '../wsClient.js';

export class BBTMonitor {
  private tbody: HTMLElement;

  constructor(tbody: HTMLElement) {
    this.tbody = tbody;
    this.init();
  }

  private init(): void {
    wsClient.subscribe(() => this.render());
    this.render();
  }

  public render(): void {
    this.tbody.innerHTML = '';

    if (wsClient.bbt.length === 0) {
      this.tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#8b949e;padding:20px;">Noch keine BBT-Einträge gelernt. Fahre Züge über Blöcke mit ENTER/IN!</td></tr>';
      return;
    }

    for (const entry of wsClient.bbt) {
      const loco = wsClient.locos.find((l) => l.id === entry.locoId);
      const block = wsClient.blocks.find((b) => b.id === entry.blockId);

      const tr = document.createElement('tr');

      let lastRunText = 'Noch nicht gefahren';
      if (entry.lastRunMetrics) {
        if (entry.lastRunMetrics.overranIn) {
          lastRunText = '⚠️ Zu schnell (IN überfahren)';
        } else {
          lastRunText = `Kriechzeit: ${entry.lastRunMetrics.creepDurationMs}ms`;
        }
      }

      tr.innerHTML = `
        <td><strong>${loco?.name || entry.locoId}</strong></td>
        <td>${block?.name || entry.blockId}</td>
        <td><code>${entry.direction}</code></td>
        <td>${entry.steps}</td>
        <td><strong>${entry.intervalMs} ms</strong></td>
        <td>${entry.vStart}</td>
        <td>${entry.vMin}</td>
        <td style="color:${entry.lastRunMetrics?.overranIn ? '#f85149' : '#3fb950'}">${lastRunText}</td>
        <td>
          <input type="checkbox" ${entry.locked ? 'checked' : ''} class="bbt-lock-check" />
        </td>
      `;

      const check = tr.querySelector('.bbt-lock-check') as HTMLInputElement;
      check?.addEventListener('change', () => {
        const updated: BBTEntry = { ...entry, locked: check.checked };
        wsClient.send({
          type: 'SAVE_BBT_ENTRY',
          payload: { entry: updated }
        });
      });

      this.tbody.appendChild(tr);
    }
  }
}
