/**
 * TrainMaster - Supporter & Clean-Version Manager
 * =============================================================================
 * Handles Header Support Button, Supporter Modal, and Key Verification.
 */

import { getSupporterState, isCleanEditionUnlocked, unlockCleanEdition, removeSupporterCode } from '../license.js';
import { t } from '../i18n.js';

export class SupporterManager {
  private headerBtn = document.getElementById('btn-header-supporter') as HTMLButtonElement | null;
  private modal = document.getElementById('supporter-modal') as HTMLElement | null;
  private btnClose = document.getElementById('btn-supporter-modal-close') as HTMLButtonElement | null;
  private codeInput = document.getElementById('supporter-code-input') as HTMLInputElement | null;
  private btnSubmit = document.getElementById('btn-submit-supporter-code') as HTMLButtonElement | null;
  private feedbackEl = document.getElementById('supporter-code-feedback') as HTMLElement | null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.updateVisibility();

    // Listen to supporter state changes
    window.addEventListener('trainmaster:supporter-changed', () => {
      this.updateVisibility();
      this.updateSettingsCard();
    });

    // Header Button
    if (this.headerBtn) {
      this.headerBtn.addEventListener('click', () => {
        this.openModal();
      });
    }

    // Modal Close
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => {
        this.closeModal();
      });
    }

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.closeModal();
        }
      });
    }

    // Submit Code
    if (this.btnSubmit && this.codeInput) {
      this.btnSubmit.addEventListener('click', () => this.handleUnlock());
      this.codeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleUnlock();
        }
      });
    }

    this.updateSettingsCard();
  }

  public updateVisibility(): void {
    const isUnlocked = isCleanEditionUnlocked();
    if (this.headerBtn) {
      this.headerBtn.style.display = isUnlocked ? 'none' : 'inline-flex';
    }
  }

  public openModal(): void {
    if (!this.modal) return;
    if (this.codeInput) this.codeInput.value = '';
    if (this.feedbackEl) {
      this.feedbackEl.style.display = 'none';
      this.feedbackEl.textContent = '';
    }
    this.modal.style.display = 'flex';
    if (this.codeInput) this.codeInput.focus();
  }

  public closeModal(): void {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
  }

  private async handleUnlock(): Promise<void> {
    if (!this.codeInput || !this.feedbackEl || !this.btnSubmit) return;
    const code = this.codeInput.value.trim();
    if (!code) {
      this.showFeedback('Bitte einen Code eingeben.', false);
      return;
    }

    this.btnSubmit.disabled = true;
    this.btnSubmit.textContent = '⏳ Prüfe...';

    const result = await unlockCleanEdition(code);
    this.btnSubmit.disabled = false;
    this.btnSubmit.textContent = t('supporter.btn_unlock');

    if (result.success) {
      const name = result.supporter || 'Supporter';
      const msg = t('supporter.success').replace('{name}', name);
      this.showFeedback(msg, true);

      setTimeout(() => {
        this.closeModal();
      }, 1600);
    } else {
      this.showFeedback(result.error || 'Ungültiger Code.', false);
    }
  }

  private showFeedback(msg: string, success: boolean): void {
    if (!this.feedbackEl) return;
    this.feedbackEl.style.display = 'block';
    this.feedbackEl.style.background = success ? 'rgba(46, 160, 67, 0.15)' : 'rgba(248, 81, 73, 0.15)';
    this.feedbackEl.style.border = `1px solid ${success ? '#3fb950' : '#f85149'}`;
    this.feedbackEl.style.color = success ? '#3fb950' : '#f85149';
    this.feedbackEl.textContent = msg;
  }

  public updateSettingsCard(): void {
    const state = getSupporterState();
    const container = document.getElementById('ambient-lighting-settings-container');
    if (!container) return;

    // Find or update support card in settings
    let statusEl = document.getElementById('settings-supporter-status');
    const supporterCard = document.getElementById('card-supporter-settings');
    if (!statusEl && supporterCard) {
      statusEl = document.createElement('div');
      statusEl.id = 'settings-supporter-status';
      statusEl.style.marginTop = '14px';
      statusEl.style.paddingTop = '12px';
      statusEl.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';
      supporterCard.appendChild(statusEl);
    }

    if (statusEl) {
      if (state.unlocked) {
        statusEl.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:16px;">🌟</span>
              <strong style="color:#FFDD00;font-size:14px;">${t('supporter.unlocked_badge')}</strong>
              <span style="font-size:12px;color:#8b949e;">(${t('supporter.licensed_to')} <strong>${state.supporter || 'Supporter'}</strong>)</span>
            </div>
            <button id="btn-remove-license" class="btn btn-sm btn-clear" style="font-size:11px;color:#8b949e;padding:3px 8px;">
              ${t('supporter.btn_remove')}
            </button>
          </div>
        `;
        document.getElementById('btn-remove-license')?.addEventListener('click', () => {
          if (confirm('Möchtest du den Freischaltcode wirklich entfernen?')) {
            removeSupporterCode();
          }
        });
      } else {
        statusEl.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:flex-end;">
            <button id="btn-settings-open-unlock" class="btn btn-sm" style="background:#21262d;border:1px solid #30363d;color:#f0f6fc;font-size:12px;display:flex;align-items:center;gap:6px;">
              ${t('supporter.btn_enter_code')}
            </button>
          </div>
        `;
        document.getElementById('btn-settings-open-unlock')?.addEventListener('click', () => {
          this.openModal();
        });
      }
    }
  }
}
