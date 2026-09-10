import { Locomotive } from '../types.js';
import { wsClient } from '../wsClient.js';

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

    TrainDepotDrawer.onSelectionChange = () => {
      this.render();
      const tc = (window as any).trackCanvas;
      tc?.render();
      tc?.updateHelperText();
    };

    wsClient.subscribe(() => {
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
    const blocks = wsClient.blocks || [];
    const selectedLoco = TrainDepotDrawer.selectedLocoId
      ? locos.find((l) => l.id === TrainDepotDrawer.selectedLocoId)
      : null;

    // Main Drawer wrapper
    this.container.className = `train-depot-drawer ${this.isOpen ? 'open' : 'collapsed'}`;

    if (!this.isOpen) {
      // Collapsed tab
      this.container.innerHTML = `
        <button id="btn-depot-expand" class="depot-collapsed-tab" title="Zugdepot öffnen">
          <span class="tab-icon">🚂</span>
          <span class="tab-label">Züge (${locos.length})</span>
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
          <p>Keine Loks angelegt.</p>
        </div>
      `;
    } else {
      cardsHtml = locos.map((loco) => this.renderLocoCard(loco, blocks)).join('');
    }

    const instructionHtml = selectedLoco
      ? `
        <div class="depot-instruction active-selection">
          <div class="instruction-content">
            <span class="instruction-title">🎯 Lok <strong>${selectedLoco.name}</strong> gewählt!</span>
            <span class="instruction-subtitle">Tippe jetzt auf ein <strong>Block-Gleis</strong></span>
          </div>
          <button id="btn-depot-cancel-select" class="btn-cancel-placement" title="Auswahl aufheben">✕</button>
        </div>
      `
      : `
        <div class="depot-instruction">
          💡 Lok <strong>antippen</strong> zum Aufgleisen oder per Drag & Drop ziehen
        </div>
      `;

    this.container.innerHTML = `
      <div class="depot-header">
        <div class="depot-title">
          <span class="depot-icon">🚂</span>
          <span class="depot-heading">Zugdepot</span>
          <span class="depot-count-badge">${locos.length}</span>
        </div>
        <button id="btn-depot-collapse" class="btn-depot-toggle" title="Zugdepot einklappen">
          ◀
        </button>
      </div>

      ${instructionHtml}

      <div class="depot-train-list" id="depot-train-list">
        ${cardsHtml}
      </div>

      <!-- Drop-Zone zum Abstellen / Freigeben -->
      <div class="depot-unassign-zone" id="depot-unassign-zone">
        <span class="unassign-icon">📥</span>
        <div class="unassign-text">
          <strong>Zug hierher ziehen</strong>
          <small>zum Abstellen & Block freigeben</small>
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
            this.touchGhostEl.innerHTML = `<span>🚂</span> <strong>${loco.name}</strong>`;
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
          const b = blocks.find((x) => x.id === loco.currentBlockId);
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

    let typeBadge = '';
    switch (loco.trainType) {
      case 'PASSENGER':
        typeBadge = '<span class="loco-type-badge passenger">Personenzug</span>';
        break;
      case 'FREIGHT':
        typeBadge = '<span class="loco-type-badge freight">Güterzug</span>';
        break;
      case 'HIGH_SPEED':
        typeBadge = '<span class="loco-type-badge highspeed">ICE / Hochgeschw.</span>';
        break;
      default:
        typeBadge = '<span class="loco-type-badge">Triebfahrzeug</span>';
    }

    return `
      <div class="depot-loco-card ${isAssigned ? 'assigned' : 'in-depot'} ${isSelected ? 'selected-for-placement' : ''}" 
           id="depot-card-${loco.id}" 
           draggable="true" 
           title="Antippen zum Aufgleisen oder auf einen Block ziehen">
        <div class="loco-card-top">
          <div class="loco-card-name-group">
            <span class="loco-drag-grip" title="Anfassen und auf den Gleisplan ziehen">⋮⋮</span>
            <div class="loco-name" title="${loco.name}">${loco.name}</div>
          </div>
          <span class="loco-dcc-badge">#${loco.dccAddress}</span>
        </div>

        <div class="loco-card-mid">
          ${typeBadge}
          <span class="loco-length">${loco.lengthCm || 15} cm</span>
        </div>

        ${isSelected ? `
          <div class="loco-selected-banner">
            <span>👆 <strong>Block im Gleisplan antippen</strong></span>
          </div>
        ` : ''}

        <div class="loco-card-bottom">
          ${isAssigned && currentBlock
            ? `
              <div class="loco-status-location" title="Aktuell auf dem Gleisplan">
                <span class="status-dot green"></span>
                <span class="location-name">📍 ${currentBlock.name}</span>
              </div>
              <button id="btn-free-loco-${loco.id}" class="btn-card-free" title="Aus Block entfernen">✕</button>
            `
            : `
              <div class="loco-status-ready">
                <span class="status-dot yellow"></span>
                <span>🟢 Bereit im Depot</span>
              </div>
            `
          }
        </div>
      </div>
    `;
  }
}
