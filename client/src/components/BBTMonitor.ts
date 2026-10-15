import { BBTEntry, BBTRunMetric } from '../types.js';
import { wsClient } from '../wsClient.js';
import { iconAlert } from '../icons.js';
import { t } from '../i18n.js';

export class BBTMonitor {
  private tbody: HTMLElement;
  private blockSelect: HTMLSelectElement | null = null;
  private locoSelect: HTMLSelectElement | null = null;
  private dirSelect: HTMLSelectElement | null = null;
  private detailContainer: HTMLElement | null = null;

  private selectedBlockId: string = '';
  private selectedLocoId: string = '';
  private selectedDir: '+' | '-' = '+';
  private hasInitializedSelection = false;

  constructor(tbody: HTMLElement) {
    this.tbody = tbody;
    this.blockSelect = document.getElementById('bbt-filter-block') as HTMLSelectElement | null;
    this.locoSelect = document.getElementById('bbt-filter-loco') as HTMLSelectElement | null;
    this.dirSelect = document.getElementById('bbt-filter-dir') as HTMLSelectElement | null;
    this.detailContainer = document.getElementById('bbt-detail-container');

    this.bindEvents();
    this.init();
  }

  private bindEvents(): void {
    this.blockSelect?.addEventListener('change', () => {
      this.selectedBlockId = this.blockSelect?.value || '';
      this.renderDetail();
      this.renderTable();
    });

    this.locoSelect?.addEventListener('change', () => {
      this.selectedLocoId = this.locoSelect?.value || '';
      this.renderDetail();
      this.renderTable();
    });

    this.dirSelect?.addEventListener('change', () => {
      this.selectedDir = (this.dirSelect?.value === '-' ? '-' : '+');
      this.renderDetail();
      this.renderTable();
    });
  }

  private init(): void {
    wsClient.subscribe(() => this.render());
    this.render();
  }

  public render(): void {
    this.updateDropdowns();
    this.renderDetail();
    this.renderTable();
  }

  private calculateMedian(values: number[]): number {
    if (!values || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) return sorted[mid];
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  private updateDropdowns(): void {
    if (!this.blockSelect || !this.locoSelect) return;

    // Default-Auswahl beim ersten Laden bestimmen falls noch nicht gesetzt
    if (!this.hasInitializedSelection) {
      if (wsClient.bbt.length > 0) {
        this.selectedBlockId = wsClient.bbt[0].blockId;
        this.selectedLocoId = wsClient.bbt[0].locoId;
        this.selectedDir = wsClient.bbt[0].direction;
      } else {
        if (wsClient.blocks.length > 0) this.selectedBlockId = wsClient.blocks[0].id;
        if (wsClient.locos.length > 0) this.selectedLocoId = wsClient.locos[0].id;
      }
      this.hasInitializedSelection = true;
    }

    // Blöcke Dropdown
    const currentBlock = this.selectedBlockId;
    this.blockSelect.innerHTML = '<option value="">-- Block wählen --</option>';
    for (const b of wsClient.blocks) {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name} (${b.id})`;
      if (b.id === currentBlock) opt.selected = true;
      this.blockSelect.appendChild(opt);
    }
    // Falls ein BBT-Eintrag einen Block hat der nicht in wsClient.blocks existiert
    for (const entry of wsClient.bbt) {
      if (!wsClient.blocks.some((b) => b.id === entry.blockId)) {
        if (!Array.from(this.blockSelect.options).some((o) => o.value === entry.blockId)) {
          const opt = document.createElement('option');
          opt.value = entry.blockId;
          opt.textContent = entry.blockId;
          if (entry.blockId === currentBlock) opt.selected = true;
          this.blockSelect.appendChild(opt);
        }
      }
    }

    // Fahrzeuge Dropdown
    const currentLoco = this.selectedLocoId;
    this.locoSelect.innerHTML = '<option value="">-- Fahrzeug wählen --</option>';
    for (const l of wsClient.locos) {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = `${l.name} [DCC ${l.dccAddress}]`;
      if (l.id === currentLoco) opt.selected = true;
      this.locoSelect.appendChild(opt);
    }
    for (const entry of wsClient.bbt) {
      if (!wsClient.locos.some((l) => l.id === entry.locoId)) {
        if (!Array.from(this.locoSelect.options).some((o) => o.value === entry.locoId)) {
          const opt = document.createElement('option');
          opt.value = entry.locoId;
          opt.textContent = entry.locoId;
          if (entry.locoId === currentLoco) opt.selected = true;
          this.locoSelect.appendChild(opt);
        }
      }
    }

    // Richtung Dropdown
    if (this.dirSelect) {
      this.dirSelect.value = this.selectedDir;
    }
  }

  private renderDetail(): void {
    if (!this.detailContainer) return;

    if (!this.selectedBlockId || !this.selectedLocoId) {
      this.detailContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 24px;">
          <p style="font-size: 15px; margin-bottom: 6px;">${t('bbt.no_selection_prompt')}</p>
          <p style="font-size: 13px;">${t('bbt.no_selection_desc')}</p>
        </div>
      `;
      return;
    }

    const entry = wsClient.bbt.find(
      (e) => e.blockId === this.selectedBlockId && e.locoId === this.selectedLocoId && e.direction === this.selectedDir
    );

    const block = wsClient.blocks.find((b) => b.id === this.selectedBlockId);
    const loco = wsClient.locos.find((l) => l.id === this.selectedLocoId);
    const blockName = block ? block.name : this.selectedBlockId;
    const locoName = loco ? loco.name : this.selectedLocoId;
    const dirLabel = this.selectedDir === '+' ? t('bbt.filter_dir_fwd') : t('bbt.filter_dir_rev');

    if (!entry) {
      this.detailContainer.innerHTML = `
        <div class="bbt-header-bar">
          <div class="bbt-profile-title">
            <span>🚩 Profil: <strong>${blockName}</strong> · <strong>${locoName}</strong> [${dirLabel}]</span>
            <span class="badge" style="background: rgba(139, 148, 158, 0.2); color: var(--text-muted);">${t('bbt.no_profile_title')}</span>
          </div>
        </div>
        <div style="padding: 16px 0; color: var(--text-muted);">
          <p style="margin-bottom: 12px; font-size: 14px;">
            ${t('bbt.no_profile_desc')}
          </p>
          <button id="btn-create-bbt-profile" class="btn btn-save" style="display: inline-flex; align-items: center; gap: 6px;">
            ${t('bbt.btn_init_profile')}
          </button>
        </div>
      `;

      document.getElementById('btn-create-bbt-profile')?.addEventListener('click', () => {
        const newEntry: BBTEntry = {
          blockId: this.selectedBlockId,
          locoId: this.selectedLocoId,
          direction: this.selectedDir,
          steps: 25,
          intervalMs: 80,
          vStart: loco ? Math.max(30, loco.speed || 50) : 50,
          vMin: loco ? loco.vMin : 12,
          locked: false,
          history: []
        };
        wsClient.send({
          type: 'SAVE_BBT_ENTRY',
          payload: { entry: newEntry }
        });
      });
      return;
    }

    // Historie und Median ("Meridian") berechnen
    const historyList = entry.history || (entry.lastRunMetrics ? [entry.lastRunMetrics] : []);
    const validCreepTimes = historyList
      .filter((h) => !h.overranIn && typeof h.creepDurationMs === 'number' && h.creepDurationMs > 0)
      .map((h) => h.creepDurationMs);

    const medianCreepMs = this.calculateMedian(validCreepTimes);
    // CR-19: Sollwert aus den Einstellungen statt fest codiert
    const targetCreepMs = wsClient.settings.targetCreepMs || 1200;
    const medianDelta = medianCreepMs > 0 ? medianCreepMs - targetCreepMs : null;

    let medianBadge = `<span style="color:var(--text-muted);font-size:12px;">${t('bbt.no_measurements')}</span>`;
    if (medianCreepMs > 0) {
      const deltaSign = medianDelta! >= 0 ? `+${medianDelta}` : `${medianDelta}`;
      const color = Math.abs(medianDelta!) <= 200 ? '#3fb950' : Math.abs(medianDelta!) <= 500 ? '#d29922' : '#f85149';
      medianBadge = `<span style="color:${color}; font-size: 13px; font-weight:600;">${medianCreepMs} ms (Δ ${deltaSign} ms)</span>`;
    }

    const lockBadge = entry.locked
      ? `<span class="bbt-badge-status bbt-badge-locked">${t('bbt.locked_status')}</span>`
      : `<span class="bbt-badge-status bbt-badge-optimal">${t('bbt.learning_status')}</span>`;

    const lockButtonHtml = entry.locked
      ? `<button id="btn-toggle-bbt-lock" class="btn" style="background: #238636; color: #fff; border-color: #2ea043; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
          ${t('bbt.btn_unlock')}
        </button>`
      : `<button id="btn-toggle-bbt-lock" class="btn" style="background: #da3633; color: #fff; border-color: #f85149; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">
          ${t('bbt.btn_lock')}
        </button>`;

    let lastRunDisplay = 'Noch nicht gefahren';
    if (entry.lastRunMetrics) {
      if (entry.lastRunMetrics.overranIn) {
        lastRunDisplay = `<span style="color:#f85149; font-weight:600; display:inline-flex; align-items:center; gap:4px;">${iconAlert(13, '#f85149')} IN überfahren</span>`;
      } else {
        const delta = entry.lastRunMetrics.creepDurationMs - targetCreepMs;
        const deltaSign = delta >= 0 ? `+${delta}` : `${delta}`;
        lastRunDisplay = `<strong>${entry.lastRunMetrics.creepDurationMs} ms</strong> <span style="font-size:11px;color:var(--text-muted);">(Δ ${deltaSign} ms)</span>`;
      }
    }

    this.detailContainer.innerHTML = `
      <div class="bbt-header-bar">
        <div class="bbt-profile-title">
          <span>🚩 Profil: <strong>${blockName}</strong> · <strong>${locoName}</strong> [${dirLabel}]</span>
          ${lockBadge}
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          ${lockButtonHtml}
        </div>
      </div>

      <div class="bbt-stats-grid">
        <!-- Intervall -->
        <div class="bbt-stat-card">
          <div class="bbt-stat-label">Bremsintervall (Zeit/Stufe)</div>
          <div class="bbt-stat-value">
            <span id="bbt-val-interval">${entry.intervalMs}</span> <span style="font-size:12px;font-weight:normal;color:var(--text-muted);">ms</span>
          </div>
          <div class="bbt-stepper" style="margin-top: 4px;">
            <button class="bbt-stepper-btn" id="bbt-step-sub5">-5 ms</button>
            <input type="number" id="bbt-input-interval" value="${entry.intervalMs}" min="20" max="600" style="width:65px;padding:3px 6px;font-size:12px;background:var(--bg-secondary);color:#fff;border:1px solid var(--border-color);border-radius:4px;text-align:center;" />
            <button class="bbt-stepper-btn" id="bbt-step-add5">+5 ms</button>
            <button class="bbt-stepper-btn" id="bbt-step-save" style="background:#238636;border-color:#2ea043;color:#fff;" title="Wert speichern">💾</button>
          </div>
          <div class="bbt-stat-sub">Regelt die Dauer des Ausrollens</div>
        </div>

        <!-- Bremsstufen -->
        <div class="bbt-stat-card">
          <div class="bbt-stat-label">Bremsstufen (Schritte)</div>
          <div class="bbt-stat-value">
            <span id="bbt-val-steps">${entry.steps}</span> <span style="font-size:12px;font-weight:normal;color:var(--text-muted);">Stufen</span>
          </div>
          <div class="bbt-stepper" style="margin-top: 4px;">
            <button class="bbt-stepper-btn" id="bbt-steps-sub1">-1</button>
            <input type="number" id="bbt-input-steps" value="${entry.steps}" min="5" max="100" style="width:55px;padding:3px 6px;font-size:12px;background:var(--bg-secondary);color:#fff;border:1px solid var(--border-color);border-radius:4px;text-align:center;" />
            <button class="bbt-stepper-btn" id="bbt-steps-add1">+1</button>
            <button class="bbt-stepper-btn" id="bbt-steps-save" style="background:#238636;border-color:#2ea043;color:#fff;">💾</button>
          </div>
          <div class="bbt-stat-sub">Auflösung der Bremsrampe</div>
        </div>

        <!-- Meridian / Median -->
        <div class="bbt-stat-card">
          <div class="bbt-stat-label">Meridian / Median Kriechzeit</div>
          <div class="bbt-stat-value">
            ${medianBadge}
          </div>
          <div class="bbt-stat-sub">
            Soll-Kriechzeit: <strong>${targetCreepMs} ms</strong> (${validCreepTimes.length} Messungen)
          </div>
        </div>

        <!-- Geschwindigkeiten -->
        <div class="bbt-stat-card">
          <div class="bbt-stat-label">Geschwindigkeiten</div>
          <div class="bbt-stat-value" style="font-size:15px;">
            V_Min: <strong style="color:#38bdf8;">${entry.vMin}</strong> · V_Start: <strong style="color:#d29922;">${entry.vStart}</strong>
          </div>
          <div class="bbt-stat-sub">
            Letzter Lauf: ${lastRunDisplay}
          </div>
        </div>
      </div>

      <!-- Historie-Bereich -->
      <div style="margin-top: 6px;">
        <div class="bbt-history-header">
          <h4 style="font-size: 14px; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
            📜 Fahrten-Historie für dieses Profil
            <span class="badge" style="background:var(--bg-tertiary);border:1px solid var(--border-color);font-size:11px;">${historyList.length} Fahrten</span>
          </h4>
          ${historyList.length > 0 ? `<button id="btn-clear-bbt-history" class="btn" style="padding:4px 10px;font-size:12px;color:#8b949e;background:transparent;border:1px solid var(--border-color);">🗑️ Historie leeren</button>` : ''}
        </div>

        <div class="table-responsive" style="margin-top: 8px; max-height: 240px; overflow-y: auto;">
          <table class="data-table" style="font-size: 12px;">
            <thead>
              <tr>
                <th style="padding: 8px 12px; width: 40px;">#</th>
                <th style="padding: 8px 12px;">Zeitpunkt</th>
                <th style="padding: 8px 12px;">Kriechzeit</th>
                <th style="padding: 8px 12px;">Soll-Kriechzeit</th>
                <th style="padding: 8px 12px;">Abweichung (Δ)</th>
                <th style="padding: 8px 12px;">Intervall-Anpassung</th>
                <th style="padding: 8px 12px;">Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              ${this.renderHistoryRows(historyList, entry.locked)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Event Listeners für Detail-Interaktionen
    document.getElementById('btn-toggle-bbt-lock')?.addEventListener('click', () => {
      const updated: BBTEntry = { ...entry, locked: !entry.locked };
      wsClient.send({
        type: 'SAVE_BBT_ENTRY',
        payload: { entry: updated }
      });
    });

    // Intervall Buttons
    document.getElementById('bbt-step-sub5')?.addEventListener('click', () => {
      const val = Math.max(20, entry.intervalMs - 5);
      const updated: BBTEntry = { ...entry, intervalMs: val };
      wsClient.send({ type: 'SAVE_BBT_ENTRY', payload: { entry: updated } });
    });

    document.getElementById('bbt-step-add5')?.addEventListener('click', () => {
      const val = Math.min(500, entry.intervalMs + 5);
      const updated: BBTEntry = { ...entry, intervalMs: val };
      wsClient.send({ type: 'SAVE_BBT_ENTRY', payload: { entry: updated } });
    });

    document.getElementById('bbt-step-save')?.addEventListener('click', () => {
      const inp = document.getElementById('bbt-input-interval') as HTMLInputElement;
      if (inp) {
        const val = Math.max(20, Math.min(600, parseInt(inp.value, 10) || entry.intervalMs));
        const updated: BBTEntry = { ...entry, intervalMs: val };
        wsClient.send({ type: 'SAVE_BBT_ENTRY', payload: { entry: updated } });
      }
    });

    // Bremsstufen Buttons
    document.getElementById('bbt-steps-sub1')?.addEventListener('click', () => {
      const val = Math.max(5, entry.steps - 1);
      const updated: BBTEntry = { ...entry, steps: val };
      wsClient.send({ type: 'SAVE_BBT_ENTRY', payload: { entry: updated } });
    });

    document.getElementById('bbt-steps-add1')?.addEventListener('click', () => {
      const val = Math.min(100, entry.steps + 1);
      const updated: BBTEntry = { ...entry, steps: val };
      wsClient.send({ type: 'SAVE_BBT_ENTRY', payload: { entry: updated } });
    });

    document.getElementById('bbt-steps-save')?.addEventListener('click', () => {
      const inp = document.getElementById('bbt-input-steps') as HTMLInputElement;
      if (inp) {
        const val = Math.max(5, Math.min(100, parseInt(inp.value, 10) || entry.steps));
        const updated: BBTEntry = { ...entry, steps: val };
        wsClient.send({ type: 'SAVE_BBT_ENTRY', payload: { entry: updated } });
      }
    });

    // Historie leeren
    document.getElementById('btn-clear-bbt-history')?.addEventListener('click', () => {
      if (confirm('Möchtest du die Historie dieses Profils wirklich zurücksetzen?')) {
        const updated: BBTEntry = { ...entry, history: [], lastRunMetrics: undefined };
        wsClient.send({ type: 'SAVE_BBT_ENTRY', payload: { entry: updated } });
      }
    });
  }

  private renderHistoryRows(history: BBTRunMetric[], isLocked: boolean): string {
    if (history.length === 0) {
      return `<tr><td colspan="7" style="text-align:center;color:#8b949e;padding:16px;">Noch keine Fahrten aufgezeichnet. Starte die Automatik!</td></tr>`;
    }

    return history
      .map((metric, idx) => {
        const runNum = history.length - idx;
        const timeStr = metric.timestamp ? new Date(metric.timestamp).toLocaleTimeString() : '-';
        const targetMs = metric.targetCreepDurationMs || wsClient.settings.targetCreepMs || 1200;

        let creepStr = `${metric.creepDurationMs} ms`;
        let deltaStr = '-';
        let badge = '';

        if (metric.overranIn) {
          creepStr = `<span style="color:#f85149;font-weight:600;">0 ms (Nicht erreicht)</span>`;
          deltaStr = `<span style="color:#f85149;font-weight:600;">Überfahren!</span>`;
          badge = `<span class="bbt-badge-status bbt-badge-overrun">🔴 IN überfahren</span>`;
        } else {
          const delta = metric.creepDurationMs - targetMs;
          const sign = delta >= 0 ? `+${delta}` : `${delta}`;
          if (Math.abs(delta) <= 250) {
            deltaStr = `<span style="color:#3fb950;font-weight:600;">${sign} ms</span>`;
            badge = `<span class="bbt-badge-status bbt-badge-optimal">🟢 Optimal</span>`;
          } else {
            deltaStr = `<span style="color:#d29922;font-weight:600;">${sign} ms</span>`;
            badge = `<span class="bbt-badge-status bbt-badge-adjust">🟡 Lernschritt</span>`;
          }
        }

        if (isLocked) {
          badge = `<span class="bbt-badge-status bbt-badge-locked">🔒 Profil fixiert</span>`;
        }

        let intervalChange = '-';
        if (metric.intervalBeforeMs !== undefined && metric.intervalAfterMs !== undefined) {
          if (metric.intervalBeforeMs === metric.intervalAfterMs) {
            intervalChange = `<code>${metric.intervalBeforeMs} ms</code> (fix)`;
          } else {
            intervalChange = `<code>${metric.intervalBeforeMs} ms</code> ➔ <strong style="color:#38bdf8;">${metric.intervalAfterMs} ms</strong>`;
          }
        }

        return `
          <tr>
            <td style="padding: 6px 12px; color: var(--text-muted);">${runNum}</td>
            <td style="padding: 6px 12px;">${timeStr}</td>
            <td style="padding: 6px 12px;">${creepStr}</td>
            <td style="padding: 6px 12px; color: var(--text-muted);">${targetMs} ms</td>
            <td style="padding: 6px 12px;">${deltaStr}</td>
            <td style="padding: 6px 12px;">${intervalChange}</td>
            <td style="padding: 6px 12px;">${badge}</td>
          </tr>
        `;
      })
      .join('');
  }

  private renderTable(): void {
    this.tbody.innerHTML = '';

    if (wsClient.bbt.length === 0) {
      this.tbody.innerHTML =
        '<tr><td colspan="10" style="text-align:center;color:#8b949e;padding:24px;">Noch keine BBT-Einträge gelernt. Fahre Züge über Blöcke mit ENTER/IN!</td></tr>';
      return;
    }

    for (const entry of wsClient.bbt) {
      const loco = wsClient.locos.find((l) => l.id === entry.locoId);
      const block = wsClient.blocks.find((b) => b.id === entry.blockId);

      const isSelected =
        entry.blockId === this.selectedBlockId &&
        entry.locoId === this.selectedLocoId &&
        entry.direction === this.selectedDir;

      const tr = document.createElement('tr');
      tr.className = `bbt-clickable-row ${isSelected ? 'bbt-row-selected' : ''}`;

      // Median berechnen
      const historyList = entry.history || (entry.lastRunMetrics ? [entry.lastRunMetrics] : []);
      const validCreeps = historyList
        .filter((h) => !h.overranIn && typeof h.creepDurationMs === 'number' && h.creepDurationMs > 0)
        .map((h) => h.creepDurationMs);
      const medianCreep = this.calculateMedian(validCreeps);

      let medianText = '-';
      if (medianCreep > 0) {
        const delta = medianCreep - (wsClient.settings.targetCreepMs || 1200);
        const color = Math.abs(delta) <= 200 ? '#3fb950' : Math.abs(delta) <= 500 ? '#d29922' : '#f85149';
        medianText = `<span style="color:${color};font-weight:600;">${medianCreep} ms</span> <span style="font-size:11px;color:var(--text-muted);">(${validCreeps.length})</span>`;
      }

      let lastRunText = 'Noch nicht gefahren';
      if (entry.lastRunMetrics) {
        if (entry.lastRunMetrics.overranIn) {
          lastRunText = `<span style="display:inline-flex;align-items:center;gap:4px;color:#f85149;font-weight:600;">${iconAlert(13, '#f85149')} IN überfahren</span>`;
        } else {
          lastRunText = `Kriechzeit: <strong>${entry.lastRunMetrics.creepDurationMs} ms</strong>`;
        }
      }

      const statusBadge = entry.locked
        ? `<span class="bbt-badge-status bbt-badge-locked" style="margin-left:6px;">🔒 Gesperrt</span>`
        : `<span class="bbt-badge-status bbt-badge-optimal" style="margin-left:6px;">🟢 Lernt</span>`;

      tr.innerHTML = `
        <td><strong>${loco?.name || entry.locoId}</strong></td>
        <td>${block?.name || entry.blockId}</td>
        <td><code>${entry.direction === '+' ? 'Vorwärts (+)' : 'Rückwärts (-)'}</code></td>
        <td>${entry.steps}</td>
        <td><strong style="color:#38bdf8;">${entry.intervalMs} ms</strong></td>
        <td>${entry.vStart}</td>
        <td>${entry.vMin}</td>
        <td>${medianText}</td>
        <td>${lastRunText}</td>
        <td style="white-space: nowrap;">
          <input type="checkbox" ${entry.locked ? 'checked' : ''} class="bbt-lock-check" title="Profil gegen automatisches Lernen sperren" />
          ${statusBadge}
        </td>
      `;

      // Klick auf Zeile wählt Eintrag in den Filtern oben aus
      tr.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        this.selectedBlockId = entry.blockId;
        this.selectedLocoId = entry.locoId;
        this.selectedDir = entry.direction;
        if (this.blockSelect) this.blockSelect.value = entry.blockId;
        if (this.locoSelect) this.locoSelect.value = entry.locoId;
        if (this.dirSelect) this.dirSelect.value = entry.direction;
        this.renderDetail();
        this.renderTable();
      });

      const check = tr.querySelector('.bbt-lock-check') as HTMLInputElement;
      check?.addEventListener('change', (e) => {
        e.stopPropagation();
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
