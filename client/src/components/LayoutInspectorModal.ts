import { wsClient } from '../wsClient.js';
import { LayoutInspectionResult } from '../types.js';
import { iconAlert, iconDot } from '../icons.js';

export class LayoutInspectorModal {
  private modalEl: HTMLElement | null = null;
  private currentResult: LayoutInspectionResult | null = null;
  private activeTab: 'diagnose' | 'routes' = 'diagnose';
  private selectedRouteIds: Set<string> = new Set();

  constructor() {
    this.modalEl = document.getElementById('modal-layout-inspector');
    this.initEvents();

    wsClient.onInspection((result) => {
      this.currentResult = result;
      this.render();
    });
  }

  private initEvents(): void {
    // Schließen-Buttons
    document.getElementById('btn-inspector-close')?.addEventListener('click', () => this.close());
    document.getElementById('btn-inspector-dismiss')?.addEventListener('click', () => this.close());

    // Tab-Umschaltung
    document.getElementById('tab-btn-inspector-diag')?.addEventListener('click', () => {
      this.switchTab('diagnose');
    });
    document.getElementById('tab-btn-inspector-routes')?.addEventListener('click', () => {
      this.switchTab('routes');
    });

    // Neu prüfen / neu berechnen
    document.getElementById('btn-inspector-refresh')?.addEventListener('click', () => {
      this.triggerInspect();
    });

    // Block-Zuordnungen anwenden
    document.getElementById('btn-apply-block-assignments')?.addEventListener('click', () => {
      this.applyBlockAssignments();
    });

    // Fahrstraßen speichern (Ersetzen)
    document.getElementById('btn-save-routes-replace')?.addEventListener('click', () => {
      this.saveGeneratedRoutes('REPLACE');
    });

    // Fahrstraßen speichern (Hinzufügen)
    document.getElementById('btn-save-routes-merge')?.addEventListener('click', () => {
      this.saveGeneratedRoutes('MERGE');
    });
  }

  public open(initialTab: 'diagnose' | 'routes' = 'diagnose'): void {
    if (!this.modalEl) {
      this.modalEl = document.getElementById('modal-layout-inspector');
    }
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
    }
    this.switchTab(initialTab);
    this.triggerInspect();
  }

  public close(): void {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }

  private switchTab(tab: 'diagnose' | 'routes'): void {
    this.activeTab = tab;
    const tabDiag = document.getElementById('inspector-tab-content-diag');
    const tabRoutes = document.getElementById('inspector-tab-content-routes');
    const btnDiag = document.getElementById('tab-btn-inspector-diag');
    const btnRoutes = document.getElementById('tab-btn-inspector-routes');

    if (tabDiag) tabDiag.style.display = tab === 'diagnose' ? 'block' : 'none';
    if (tabRoutes) tabRoutes.style.display = tab === 'routes' ? 'block' : 'none';

    btnDiag?.classList.toggle('active', tab === 'diagnose');
    btnRoutes?.classList.toggle('active', tab === 'routes');
  }

  public triggerInspect(): void {
    const statusMsg = document.getElementById('inspector-status-text');
    if (statusMsg) {
      statusMsg.innerHTML = '<em>Gleisplan wird analysiert und Fahrstraßen berechnet...</em>';
    }
    wsClient.send({ type: 'INSPECT_LAYOUT' });
  }

  private render(): void {
    if (!this.currentResult) return;
    const res = this.currentResult;

    // Reset Route-Auswahl auf alle gefundenen Routen
    this.selectedRouteIds = new Set(res.generatedRoutes.map((r) => r.id));

    // Status Header
    const statusMsg = document.getElementById('inspector-status-text');
    if (statusMsg) {
      if (res.issues.length === 0) {
        statusMsg.innerHTML = `<span style="color:#3fb950;font-weight:bold;display:inline-flex;align-items:center;gap:6px;">${iconDot('#3fb950', 8)} Topologie einwandfrei!</span> Alle Gleise und Weichen sind nahtlos verbunden.`;
      } else {
        const errors = res.issues.filter((i) => i.type === 'OPEN_END');
        statusMsg.innerHTML = `<span style="color:#d29922;font-weight:bold;display:inline-flex;align-items:center;gap:6px;">${iconAlert(14, '#d29922')} ${res.issues.length} Hinweise gefunden</span> (${errors.length} offene Gleisenden).`;
      }
    }

    // Tab 1: Diagnose & Block-Zuordnung
    this.renderDiagnoseTab(res);

    // Tab 2: Fahrstraßen
    this.renderRoutesTab(res);

    this.switchTab(this.activeTab);
  }

  private renderDiagnoseTab(res: LayoutInspectionResult): void {
    // Diagnose-Karten
    const cardsContainer = document.getElementById('inspector-diag-cards');
    if (cardsContainer) {
      const openEnds = res.issues.filter((i) => i.type === 'OPEN_END').length;
      cardsContainer.innerHTML = `
        <div class="stat-card">
          <div class="stat-value">${res.assignments.length}</div>
          <div class="stat-label">Gefundene Blöcke</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${res.generatedRoutes.length}</div>
          <div class="stat-label">Mögliche Fahrstraßen</div>
        </div>
        <div class="stat-card ${openEnds > 0 ? 'warn' : 'ok'}">
          <div class="stat-value">${openEnds}</div>
          <div class="stat-label">Offene Gleisenden</div>
        </div>
        <div class="stat-card ${res.valid ? 'ok' : 'warn'}">
          <div class="stat-value">${res.valid ? 'BEREIT' : 'PRÜFEN'}</div>
          <div class="stat-label">System-Status</div>
        </div>
      `;
    }

    // Hinweismeldungen
    const issuesContainer = document.getElementById('inspector-issues-list');
    if (issuesContainer) {
      if (res.issues.length === 0) {
        issuesContainer.innerHTML = `<div class="alert alert-success" style="padding:10px 14px;border-radius:6px;background:rgba(35,134,54,0.15);border:1px solid #238636;color:#3fb950;display:flex;align-items:center;gap:6px;">
          ${iconDot('#3fb950', 8)} Keine offenen Gleisenden oder fehlende Weichenverbindungen gefunden. Das Gleisnetz ist vollständig geschlossen!
        </div>`;
      } else {
        issuesContainer.innerHTML = `
          <div style="font-weight:600;margin-bottom:8px;color:#f0883e;display:flex;align-items:center;gap:6px;">
            ${iconAlert(14, '#f0883e')} Topologie-Hinweise (${res.issues.length}):
          </div>
          <div style="max-height:120px;overflow-y:auto;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:8px;font-size:12px;font-family:monospace;">
            ${res.issues
              .map((iss) => {
                return `<div style="padding:3px 0;border-bottom:1px solid #21262d;"><strong>[${iss.type}]</strong> ${iss.message}</div>`;
              })
              .join('')}
          </div>
        `;
      }
    }

    // Tabelle für Block-Zuordnungen
    const tbody = document.getElementById('inspector-blocks-tbody');
    if (tbody) {
      if (res.assignments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#8b949e;padding:20px;">Keine Blöcke auf dem Gleisplan platziert.</td></tr>`;
      } else {
        tbody.innerHTML = res.assignments
          .map((a) => {
            const sensorsCount = a.detectedSensorIds.length;
            const plusStr = `<span class="badge badge-enter">ENTER: ${a.sensorsPlus.enter || '-'}</span> ➔ <span class="badge badge-in">IN: ${a.sensorsPlus.in || '-'}</span>`;
            const minusStr = `<span class="badge badge-enter">ENTER: ${a.sensorsMinus.enter || '-'}</span> ➔ <span class="badge badge-in">IN: ${a.sensorsMinus.in || '-'}</span>`;

            let sigBadges = '';
            if (a.exitSignalPlus) sigBadges += `<span class="badge badge-sig">+ ${a.exitSignalPlus}</span> `;
            if (a.exitSignalMinus) sigBadges += `<span class="badge badge-sig">- ${a.exitSignalMinus}</span>`;
            if (!sigBadges) sigBadges = `<span style="color:#6e7681;">-</span>`;

            return `
              <tr>
                <td><strong>${a.blockName}</strong><br><small style="color:#8b949e;">${a.blockId}</small></td>
                <td>${plusStr}</td>
                <td>${minusStr}</td>
                <td>${sigBadges}</td>
                <td>
                  <span class="badge ${sensorsCount >= 2 ? 'badge-ok' : (sensorsCount === 1 ? 'badge-warn' : 'badge-err')}">
                    ${sensorsCount} ${sensorsCount === 1 ? 'Sensor' : 'Sensoren'}
                  </span>
                </td>
              </tr>
            `;
          })
          .join('');
      }
    }
  }

  private renderRoutesTab(res: LayoutInspectionResult): void {
    const countBadge = document.getElementById('inspector-routes-count');
    if (countBadge) {
      countBadge.textContent = `${res.generatedRoutes.length} Fahrstraßen gefunden`;
    }

    const tbody = document.getElementById('inspector-routes-tbody');
    if (tbody) {
      if (res.generatedRoutes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#8b949e;padding:24px;">Keine verbundenen Fahrwege zwischen Blöcken gefunden. Bitte Gleisplan-Verbindungen prüfen.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.generatedRoutes
        .map((r) => {
          const isChecked = this.selectedRouteIds.has(r.id);
          const fromBlock = wsClient.blocks.find((b) => b.id === r.fromBlockId);
          const toBlock = wsClient.blocks.find((b) => b.id === r.toBlockId);

          const turnoutPills = r.turnoutSettings.length > 0
            ? r.turnoutSettings
                .map((ts) => {
                  const toObj = wsClient.turnouts.find((t) => t.id === ts.turnoutId);
                  const name = toObj ? toObj.name : ts.turnoutId;
                  const isStr = ts.state === 'STRAIGHT';
                  return `<span class="turnout-pill ${isStr ? 'straight' : 'divergent'}">
                    ${isStr ? '➔' : '⤵'} ${name}: ${isStr ? 'Gerade' : 'Abzweig'}
                  </span>`;
                })
                .join(' ')
            : `<span style="color:#6e7681;">Direkte Strecke</span>`;

          const signalPills = r.signalSettings && r.signalSettings.length > 0
            ? r.signalSettings
                .map((ss) => {
                  const isHp1 = ss.aspect === 'HP1';
                  return `<span class="signal-pill ${isHp1 ? 'hp1' : 'hp2'}">
                    ${isHp1 ? '🟢' : '🟡'} ${ss.signalId}: ${ss.aspect}
                  </span>`;
                })
                .join(' ')
            : `<span style="color:#6e7681;">-</span>`;

          return `
            <tr>
              <td style="text-align:center;">
                <input type="checkbox" class="route-select-cb" data-route-id="${r.id}" ${isChecked ? 'checked' : ''} />
              </td>
              <td><span class="badge badge-dir">${r.direction}</span></td>
              <td>
                <strong>${fromBlock ? fromBlock.name : r.fromBlockId}</strong>
                <span style="color:#58a6ff;margin:0 4px;">➔</span>
                <strong>${toBlock ? toBlock.name : r.toBlockId}</strong>
              </td>
              <td>${turnoutPills}</td>
              <td>${signalPills}</td>
              <td><small style="color:#8b949e;">${r.id}</small></td>
            </tr>
          `;
        })
        .join('');

      // Checkbox-Listener
      tbody.querySelectorAll<HTMLInputElement>('.route-select-cb').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          const id = (e.target as HTMLInputElement).dataset.routeId;
          if (!id) return;
          if ((e.target as HTMLInputElement).checked) {
            this.selectedRouteIds.add(id);
          } else {
            this.selectedRouteIds.delete(id);
          }
        });
      });

      // Master Checkbox
      const masterCb = document.getElementById('cb-select-all-routes') as HTMLInputElement | null;
      if (masterCb) {
        masterCb.checked = this.selectedRouteIds.size === res.generatedRoutes.length;
        masterCb.onclick = () => {
          const checked = masterCb.checked;
          if (checked) {
            this.selectedRouteIds = new Set(res.generatedRoutes.map((r) => r.id));
          } else {
            this.selectedRouteIds.clear();
          }
          this.renderRoutesTab(res);
        };
      }
    }
  }

  private applyBlockAssignments(): void {
    if (!this.currentResult) return;
    const assignments = this.currentResult.assignments;
    if (assignments.length === 0) return;

    wsClient.send({
      type: 'APPLY_BLOCK_ASSIGNMENTS',
      payload: { assignments }
    });

    const alertBox = document.getElementById('inspector-alert');
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">${iconDot('#3fb950', 8)} <strong>Zuordnungen übernommen!</strong></span> ${assignments.length} Blöcke wurden mit Sensoren und Signalen aktualisiert und dauerhaft gespeichert.`;
      setTimeout(() => {
        alertBox.style.display = 'none';
      }, 4000);
    }
  }

  private saveGeneratedRoutes(mode: 'REPLACE' | 'MERGE'): void {
    if (!this.currentResult) return;
    const all = this.currentResult.generatedRoutes;
    const selected = all.filter((r) => this.selectedRouteIds.has(r.id));

    if (selected.length === 0) {
      alert('Bitte wähle mindestens eine Fahrstraße zum Speichern aus.');
      return;
    }

    wsClient.send({
      type: 'SAVE_GENERATED_ROUTES',
      payload: { routes: selected, mode }
    });

    const alertBox = document.getElementById('inspector-alert');
    if (alertBox) {
      alertBox.style.display = 'block';
      alertBox.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">${iconDot('#38bdf8', 8)} <strong>Fahrstraßen aktiviert!</strong></span> ${selected.length} Fahrstraßen wurden erfolgreich im Stellwerk gespeichert.`;
      setTimeout(() => {
        alertBox.style.display = 'none';
      }, 4000);
    }
  }
}
