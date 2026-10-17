import { Locomotive } from '../types.js';
import { wsClient } from '../wsClient.js';
import { onLanguageChange, t } from '../i18n.js';
import { escapeHtml, escapeAttr } from '../sanitize.js';
import { locoImageSrc, locoPlaceholderIcon } from '../locoImage.js';
import {
  iconDot,
  iconLocos,
  iconPin,
  iconTarget,
  iconTrainFreight,
  iconTrainHighspeed,
  iconTrainPassenger,
  iconTrainShunter
} from '../icons.js';

export class TrainDepotDrawer {
  private container: HTMLElement;
  private isOpen: boolean = true;
  private draggedLocoId: string | null = null;
  private touchDragInProgress: boolean = false;
  private touchGhostEl: HTMLElement | null = null;

  public static selectedLocoId: string | null = null;
  public static onSelectionChange: (() => void) | null = null;

  public static selectLoco(id: string | null): void {
    if (this.selectedLocoId === id) {
      this.selectedLocoId = null;
    } else {
      this.selectedLocoId = id;
    }
    this.onSelectionChange?.();
  }

  public static clearSelection(): void {
    if (this.selectedLocoId !== null) {
      this.selectedLocoId = null;
      this.onSelectionChange?.();
    }
  }

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init(): void {
    // Restore collapsed state if saved
    const savedState = localStorage.getItem('trainmaster_depot_open');
    if (savedState !== null) {
      this.isOpen = savedState === 'true';
    }

    wsClient.subscribe(() => {
      this.render();
    });

    TrainDepotDrawer.onSelectionChange = () => {
      this.render();
    };

    onLanguageChange(() => {
      this.render();
    });

    this.render();
  }

  public toggle(): void {
    this.isOpen = !this.isOpen;
    localStorage.setItem('trainmaster_depot_open', String(this.isOpen));
    this.render();
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public render(): void {
    const locos = wsClient.locos || [];
    const blocks: Array<{ id: string; name: string }> = (wsClient.blocks || []).map((b) => ({ id: b.id, name: b.name }));
    const selectedLoco = locos.find((l) => l.id === TrainDepotDrawer.selectedLocoId);

    this.container.classList.toggle('collapsed', !this.isOpen);
    this.container.classList.toggle('open', this.isOpen);

    if (!this.isOpen) {
      // Collapsed tab
      this.container.innerHTML = `
        <button id="btn-depot-expand" class="depot-collapsed-tab" title="${t('depot.title')}">
          <span class="tab-icon" style="color:#58a6ff;">${iconLocos(18)}</span>
          <span class="tab-label">${t('depot.collapsed_label')} (${locos.length})</span>
          <span class="tab-arrow">▶</span>
        </button>
      `;
      document.getElementById('btn-depot-expand')?.addEventListener('click', () => this.toggle());
      return;
    }

    // Expanded view
    let cardsHtml = '';
    if (locos.length === 0) {
      cardsHtml = `
        <div class="depot-empty">
          <p>${t('depot.empty')}</p>
        </div>
      `;
    } else {
      cardsHtml = locos.map((loco) => this.renderLocoCard(loco, blocks)).join('');
    }

    const instructionHtml = selectedLoco
      ? `
        <div class="depot-instruction active-selection">
          <div class="instruction-content">
            <span class="instruction-title" style="display:flex;align-items:center;gap:6px;"><span style="color:#38bdf8;">${iconTarget(16)}</span> ${t('depot.instruction_selected')} (<strong>${escapeHtml(selectedLoco.name)}</strong>)</span>
          </div>
          <button id="btn-depot-cancel-select" class="btn-cancel-placement" title="${t('depot.btn_cancel')}">✕</button>
        </div>
      `
      : `
        <div class="depot-instruction">
          ${t('depot.instruction_default')}
        </div>
      `;

    this.container.innerHTML = `
      <div class="depot-header">
        <div class="depot-title">
          <span class="depot-icon" style="color:#58a6ff;">${iconLocos(18)}</span>
          <span class="depot-heading">${t('depot.title')}</span>
          <span class="depot-count-badge">${locos.length}</span>
        </div>
        <button id="btn-depot-collapse" class="btn-depot-toggle" title="${t('depot.title')}">
          ◀
        </button>
      </div>

      ${instructionHtml}

      <div class="depot-train-list" id="depot-train-list">
        ${cardsHtml}
      </div>

      <!-- Drop-Zone zum Abstellen / Freigeben -->
      <div class="depot-unassign-zone" id="depot-unassign-zone">
        <span class="unassign-icon" style="color:#8b949e;">${iconLocos(18)}</span>
        <div class="unassign-text">
          <strong>${t('depot.unassign_title')}</strong>
          <small>${t('depot.unassign_subtitle')}</small>
        </div>
      </div>
    `;

    // Event listeners
    document.getElementById('btn-depot-collapse')?.addEventListener('click', () => this.toggle());
    document.getElementById('btn-depot-cancel-select')?.addEventListener('click', () => {
      TrainDepotDrawer.clearSelection();
    });

    // Setup drag events & touch events on cards
    for (const loco of locos) {
      const card = document.getElementById(`depot-card-${loco.id}`);
      if (!card) continue;

      // Lokbild nicht ladbar -> Platzhalter
      const photoImg = card.querySelector<HTMLImageElement>('.loco-photo-depot img');
      photoImg?.addEventListener('error', () => {
        const box = photoImg.parentElement;
        if (!box) return;
        box.classList.remove('has-image');
        box.innerHTML = `<span class="loco-photo-placeholder" aria-hidden="true">${locoPlaceholderIcon(loco.trainType, 22)}</span>`;
      }, { once: true });

      // 1. Klick / Tap auf Karte -> Auswählen zum Aufgleisen (Touch-First & Desktop)
      card.addEventListener('click', (e) => {
        if (this.touchDragInProgress) return;
        if ((e.target as HTMLElement).closest('.btn-card-free')) return;
        TrainDepotDrawer.selectLoco(loco.id);
      });

      // 2. HTML5 Drag & Drop (für Desktop-Maus)
      card.addEventListener('dragstart', (e) => {
        this.draggedLocoId = loco.id;
        card.classList.add('is-dragging');
        if (e.dataTransfer) {
          e.dataTransfer.setData('text/plain', loco.id);
          e.dataTransfer.setData('application/json', JSON.stringify({
            locoId: loco.id,
            currentBlockId: loco.currentBlockId
          }));
          e.dataTransfer.effectAllowed = 'copyMove';
        }
      });

      card.addEventListener('dragend', () => {
        this.draggedLocoId = null;
        card.classList.remove('is-dragging');
      });

      // 3. Touch Drag (für Touchscreens / iPads / Tablets)
      let touchStartX = 0;
      let touchStartY = 0;
      let isTouchDraggingCard = false;

      card.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        isTouchDraggingCard = false;
      }, { passive: true });

      card.addEventListener('touchmove', (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;

        if (!isTouchDraggingCard && Math.hypot(dx, dy) > 12) {
          isTouchDraggingCard = true;
          this.touchDragInProgress = true;
          this.draggedLocoId = loco.id;

          if (!this.touchGhostEl) {
            this.touchGhostEl = document.createElement('div');
            this.touchGhostEl.className = 'touch-drag-ghost';
            const ghostSrc = locoImageSrc(loco);
            this.touchGhostEl.innerHTML = ghostSrc
              ? `<img class="ghost-loco-photo" src="${escapeAttr(ghostSrc)}" alt="" width="32" height="18"> <strong>${escapeHtml(loco.name)}</strong>`
              : `<span style="color:#58a6ff;display:inline-flex;align-items:center;">${iconLocos(16)}</span> <strong>${escapeHtml(loco.name)}</strong>`;
            document.body.appendChild(this.touchGhostEl);
          }
        }

        if (isTouchDraggingCard && this.touchGhostEl) {
          this.touchGhostEl.style.left = `${t.clientX}px`;
          this.touchGhostEl.style.top = `${t.clientY}px`;

          const unassign = document.getElementById('depot-unassign-zone');
          if (unassign) {
            const rect = unassign.getBoundingClientRect();
            const isOver = t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom;
            if (isOver) {
              unassign.classList.add('drag-hover');
            } else {
              unassign.classList.remove('drag-hover');
            }
          }
          e.preventDefault();
        }
      }, { passive: false });

      const handleTouchEnd = (e: TouchEvent) => {
        if (!isTouchDraggingCard) return;
        isTouchDraggingCard = false;

        if (this.touchGhostEl) {
          this.touchGhostEl.remove();
          this.touchGhostEl = null;
        }

        const unassign = document.getElementById('depot-unassign-zone');
        unassign?.classList.remove('drag-hover');

        const touch = e.changedTouches[0];
        if (touch) {
          // Prüfen ob über Abstellzone
          if (unassign) {
            const rect = unassign.getBoundingClientRect();
            if (touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
              if (loco.currentBlockId) {
                wsClient.send({
                  type: 'FREE_BLOCK',
                  payload: { blockId: loco.currentBlockId }
                });
              }
            }
          }

          // Prüfen ob über Gleisplan / Block
          (window as any).trackCanvas?.assignLocoAtClientCoords?.(loco.id, touch.clientX, touch.clientY);
        }

        this.draggedLocoId = null;
        setTimeout(() => {
          this.touchDragInProgress = false;
        }, 100);
      };

      card.addEventListener('touchend', handleTouchEnd);
      card.addEventListener('touchcancel', handleTouchEnd);

      // Quick-Freigabe Button on card
      const btnClear = document.getElementById(`btn-free-loco-${loco.id}`);
      btnClear?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (loco.currentBlockId) {
          const b = blocks.find((x: { id: string; name: string }) => x.id === loco.currentBlockId);
          if (confirm(`Zug "${loco.name}" aus Block "${b?.name || loco.currentBlockId}" entfernen und Gleis freigeben?`)) {
            wsClient.send({
              type: 'FREE_BLOCK',
              payload: { blockId: loco.currentBlockId }
            });
          }
        }
      });
    }

    // Setup drop on unassign zone
    const unassignZone = document.getElementById('depot-unassign-zone');
    if (unassignZone) {
      unassignZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        unassignZone.classList.add('drag-hover');
      });

      unassignZone.addEventListener('dragleave', () => {
        unassignZone.classList.remove('drag-hover');
      });

      unassignZone.addEventListener('drop', (e) => {
        e.preventDefault();
        unassignZone.classList.remove('drag-hover');
        const locoId = e.dataTransfer?.getData('text/plain') || this.draggedLocoId;
        if (!locoId) return;

        const loco = wsClient.locos.find((l) => l.id === locoId);
        if (loco && loco.currentBlockId) {
          wsClient.send({
            type: 'FREE_BLOCK',
            payload: { blockId: loco.currentBlockId }
          });
        }
      });
    }
  }

  private renderLocoCard(loco: Locomotive, blocks: { id: string; name: string }[]): string {
    const isAssigned = !!loco.currentBlockId;
    const isSelected = TrainDepotDrawer.selectedLocoId === loco.id;
    const currentBlock = isAssigned ? blocks.find((b) => b.id === loco.currentBlockId) : null;
    const photoSrc = locoImageSrc(loco);

    let typeBadge = '';
    switch (loco.trainType) {
      case 'HIGH_SPEED':
        typeBadge = `<span class="loco-type-badge highspeed" style="display:inline-flex;align-items:center;gap:4px;">${iconTrainHighspeed(14)} Highspeed</span>`;
        break;
      case 'PASSENGER':
        typeBadge = `<span class="loco-type-badge passenger" style="display:inline-flex;align-items:center;gap:4px;">${iconTrainPassenger(14)} Reisezug</span>`;
        break;
      case 'COMMUTER':
        typeBadge = `<span class="loco-type-badge commuter" style="background:rgba(56,139,253,0.15);color:#58a6ff;border:1px solid rgba(56,139,253,0.3);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${iconTrainPassenger(14)} Regional</span>`;
        break;
      case 'FREIGHT':
        typeBadge = `<span class="loco-type-badge freight" style="display:inline-flex;align-items:center;gap:4px;">${iconTrainFreight(14)} Güterzug</span>`;
        break;
      case 'SHUNTER':
        typeBadge = `<span class="loco-type-badge shunter" style="background:rgba(210,153,34,0.15);color:#d29922;border:1px solid rgba(210,153,34,0.3);padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${iconTrainShunter(14)} Rangierer</span>`;
        break;
      default:
        typeBadge = `<span class="loco-type-badge" style="display:inline-flex;align-items:center;gap:4px;">${iconLocos(14)} Triebfahrzeug</span>`;
    }

    return `
      <div class="depot-loco-card ${isAssigned ? 'assigned' : 'in-depot'} ${isSelected ? 'selected-for-placement' : ''}" 
           id="depot-card-${loco.id}" 
           draggable="true" 
           title="Antippen zum Aufgleisen oder auf einen Block ziehen">
        <div class="loco-photo loco-photo-depot ${photoSrc ? 'has-image' : ''}">
          ${photoSrc
            ? `<img src="${escapeAttr(photoSrc)}" alt="${escapeAttr(loco.name)}" width="96" height="54" loading="lazy" decoding="async" draggable="false">`
            : `<span class="loco-photo-placeholder" aria-hidden="true">${locoPlaceholderIcon(loco.trainType, 22)}</span>`}
        </div>
        <div class="loco-card-top">
          <div class="loco-card-name-group">
            <span class="loco-drag-grip" title="Anfassen und auf den Gleisplan ziehen">⋮⋮</span>
            <div class="loco-name" title="${escapeAttr(loco.name)}">${escapeHtml(loco.name)}</div>
          </div>
          <span class="loco-dcc-badge">#${loco.dccAddress}</span>
        </div>

        <div class="loco-card-mid">
          ${typeBadge}
          <span class="loco-length">${loco.lengthCm || 15} cm</span>
        </div>

        ${isSelected ? `
          <div class="loco-selected-banner">
            <span><strong style="color:#38bdf8;">Block im Gleisplan antippen</strong></span>
          </div>
        ` : ''}

        <div class="loco-card-bottom">
          ${isAssigned && currentBlock
            ? `
              <div class="loco-status-location" title="Aktuell auf dem Gleisplan">
                <span class="status-dot green"></span>
                <span class="location-name" style="display:inline-flex;align-items:center;gap:4px;"><span style="color:#38bdf8;">${iconPin(13)}</span> ${currentBlock.name}</span>
              </div>
              <button id="btn-free-loco-${loco.id}" class="btn-card-free" title="Aus Block entfernen">✕</button>
            `
            : `
              <div class="loco-status-ready">
                <span class="status-dot yellow"></span>
                <span style="display:inline-flex;align-items:center;gap:4px;">${iconDot('#3fb950', 7)} Bereit im Depot</span>
              </div>
            `
          }
        </div>
      </div>
    `;
  }
}
