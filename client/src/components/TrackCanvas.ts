import { Block, BlockStopPolicy, BlockType, Sensor, Signal, TrackElement, Turnout, getSignalSupportedAspects } from '../types.js';
import { wsClient } from '../wsClient.js';
import { TrainDepotDrawer } from './TrainDepotDrawer.js';
import { t } from '../i18n.js';

export type EditorTool =
  | 'STRAIGHT'
  | 'CURVE'
  | 'TURNOUT_LEFT'
  | 'TURNOUT_RIGHT'
  | 'BLOCK'
  | 'SIGNAL'
  | 'BUFFER'
  | 'SENSOR'
  | 'INSPECT'
  | 'ROTATE'
  | 'DELETE';

export class TrackCanvas {
  private svg: SVGSVGElement;
  private selectedStartBlockId: string | null = null;
  private isEditMode: boolean = false;
  private currentTool: EditorTool = 'STRAIGHT';
  private cellSize = 80;
  private cols = 16;
  private rows = 10;
  private minCols = 16;
  private minRows = 10;
  private zoom = 1.0;
  private hoveredCell: { x: number; y: number } | null = null;
  private dragOverBlockId: string | null = null;

  constructor(svgElement: SVGSVGElement) {
    this.svg = svgElement;
    this.init();
    this.initModals();
  }

  private init(): void {
    wsClient.subscribe(() => this.render());

    // Mouse Move für Gitter-Vorschau im Editor
    this.svg.addEventListener('mousemove', (e) => {
      if (!this.isEditMode) return;
      const pos = this.getGridPosFromEvent(e);
      if (!this.hoveredCell || this.hoveredCell.x !== pos.x || this.hoveredCell.y !== pos.y) {
        this.hoveredCell = pos;
        this.render();
      }
    });

    this.svg.addEventListener('mouseleave', () => {
      if (this.isEditMode && this.hoveredCell) {
        this.hoveredCell = null;
        this.render();
      }
    });

    // Klick auf das SVG-Canvas
    this.svg.addEventListener('click', (e) => {
      if (!this.isEditMode) return;
      const pos = this.getGridPosFromEvent(e);
      this.handleGridClick(pos.x, pos.y);
    });

    // Zoom mit Strg + Mausrad auf Canvas
    this.svg.parentElement?.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          this.zoomIn();
        } else {
          this.zoomOut();
        }
      }
    }, { passive: false });

    // Drag-to-Pan (Klicken und Verschieben bei großem Gleisplan)
    let isPanning = false;
    let startPanX = 0;
    let startPanY = 0;
    const container = this.svg.parentElement;

    container?.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (!this.isEditMode && e.button === 0 && (e.target === this.svg || (e.target as HTMLElement).tagName === 'rect'))) {
        isPanning = true;
        startPanX = e.clientX + (container.scrollLeft || 0);
        startPanY = e.clientY + (container.scrollTop || 0);
        container.style.cursor = 'grab';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning || !container) return;
      container.scrollLeft = startPanX - e.clientX;
      container.scrollTop = startPanY - e.clientY;
    });

    window.addEventListener('mouseup', () => {
      if (isPanning && container) {
        isPanning = false;
        container.style.cursor = '';
      }
    });

    // Touch-Gesten auf Canvas: 1-Finger Pan & 2-Finger Pinch-to-Zoom
    let isTouchPanning = false;
    let isTouchPinching = false;
    let touchPanStartX = 0;
    let touchPanStartY = 0;
    let touchStartScrollLeft = 0;
    let touchStartScrollTop = 0;
    let touchStartDist = 0;
    let touchStartZoom = 1.0;
    let touchPanMoved = false;

    container?.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchPanStartX = t.clientX;
        touchPanStartY = t.clientY;
        touchStartScrollLeft = container.scrollLeft;
        touchStartScrollTop = container.scrollTop;
        isTouchPanning = true;
        isTouchPinching = false;
        touchPanMoved = false;
      } else if (e.touches.length === 2) {
        isTouchPanning = false;
        isTouchPinching = true;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist = Math.hypot(dx, dy);
        touchStartZoom = this.zoom;
        e.preventDefault();
      }
    }, { passive: false });

    container?.addEventListener('touchmove', (e: TouchEvent) => {
      if (isTouchPinching && e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (touchStartDist > 0) {
          const factor = dist / touchStartDist;
          this.setZoom(touchStartZoom * factor);
        }
      } else if (isTouchPanning && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = touchPanStartX - t.clientX;
        const dy = touchPanStartY - t.clientY;
        if (!touchPanMoved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
          touchPanMoved = true;
        }
        if (touchPanMoved) {
          container.scrollLeft = touchStartScrollLeft + dx;
          container.scrollTop = touchStartScrollTop + dy;
          e.preventDefault();
        }
      }
    }, { passive: false });

    const endTouchPan = () => {
      isTouchPanning = false;
      isTouchPinching = false;
    };
    container?.addEventListener('touchend', endTouchPan);
    container?.addEventListener('touchcancel', endTouchPan);

    // HTML5 Drag & Drop von Zügen aus dem Zugdepot auf Gleisblöcke
    this.svg.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      const pos = this.getGridPosFromEvent(e);
      const elem = wsClient.layout.find((el) => el.x === pos.x && el.y === pos.y && el.type === 'BLOCK');
      if (elem && elem.linkedId) {
        if (this.dragOverBlockId !== elem.linkedId) {
          this.dragOverBlockId = elem.linkedId;
          this.render();
        }
      } else {
        if (this.dragOverBlockId !== null) {
          this.dragOverBlockId = null;
          this.render();
        }
      }
    });

    this.svg.addEventListener('dragleave', () => {
      if (this.dragOverBlockId !== null) {
        this.dragOverBlockId = null;
        this.render();
      }
    });

    this.svg.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      this.dragOverBlockId = null;
      this.render();

      const locoId = e.dataTransfer?.getData('text/plain');
      if (!locoId) return;

      const pos = this.getGridPosFromEvent(e);
      const elem = wsClient.layout.find((el) => el.x === pos.x && el.y === pos.y && el.type === 'BLOCK');
      if (!elem || !elem.linkedId) return;

      const block = wsClient.blocks.find((b) => b.id === elem.linkedId);
      if (!block) return;

      const loco = wsClient.locos.find((l) => l.id === locoId);
      if (!loco) return;

      // Wenn Block bereits von einer anderen Lok belegt ist, nachfragen
      if (block.currentLocoId && block.currentLocoId !== loco.id) {
        const currentLoco = wsClient.locos.find((l) => l.id === block.currentLocoId);
        const confirmReplace = confirm(
          `Block "${block.name}" ist aktuell belegt durch "${currentLoco?.name || block.currentLocoId}".\n` +
          `Möchtest du "${loco.name}" stattdessen in diesen Block setzen?`
        );
        if (!confirmReplace) return;
      }

      wsClient.send({
        type: 'ASSIGN_LOCO_TO_BLOCK',
        payload: {
          locoId: loco.id,
          blockId: block.id
        }
      });
    });

    // Rechtsklick (Context Menu) auf Blöcke für sichere Freigabe & Konfiguration
    this.svg.addEventListener('contextmenu', (e: MouseEvent) => {
      const pos = this.getGridPosFromEvent(e);
      const elem = wsClient.layout.find((el) => el.x === pos.x && el.y === pos.y && el.type === 'BLOCK');
      if (elem && elem.linkedId) {
        e.preventDefault();
        const block = wsClient.blocks.find((b) => b.id === elem.linkedId);
        if (block) {
          this.showBlockContextMenu(e.clientX, e.clientY, block);
          return;
        }
      }
      this.hideBlockContextMenu();
    });

    // Klick außerhalb oder Escape schließt das Kontextmenü
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('block-context-menu');
      if (menu && menu.style.display !== 'none') {
        if (!menu.contains(e.target as Node)) {
          this.hideBlockContextMenu();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideBlockContextMenu();
      }
    });

    // Sekündlicher Ticker für Live-Wartezeit-Countdowns auf dem Gleisplan & im Menü
    setInterval(() => this.tickWaitTimers(), 1000);

    this.render();
  }

  private tickWaitTimers(): void {
    const now = Date.now();
    for (const block of wsClient.blocks) {
      if (block.waitTimer && block.waitTimer.status === 'WAITING') {
        const textElem = document.getElementById(`block-timer-text-${block.id}`);
        if (textElem) {
          const rem = Math.max(0, Math.ceil((block.waitTimer.departureTimestamp - now) / 1000));
          if (rem > 0) {
            textElem.textContent = `⏳ Abfahrt in ${rem}s`;
          } else {
            textElem.textContent = `🟢 Abfahrt...`;
          }
        }
      }
    }

    const ctxTimerCountdown = document.getElementById('ctx-timer-countdown');
    const ctxTimerBlockId = ctxTimerCountdown?.dataset.blockId;
    if (ctxTimerCountdown && ctxTimerBlockId) {
      const block = wsClient.blocks.find((b) => b.id === ctxTimerBlockId);
      if (block?.waitTimer?.status === 'WAITING') {
        const rem = Math.max(0, Math.ceil((block.waitTimer.departureTimestamp - now) / 1000));
        ctxTimerCountdown.innerHTML = rem > 0
          ? `Noch <strong>${rem}s</strong> bis zur planmäßigen Abfahrt (von ${block.waitTimer.totalWaitSec}s)`
          : `<strong>Abfahrt wird eingeleitet...</strong>`;
      }
    }
  }

  private initModals(): void {
    // 50/50-Optionen nur bei gesetztem Häkchen zeigen
    document.getElementById('block-form-split')?.addEventListener('change', (e) => {
      const opts = document.getElementById('block-form-split-options');
      if (opts) opts.style.display = (e.target as HTMLInputElement).checked ? 'block' : 'none';
    });

    // Block Modal Close & Submit
    document.getElementById('btn-block-close')?.addEventListener('click', () => {
      const m = document.getElementById('block-modal');
      if (m) m.style.display = 'none';
    });
    document.getElementById('btn-block-cancel')?.addEventListener('click', () => {
      const m = document.getElementById('block-modal');
      if (m) m.style.display = 'none';
    });

    document.getElementById('form-block')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const idInput = document.getElementById('block-edit-id') as HTMLInputElement | null;
      const block = wsClient.blocks.find((b) => b.id === idInput?.value);
      if (!block) return;

      const nameInput = document.getElementById('block-form-name') as HTMLInputElement | null;
      const typeSelect = document.getElementById('block-form-type') as HTMLSelectElement | null;
      const lengthInput = document.getElementById('block-form-length') as HTMLInputElement | null;
      const dirSelect = document.getElementById('block-form-direction') as HTMLSelectElement | null;
      const locoSelect = document.getElementById('block-form-loco') as HTMLSelectElement | null;
      const minWaitInput = document.getElementById('block-form-min-wait') as HTMLInputElement | null;
      const maxWaitInput = document.getElementById('block-form-max-wait') as HTMLInputElement | null;
      const soundFKeyInput = document.getElementById('block-form-sound-fkey') as HTMLInputElement | null;
      const soundLeadInput = document.getElementById('block-form-sound-lead') as HTMLInputElement | null;
      const plusEnterSelect = document.getElementById('block-form-plus-enter') as HTMLSelectElement | null;
      const plusInSelect = document.getElementById('block-form-plus-in') as HTMLSelectElement | null;
      const minusEnterSelect = document.getElementById('block-form-minus-enter') as HTMLSelectElement | null;
      const minusInSelect = document.getElementById('block-form-minus-in') as HTMLSelectElement | null;
      const splitCheck = document.getElementById('block-form-split') as HTMLInputElement | null;
      const policySelect = document.getElementById('block-form-stop-policy') as HTMLSelectElement | null;
      const ratioInput = document.getElementById('block-form-split-ratio') as HTMLInputElement | null;
      const centerMarginInput = document.getElementById('block-form-center-margin') as HTMLInputElement | null;
      const signalMarginInput = document.getElementById('block-form-signal-margin') as HTMLInputElement | null;
      const intIn = (el: HTMLInputElement | null, fallback: number, min: number, max: number) => {
        const v = parseInt(el?.value || '', 10);
        return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
      };

      const newLocoId = locoSelect?.value || null;
      const fKeyVal = soundFKeyInput?.value ? parseInt(soundFKeyInput.value, 10) : undefined;
      const leadVal = soundLeadInput?.value ? parseInt(soundLeadInput.value, 10) : 3;

      const updatedBlock: Block = {
        ...block,
        name: nameInput?.value.trim() || block.name,
        type: (typeSelect?.value as BlockType) || 'STATION',
        lengthCm: parseInt(lengthInput?.value || '180', 10),
        direction: (dirSelect?.value as '+' | '-') || '+',
        currentLocoId: newLocoId,
        state: newLocoId ? 'OCCUPIED' : (block.state === 'OCCUPIED' ? 'FREE' : block.state),
        minWaitTimeSec: parseInt(minWaitInput?.value || '10', 10),
        maxWaitTimeSec: parseInt(maxWaitInput?.value || '25', 10),
        soundConfig: {
          ...block.soundConfig,
          departureFKey: fKeyVal && fKeyVal > 0 ? fKeyVal : undefined,
          departureLeadTimeSec: leadVal,
          departureFKeyDurationMs: 1500
        },
        sensorsPlus: {
          enter: plusEnterSelect?.value || '',
          in: plusInSelect?.value || ''
        },
        sensorsMinus: {
          enter: minusEnterSelect?.value || '',
          in: minusInSelect?.value || ''
        },
        // 50/50-Gleisaufteilung (Einstellungen bleiben beim Abwählen erhalten, wirken aber nur bei SPLIT)
        stopMode: splitCheck?.checked ? 'SPLIT' : 'POINT',
        stopPolicy: (policySelect?.value as BlockStopPolicy) || 'AUTO_BY_LENGTH',
        trackSplitRatio: intIn(ratioInput, 50, 20, 80) / 100,
        centerStopMarginCm: intIn(centerMarginInput, 10, 0, 100),
        signalStopMarginCm: intIn(signalMarginInput, 8, 0, 100)
      };

      wsClient.send({ type: 'UPDATE_BLOCK', payload: updatedBlock });

      if (newLocoId !== block.currentLocoId) {
        wsClient.send({
          type: 'ASSIGN_LOCO_TO_BLOCK',
          payload: { locoId: newLocoId || '', blockId: newLocoId ? updatedBlock.id : null }
        });
      }

      const m = document.getElementById('block-modal');
      if (m) m.style.display = 'none';
    });

    // Turnout Modal Close & Submit
    document.getElementById('btn-turnout-close')?.addEventListener('click', () => {
      const m = document.getElementById('turnout-modal');
      if (m) m.style.display = 'none';
    });
    document.getElementById('btn-turnout-cancel')?.addEventListener('click', () => {
      const m = document.getElementById('turnout-modal');
      if (m) m.style.display = 'none';
    });

    document.getElementById('form-turnout')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const idInput = document.getElementById('turnout-edit-id') as HTMLInputElement | null;
      const turnout = wsClient.turnouts.find((t) => t.id === idInput?.value);
      if (!turnout) return;

      const nameInput = document.getElementById('turnout-form-name') as HTMLInputElement | null;
      const addrInput = document.getElementById('turnout-form-address') as HTMLInputElement | null;
      const invCheckbox = document.getElementById('turnout-form-inverted') as HTMLInputElement | null;

      const updatedTo: Turnout = {
        ...turnout,
        name: nameInput?.value.trim() || turnout.name,
        address: parseInt(addrInput?.value || '1', 10),
        inverted: !!invCheckbox?.checked
      };

      wsClient.send({ type: 'UPDATE_TURNOUT', payload: updatedTo });

      const m = document.getElementById('turnout-modal');
      if (m) m.style.display = 'none';
    });
  }

  public updateGridDimensions(targetX?: number, targetY?: number): boolean {
    let maxX = this.minCols - 3;
    let maxY = this.minRows - 3;

    for (const el of wsClient.layout) {
      if (el.x > maxX) maxX = el.x;
      if (el.y > maxY) maxY = el.y;
    }

    if (targetX !== undefined && targetX > maxX) maxX = targetX;
    if (targetY !== undefined && targetY > maxY) maxY = targetY;

    const newCols = maxX + 3;
    const newRows = maxY + 3;

    if (newCols !== this.cols || newRows !== this.rows) {
      this.cols = newCols;
      this.rows = newRows;
      return true;
    }
    return false;
  }

  public setZoom(newZoom: number): void {
    this.zoom = Math.max(0.4, Math.min(2.5, Math.round(newZoom * 100) / 100));
    this.updateZoomDisplay();
    this.render();
  }

  public zoomIn(): void {
    this.setZoom(this.zoom + 0.15);
  }

  public zoomOut(): void {
    this.setZoom(this.zoom - 0.15);
  }

  public zoomReset(): void {
    this.setZoom(1.0);
  }

  private updateZoomDisplay(): void {
    const el = document.getElementById('zoom-level-text');
    if (el) {
      el.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  public expandGrid(direction: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM'): void {
    if (direction === 'LEFT') {
      for (const el of wsClient.layout) {
        el.x += 1;
      }
      this.updateGridDimensions();
      this.render();
      this.saveLayout();
    } else if (direction === 'TOP') {
      for (const el of wsClient.layout) {
        el.y += 1;
      }
      this.updateGridDimensions();
      this.render();
      this.saveLayout();
    } else if (direction === 'RIGHT') {
      this.cols += 3;
      this.render();
    } else if (direction === 'BOTTOM') {
      this.rows += 3;
      this.render();
    }
  }

  public getGridPosFromCoords(clientX: number, clientY: number): { x: number; y: number } {
    const pt = this.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgP = pt.matrixTransform(ctm.inverse());
    const x = Math.max(0, Math.floor(svgP.x / this.cellSize));
    const y = Math.max(0, Math.floor(svgP.y / this.cellSize));

    if (this.isEditMode) {
      if (x >= this.cols - 1 || y >= this.rows - 1) {
        if (this.updateGridDimensions(x, y)) {
          this.render();
        }
      }
    }

    return {
      x: Math.max(0, Math.min(this.cols - 1, x)),
      y: Math.max(0, Math.min(this.rows - 1, y))
    };
  }

  private getGridPosFromEvent(e: MouseEvent): { x: number; y: number } {
    return this.getGridPosFromCoords(e.clientX, e.clientY);
  }

  public assignLocoAtClientCoords(locoId: string, clientX: number, clientY: number): boolean {
    const pos = this.getGridPosFromCoords(clientX, clientY);
    const elem = wsClient.layout.find((el) => el.x === pos.x && el.y === pos.y && el.type === 'BLOCK');
    if (!elem || !elem.linkedId) return false;

    const block = wsClient.blocks.find((b) => b.id === elem.linkedId);
    if (!block) return false;

    const loco = wsClient.locos.find((l) => l.id === locoId);
    if (!loco) return false;

    if (block.currentLocoId && block.currentLocoId !== loco.id) {
      const currentLoco = wsClient.locos.find((l) => l.id === block.currentLocoId);
      const confirmReplace = confirm(
        `Block "${block.name}" ist aktuell belegt durch "${currentLoco?.name || block.currentLocoId}".\n` +
        `Möchtest du "${loco.name}" stattdessen in diesen Block setzen?`
      );
      if (!confirmReplace) return false;
    }

    wsClient.send({
      type: 'ASSIGN_LOCO_TO_BLOCK',
      payload: { locoId: loco.id, blockId: block.id }
    });
    return true;
  }

  public setEditMode(edit: boolean): void {
    if (!edit && this.autoSaveTimer) {
      window.clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
      wsClient.send({
        type: 'UPDATE_LAYOUT',
        payload: { elements: wsClient.layout }
      });
    }

    this.isEditMode = edit;
    this.selectedStartBlockId = null;
    this.hoveredCell = null;

    const palette = document.getElementById('editor-palette');
    if (palette) {
      palette.style.display = edit ? 'flex' : 'none';
    }

    this.updateHelperText();
    this.render();
  }

  public setTool(tool: EditorTool): void {
    this.currentTool = tool;
    this.updateHelperText();
  }

  private autoSaveTimer: number | null = null;

  public triggerAutoSave(): void {
    if (this.autoSaveTimer) {
      window.clearTimeout(this.autoSaveTimer);
    }
    try {
      localStorage.setItem('trainmaster_layout_backup', JSON.stringify(wsClient.layout));
    } catch {}

    this.autoSaveTimer = window.setTimeout(() => {
      this.autoSaveTimer = null;
      wsClient.send({
        type: 'UPDATE_LAYOUT',
        payload: { elements: wsClient.layout }
      });
    }, 600);
  }

  public saveLayout(showAlert = true): void {
    if (this.autoSaveTimer) {
      window.clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    try {
      localStorage.setItem('trainmaster_layout_backup', JSON.stringify(wsClient.layout));
    } catch {}

    wsClient.send({
      type: 'UPDATE_LAYOUT',
      payload: { elements: wsClient.layout }
    });
    if (showAlert) {
      alert('✅ Gleisplan erfolgreich auf dem Server gespeichert!');
    }
  }

  public clearLayout(): void {
    if (confirm('Möchtest du wirklich alle Gleise vom Plan entfernen?')) {
      wsClient.layout = [];
      this.render();
      this.saveLayout(false);
    }
  }

  private handleGridClick(cellX: number, cellY: number): void {
    const existingIndex = wsClient.layout.findIndex((el) => el.x === cellX && el.y === cellY);
    const existing = existingIndex >= 0 ? wsClient.layout[existingIndex] : null;

    if (this.currentTool === 'INSPECT') {
      if (existing) {
        if (existing.type === 'BLOCK' && existing.linkedId) {
          this.openBlockModal(existing.linkedId);
        } else if (existing.type.startsWith('TURNOUT') && existing.linkedId) {
          this.openTurnoutModal(existing.linkedId);
        } else if (existing.type === 'SENSOR' && existing.linkedId) {
          this.openSensorModal(existing.linkedId);
        } else if (existing.type === 'SIGNAL') {
          this.openSignalModal(existing.linkedId, existing);
        }
      }
      return;
    }

    if (this.currentTool === 'DELETE') {
      if (existingIndex >= 0) {
        wsClient.layout.splice(existingIndex, 1);
        this.render();
        this.triggerAutoSave();
      }
      return;
    }

    if (this.currentTool === 'ROTATE') {
      if (existing) {
        existing.rotation = ((existing.rotation + 90) % 360) as 0 | 90 | 180 | 270;
        this.render();
        this.triggerAutoSave();
      }
      return;
    }

    // Platzierungs-Werkzeuge: STRAIGHT, CURVE, TURNOUT_LEFT, TURNOUT_RIGHT, BLOCK, BUFFER, SENSOR
    if (existing) {
      if (existing.type === this.currentTool) {
        // Gleiches Element erneut angeklickt -> Weiterdrehen um 90°
        existing.rotation = ((existing.rotation + 90) % 360) as 0 | 90 | 180 | 270;
      } else {
        // Anderes Element an dieser Stelle -> Typ ersetzen
        existing.type = this.currentTool;
        this.assignDefaultLinkedId(existing);
      }
    } else {
      // Neues Element auf leeres Gitterfeld setzen
      const newElem: TrackElement = {
        id: `elem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        x: cellX,
        y: cellY,
        rotation: 0,
        type: this.currentTool
      };
      this.assignDefaultLinkedId(newElem);
      wsClient.layout.push(newElem);
    }

    this.render();
    this.triggerAutoSave();
  }

  private assignDefaultLinkedId(elem: TrackElement): void {
    if (elem.type === 'BLOCK') {
      const usedBlockIds = new Set(wsClient.layout.filter((e) => e.type === 'BLOCK').map((e) => e.linkedId));
      const freeBlock = wsClient.blocks.find((b) => !usedBlockIds.has(b.id));
      if (freeBlock) {
        elem.linkedId = freeBlock.id;
      } else {
        const nextNum = wsClient.blocks.length + 1;
        const newBlock: Block = {
          id: `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: `Block B${nextNum}`,
          lengthCm: 180,
          state: 'FREE',
          currentLocoId: null,
          reservedForLocoId: null,
          direction: '+',
          sensorsPlus: { enter: '', in: '' },
          sensorsMinus: { enter: '', in: '' }
        };
        wsClient.blocks.push(newBlock);
        wsClient.send({ type: 'CREATE_BLOCK', payload: newBlock });
        elem.linkedId = newBlock.id;
      }
    } else if (elem.type === 'TURNOUT_LEFT' || elem.type === 'TURNOUT_RIGHT') {
      const usedToIds = new Set(wsClient.layout.filter((e) => e.type.startsWith('TURNOUT')).map((e) => e.linkedId));
      const freeTo = wsClient.turnouts.find((t) => !usedToIds.has(t.id));
      if (freeTo) {
        elem.linkedId = freeTo.id;
      } else {
        const nextNum = wsClient.turnouts.length + 1;
        const maxAddr = wsClient.turnouts.reduce((max, t) => Math.max(max, t.address || 0), 0);
        const newTurnout: Turnout = {
          id: `to-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: `Weiche W${nextNum}`,
          address: maxAddr + 1,
          state: 'STRAIGHT',
          inverted: false,
          locked: false
        };
        wsClient.turnouts.push(newTurnout);
        wsClient.send({ type: 'CREATE_TURNOUT', payload: newTurnout });
        elem.linkedId = newTurnout.id;
      }
    } else if (elem.type === 'SENSOR') {
      const usedSensorIds = new Set(wsClient.layout.filter((e) => e.type === 'SENSOR').map((e) => e.linkedId));
      const freeSensor = wsClient.sensors.find((s) => !usedSensorIds.has(s.id));
      if (freeSensor) {
        elem.linkedId = freeSensor.id;
      } else {
        const nextNum = wsClient.sensors.length + 1;
        const maxPin = wsClient.sensors.reduce((max, s) => Math.max(max, s.wioPin || 0), 0);
        const maxAddr = wsClient.sensors.reduce((max, s) => Math.max(max, s.address || 0), 0);
        const newSensor: Sensor = {
          id: `sens-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: `Sensor RM-${nextNum}`,
          type: 'WIO',
          wioUnit: 1,
          wioPin: maxPin + 1,
          address: maxAddr + 1,
          active: false
        };
        wsClient.sensors.push(newSensor);
        wsClient.send({ type: 'CREATE_SENSOR', payload: newSensor });
        elem.linkedId = newSensor.id;
      }
    } else if (elem.type === 'SIGNAL') {
      const usedSigIds = new Set(wsClient.layout.filter((e) => e.type === 'SIGNAL').map((e) => e.linkedId));
      const freeSig = wsClient.signals.find((s) => !usedSigIds.has(s.id));
      if (freeSig) {
        elem.linkedId = freeSig.id;
      } else {
        const nextNum = wsClient.signals.length + 1;
        const maxAddr = wsClient.signals.reduce((max, s) => Math.max(max, s.address || 0), 100);
        const newSig: Signal = {
          id: `sig-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: `Signal N${nextNum}`,
          address: maxAddr + 1,
          aspect: 'HP0',
          type: 'WIO',
          kind: 'BLOCK',
          wioUnit: 1,
          wioPins: {
            red: 12 + ((nextNum - 1) * 2) % 16,
            green: 13 + ((nextNum - 1) * 2) % 16
          },
          inverted: false
        };
        wsClient.signals.push(newSig);
        wsClient.send({ type: 'CREATE_SIGNAL', payload: newSig });
        elem.linkedId = newSig.id;
      }
    }
  }

  public openBlockModal(blockId: string): void {
    const block = wsClient.blocks.find((b) => b.id === blockId);
    if (!block) return;

    const modal = document.getElementById('block-modal');
    if (!modal) return;

    const titleEl = document.getElementById('modal-block-title');
    const idInput = document.getElementById('block-edit-id') as HTMLInputElement | null;
    const nameInput = document.getElementById('block-form-name') as HTMLInputElement | null;
    const lengthInput = document.getElementById('block-form-length') as HTMLInputElement | null;
    const dirSelect = document.getElementById('block-form-direction') as HTMLSelectElement | null;
    const locoSelect = document.getElementById('block-form-loco') as HTMLSelectElement | null;
    const plusEnterSelect = document.getElementById('block-form-plus-enter') as HTMLSelectElement | null;
    const plusInSelect = document.getElementById('block-form-plus-in') as HTMLSelectElement | null;
    const minusEnterSelect = document.getElementById('block-form-minus-enter') as HTMLSelectElement | null;
    const minusInSelect = document.getElementById('block-form-minus-in') as HTMLSelectElement | null;

    const typeSelect = document.getElementById('block-form-type') as HTMLSelectElement | null;
    const minWaitInput = document.getElementById('block-form-min-wait') as HTMLInputElement | null;
    const maxWaitInput = document.getElementById('block-form-max-wait') as HTMLInputElement | null;
    const soundFKeyInput = document.getElementById('block-form-sound-fkey') as HTMLInputElement | null;
    const soundLeadInput = document.getElementById('block-form-sound-lead') as HTMLInputElement | null;

    if (titleEl) titleEl.textContent = `⬛ Block bearbeiten: ${block.name}`;
    if (idInput) idInput.value = block.id;
    if (nameInput) nameInput.value = block.name;
    if (typeSelect) typeSelect.value = block.type || (block.name.toLowerCase().includes('strecke') ? 'MAINLINE' : 'STATION');
    if (lengthInput) lengthInput.value = String(block.lengthCm);
    if (dirSelect) dirSelect.value = block.direction;
    if (minWaitInput) minWaitInput.value = String(block.minWaitTimeSec !== undefined ? block.minWaitTimeSec : 10);
    if (maxWaitInput) maxWaitInput.value = String(block.maxWaitTimeSec !== undefined ? block.maxWaitTimeSec : 25);
    if (soundFKeyInput) soundFKeyInput.value = block.soundConfig?.departureFKey ? String(block.soundConfig.departureFKey) : '';
    if (soundLeadInput) soundLeadInput.value = String(block.soundConfig?.departureLeadTimeSec ?? 3);

    // 50/50-Gleisaufteilung
    const splitCheck = document.getElementById('block-form-split') as HTMLInputElement | null;
    const splitOptions = document.getElementById('block-form-split-options');
    const setVal = (id: string, v: string) => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
      if (el) el.value = v;
    };
    if (splitCheck) splitCheck.checked = block.stopMode === 'SPLIT';
    if (splitOptions) splitOptions.style.display = block.stopMode === 'SPLIT' ? 'block' : 'none';
    setVal('block-form-stop-policy', block.stopPolicy || 'AUTO_BY_LENGTH');
    setVal('block-form-split-ratio', String(Math.round((block.trackSplitRatio ?? 0.5) * 100)));
    setVal('block-form-center-margin', String(block.centerStopMarginCm ?? 10));
    setVal('block-form-signal-margin', String(block.signalStopMarginCm ?? 8));

    // Lok-Liste
    if (locoSelect) {
      locoSelect.innerHTML = '<option value="">(Kein Zug im Block)</option>';
      for (const loco of wsClient.locos) {
        const opt = document.createElement('option');
        opt.value = loco.id;
        opt.textContent = `${loco.name} [DCC #${loco.dccAddress}]`;
        if (loco.id === block.currentLocoId) opt.selected = true;
        locoSelect.appendChild(opt);
      }
    }

    // Sensoren Dropdowns
    const populateSensors = (sel: HTMLSelectElement | null, selectedId: string) => {
      if (!sel) return;
      sel.innerHTML = '<option value="">(Kein Melder zugewiesen)</option>';
      for (const s of wsClient.sensors) {
        const opt = document.createElement('option');
        opt.value = s.id;
        let extra = s.type === 'WIO' ? `Unit ${s.wioUnit || 1}/Pin ${s.wioPin || 1}` : `#${s.address}`;
        opt.textContent = `${s.name} [${s.type}: ${extra}]`;
        if (s.id === selectedId) opt.selected = true;
        sel.appendChild(opt);
      }
    };

    populateSensors(plusEnterSelect, block.sensorsPlus.enter);
    populateSensors(plusInSelect, block.sensorsPlus.in);
    populateSensors(minusEnterSelect, block.sensorsMinus.enter);
    populateSensors(minusInSelect, block.sensorsMinus.in);

    modal.style.display = 'flex';
  }

  public openTurnoutModal(turnoutId: string): void {
    const turnout = wsClient.turnouts.find((t) => t.id === turnoutId);
    if (!turnout) return;

    const modal = document.getElementById('turnout-modal');
    if (!modal) return;

    const titleEl = document.getElementById('modal-turnout-title');
    const idInput = document.getElementById('turnout-edit-id') as HTMLInputElement | null;
    const nameInput = document.getElementById('turnout-form-name') as HTMLInputElement | null;
    const addrInput = document.getElementById('turnout-form-address') as HTMLInputElement | null;
    const invCheckbox = document.getElementById('turnout-form-inverted') as HTMLInputElement | null;

    if (titleEl) titleEl.textContent = `⎇ Weiche bearbeiten: ${turnout.name}`;
    if (idInput) idInput.value = turnout.id;
    if (nameInput) nameInput.value = turnout.name;
    if (addrInput) addrInput.value = String(turnout.address);
    if (invCheckbox) invCheckbox.checked = !!turnout.inverted;

    modal.style.display = 'flex';
  }

  public openSensorModal(sensorId: string): void {
    const sensor = wsClient.sensors.find((s) => s.id === sensorId);
    if ((window as any).sensorMonitor) {
      (window as any).sensorMonitor.openModal(sensor);
    }
  }

  public openSignalModal(signalId?: string, trackElem?: TrackElement): void {
    const signal = signalId ? wsClient.signals.find((s) => s.id === signalId) : undefined;
    if ((window as any).signalMonitor) {
      (window as any).signalMonitor.openModal(signal, trackElem);
    }
  }

  private updateHelperText(): void {
    const textEl = document.getElementById('route-helper-text');
    if (!textEl) return;

    if (this.isEditMode) {
      let toolName = 'Gerade';
      switch (this.currentTool) {
        case 'STRAIGHT': toolName = 'Gerade'; break;
        case 'CURVE': toolName = 'Kurve'; break;
        case 'TURNOUT_LEFT': toolName = 'Weiche Links'; break;
        case 'TURNOUT_RIGHT': toolName = 'Weiche Rechts'; break;
        case 'BLOCK': toolName = 'Block'; break;
        case 'SIGNAL': toolName = 'Signal (Block Hp0/Hp1 oder Mehrbegriffig)'; break;
        case 'SENSOR': toolName = 'Rückmelder / Gleissensor'; break;
        case 'BUFFER': toolName = 'Prellbock'; break;
        case 'INSPECT': toolName = '⚙️ Konfigurieren (Block / Weiche / Signal / Sensor anklicken)'; break;
        case 'ROTATE': toolName = 'Drehen (+90°)'; break;
        case 'DELETE': toolName = 'Löschen'; break;
      }
      textEl.innerHTML = `✏️ <em>Aktives Werkzeug: <strong>${toolName}</strong>. Klicke auf ein Feld zum Platzieren oder Konfigurieren.</em>`;
    } else if (this.selectedStartBlockId) {
      const b = wsClient.blocks.find((x) => x.id === this.selectedStartBlockId);
      textEl.innerHTML = `🎯 <strong>Startblock: ${b?.name || ''}</strong>. Klicke jetzt auf den <strong>Zielblock</strong>! <button id="btn-cancel-route" style="margin-left:8px;padding:2px 8px;cursor:pointer;">Abbrechen</button>`;
      document.getElementById('btn-cancel-route')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedStartBlockId = null;
        this.updateHelperText();
        this.render();
      });
    } else if (TrainDepotDrawer.selectedLocoId) {
      const loco = wsClient.locos.find((l) => l.id === TrainDepotDrawer.selectedLocoId);
      textEl.innerHTML = `🚂 <strong>${t('depot.instruction_selected')} (${loco?.name || ''})</strong> <button id="btn-cancel-assign" style="margin-left:8px;padding:2px 8px;cursor:pointer;">${t('depot.btn_cancel')}</button>`;
      document.getElementById('btn-cancel-assign')?.addEventListener('click', (e) => {
        e.stopPropagation();
        TrainDepotDrawer.clearSelection();
      });
    } else {
      const testModeNote = wsClient.settings?.manualSensorTriggerInRunMode !== false
        ? t('canvas.helper_testmode')
        : '';
      textEl.innerHTML = `${t('canvas.helper_run')}${testModeNote}`;
    }
  }

  public render(): void {
    this.updateGridDimensions();
    const totalWidth = this.cols * this.cellSize;
    const totalHeight = this.rows * this.cellSize;
    this.svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    this.svg.style.width = `${totalWidth * this.zoom}px`;
    this.svg.style.height = `${totalHeight * this.zoom}px`;
    this.svg.style.minWidth = `${totalWidth * this.zoom}px`;
    this.svg.style.minHeight = `${totalHeight * this.zoom}px`;

    this.svg.innerHTML = '';

    // Definitionen & Glow Filter
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <pattern id="grid-pattern" width="${this.cellSize}" height="${this.cellSize}" patternUnits="userSpaceOnUse">
        <path d="M ${this.cellSize} 0 L 0 0 0 ${this.cellSize}" fill="none" stroke="${this.isEditMode ? '#30363d' : '#21262d'}" stroke-width="${this.isEditMode ? '1.5' : '1'}" stroke-dasharray="${this.isEditMode ? 'none' : '3,3'}"/>
      </pattern>
      <pattern id="hazard-pattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="8" fill="#d29922"/>
        <rect x="4" width="4" height="8" fill="#0d1117"/>
      </pattern>
      <filter id="glow-yellow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <filter id="glow-red" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <filter id="glow-green" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <filter id="glow-blue" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    `;
    this.svg.appendChild(defs);

    // Hintergrund-Gitter
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('fill', 'url(#grid-pattern)');
    this.svg.appendChild(bgRect);

    // Hover-Vorschau im Editor-Modus
    if (this.isEditMode && this.hoveredCell) {
      const hoverRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hoverRect.setAttribute('x', `${this.hoveredCell.x * this.cellSize}`);
      hoverRect.setAttribute('y', `${this.hoveredCell.y * this.cellSize}`);
      hoverRect.setAttribute('width', `${this.cellSize}`);
      hoverRect.setAttribute('height', `${this.cellSize}`);
      hoverRect.setAttribute('fill', 'rgba(47, 129, 247, 0.15)');
      hoverRect.setAttribute('stroke', '#58a6ff');
      hoverRect.setAttribute('stroke-dasharray', '4,4');
      hoverRect.setAttribute('stroke-width', '1.5');
      hoverRect.style.pointerEvents = 'none';
      this.svg.appendChild(hoverRect);
    }

    // 1. Layer für Gleise & Infrastruktur (Schotter, Schwellen, Schienen, Weichen, Signale, Sensoren)
    const trackLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    trackLayer.setAttribute('id', 'layer-tracks');
    this.svg.appendChild(trackLayer);

    // 2. Layer für Blöcke & Zuginfos (GARANTIERT immer ÜBER allen Gleisen und Nachbarkacheln!)
    const blockLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    blockLayer.setAttribute('id', 'layer-blocks');
    this.svg.appendChild(blockLayer);

    // Pass 1: Alle Gleise & Infrastruktur zeichnen
    for (const elem of wsClient.layout) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const cx = elem.x * this.cellSize + this.cellSize / 2;
      const cy = elem.y * this.cellSize + this.cellSize / 2;
      g.setAttribute('transform', `translate(${cx}, ${cy}) rotate(${elem.rotation})`);
      g.setAttribute('data-id', elem.id);

      this.renderElement(g, elem);
      trackLayer.appendChild(g);
    }

    // Pass 2: Alle Block-Badges auf oberster Ebene ÜBER die Gleise zeichnen
    for (const elem of wsClient.layout) {
      if (elem.type !== 'BLOCK') continue;
      const block = wsClient.blocks.find((b) => b.id === elem.linkedId);
      if (!block) continue;

      const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const cx = elem.x * this.cellSize + this.cellSize / 2;
      const cy = elem.y * this.cellSize + this.cellSize / 2;
      badgeGroup.setAttribute('transform', `translate(${cx}, ${cy}) rotate(${elem.rotation})`);
      badgeGroup.setAttribute('data-block-id', block.id);

      this.renderBlockBadge(badgeGroup, block, elem);
      blockLayer.appendChild(badgeGroup);
    }
  }

  private renderElement(g: SVGGElement, elem: TrackElement): void {
    const half = this.cellSize / 2;

    switch (elem.type) {
      case 'STRAIGHT': {
        // Schotterbett
        const ballast = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        ballast.setAttribute('x', `${-half}`);
        ballast.setAttribute('y', '-13');
        ballast.setAttribute('width', `${this.cellSize}`);
        ballast.setAttribute('height', '26');
        ballast.setAttribute('rx', '3');
        ballast.setAttribute('fill', '#161b22');
        ballast.setAttribute('stroke', '#21262d');
        ballast.setAttribute('stroke-width', '1');
        g.appendChild(ballast);

        // 5 Holz/Betonschwellen
        for (const sx of [-32, -16, 0, 16, 32]) {
          this.renderSleeper(g, sx, -10, sx, 10);
        }

        // Doppelschienen mit metallischem Schienenkopf
        this.renderRailLine(g, -half, -6, half, -6);
        this.renderRailLine(g, -half, 6, half, 6);
        break;
      }

      case 'CURVE': {
        // Schotterbett Bogen (Mitte R=40, Dicke 26px von R=27 bis R=53)
        const ballast = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ballast.setAttribute('d', `M ${-half} 0 A ${half} ${half} 0 0 1 0 ${half}`);
        ballast.setAttribute('fill', 'none');
        ballast.setAttribute('stroke', '#161b22');
        ballast.setAttribute('stroke-width', '26');
        g.appendChild(ballast);

        // Bogen-Ränder
        const bOuter = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bOuter.setAttribute('d', `M ${-half} -13 A 53 53 0 0 1 13 ${half}`);
        bOuter.setAttribute('fill', 'none');
        bOuter.setAttribute('stroke', '#21262d');
        bOuter.setAttribute('stroke-width', '1');
        g.appendChild(bOuter);

        const bInner = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bInner.setAttribute('d', `M ${-half} 13 A 27 27 0 0 1 -13 ${half}`);
        bInner.setAttribute('fill', 'none');
        bInner.setAttribute('stroke', '#21262d');
        bInner.setAttribute('stroke-width', '1');
        g.appendChild(bInner);

        // 5 Mathematisch exakte radiale Schwellen
        const radialSleepers = [
          { x1: -32.2, y1: 11.0, x2: -27.1, y2: -8.3 },
          { x1: -25.0, y1: 14.0, x2: -15.0, y2: -3.3 },
          { x1: -18.8, y1: 18.8, x2: -4.6, y2: 4.6 },
          { x1: -14.0, y1: 25.0, x2: 3.3, y2: 15.0 },
          { x1: -11.0, y1: 32.2, x2: 8.3, y2: 27.1 }
        ];
        for (const s of radialSleepers) {
          this.renderSleeper(g, s.x1, s.y1, s.x2, s.y2);
        }

        // Doppelschienen (Außen R=46 von -40,-6 nach 6,40; Innen R=34 von -40,6 nach -6,40)
        this.renderRailPath(g, `M ${-half} -6 A 46 46 0 0 1 6 ${half}`);
        this.renderRailPath(g, `M ${-half} 6 A 34 34 0 0 1 -6 ${half}`);
        break;
      }

      case 'TURNOUT_LEFT':
      case 'TURNOUT_RIGHT': {
        const to = wsClient.turnouts.find((t) => t.id === elem.linkedId);
        this.renderTurnout(g, elem, to);
        break;
      }

      case 'BLOCK': {
        this.renderBlockTrack(g, elem);
        break;
      }

      case 'SIGNAL': {
        // Schotterbett & Schwellen
        const ballast = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        ballast.setAttribute('x', `${-half}`);
        ballast.setAttribute('y', '-13');
        ballast.setAttribute('width', `${this.cellSize}`);
        ballast.setAttribute('height', '26');
        ballast.setAttribute('rx', '3');
        ballast.setAttribute('fill', '#161b22');
        ballast.setAttribute('stroke', '#21262d');
        ballast.setAttribute('stroke-width', '1');
        g.appendChild(ballast);

        for (const sx of [-32, -16, 0, 16, 32]) {
          this.renderSleeper(g, sx, -10, sx, 10);
        }

        // Schienen
        this.renderRailLine(g, -half, -6, half, -6);
        this.renderRailLine(g, -half, 6, half, 6);

        // Signal Mast & Schirm
        const sig = wsClient.signals.find((s) => s.id === elem.linkedId);
        const kind = sig?.kind || (sig?.wioPins?.yellow !== undefined ? 'ENTRY_EXIT' : 'BLOCK');
        const aspect = sig?.aspect || 'HP0';

        // Mast mit Leiter-Detail
        const mast = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        mast.setAttribute('x1', '0');
        mast.setAttribute('y1', '-6');
        mast.setAttribute('x2', '0');
        mast.setAttribute('y2', '-17');
        mast.setAttribute('stroke', '#8b949e');
        mast.setAttribute('stroke-width', '2.5');
        g.appendChild(mast);

        // DB Mastschild
        const mastSchild = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        mastSchild.setAttribute('x', '-2');
        mastSchild.setAttribute('y', '-14');
        mastSchild.setAttribute('width', '4');
        mastSchild.setAttribute('height', '6');
        mastSchild.setAttribute('fill', kind === 'SHUNTING' ? '#58a6ff' : '#f85149');
        mastSchild.setAttribute('stroke', '#ffffff');
        mastSchild.setAttribute('stroke-width', '0.6');
        g.appendChild(mastSchild);

        const isRed = aspect === 'HP0' || aspect === 'SH0';
        const isGreen = aspect === 'HP1' || aspect === 'HP2';
        const isYellow = aspect === 'HP2';
        const isWhite = aspect === 'SH1';

        if (kind === 'BLOCK') {
          // 2-begriffiges Blocksignal (Nur Rot und Grün nebeneinander)
          const shield = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          shield.setAttribute('x', '-13');
          shield.setAttribute('y', '-29');
          shield.setAttribute('width', '26');
          shield.setAttribute('height', '13');
          shield.setAttribute('rx', '3');
          shield.setAttribute('fill', '#0d1117');
          shield.setAttribute('stroke', '#30363d');
          shield.setAttribute('stroke-width', '1.5');
          g.appendChild(shield);

          // Schuten über den LEDs
          const hoodLeft = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          hoodLeft.setAttribute('d', 'M -9 -25.5 A 4 4 0 0 1 -3 -25.5');
          hoodLeft.setAttribute('fill', 'none');
          hoodLeft.setAttribute('stroke', '#484f58');
          hoodLeft.setAttribute('stroke-width', '1');
          g.appendChild(hoodLeft);

          const hoodRight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          hoodRight.setAttribute('d', 'M 3 -25.5 A 4 4 0 0 1 9 -25.5');
          hoodRight.setAttribute('fill', 'none');
          hoodRight.setAttribute('stroke', '#484f58');
          hoodRight.setAttribute('stroke-width', '1');
          g.appendChild(hoodRight);

          // Rote Lampe (Hp0)
          const redDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          redDot.setAttribute('cx', '-6');
          redDot.setAttribute('cy', '-22.5');
          redDot.setAttribute('r', '3.5');
          redDot.setAttribute('fill', isRed ? '#f85149' : '#301311');
          if (isRed) redDot.setAttribute('filter', 'url(#glow-red)');
          g.appendChild(redDot);

          // Grüne Lampe (Hp1 - Blocksignale haben KEIN Gelb)
          const greenDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          greenDot.setAttribute('cx', '6');
          greenDot.setAttribute('cy', '-22.5');
          greenDot.setAttribute('r', '3.5');
          greenDot.setAttribute('fill', isGreen ? '#3fb950' : '#0c2211');
          if (isGreen) greenDot.setAttribute('filter', 'url(#glow-green)');
          g.appendChild(greenDot);

        } else if (kind === 'SHUNTING') {
          // Sperrsignal (Sh0 / Sh1)
          const shield = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          shield.setAttribute('x', '-11');
          shield.setAttribute('y', '-27');
          shield.setAttribute('width', '22');
          shield.setAttribute('height', '11');
          shield.setAttribute('rx', '2');
          shield.setAttribute('fill', '#0d1117');
          shield.setAttribute('stroke', '#30363d');
          shield.setAttribute('stroke-width', '1.5');
          g.appendChild(shield);

          const redDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          redDot.setAttribute('cx', '-5');
          redDot.setAttribute('cy', '-21.5');
          redDot.setAttribute('r', '3');
          redDot.setAttribute('fill', isRed ? '#f85149' : '#301311');
          if (isRed) redDot.setAttribute('filter', 'url(#glow-red)');
          g.appendChild(redDot);

          const whiteDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          whiteDot.setAttribute('cx', '5');
          whiteDot.setAttribute('cy', '-21.5');
          whiteDot.setAttribute('r', '3');
          whiteDot.setAttribute('fill', isWhite ? '#f0f6fc' : '#21262d');
          if (isWhite) whiteDot.setAttribute('filter', 'url(#glow-white)');
          g.appendChild(whiteDot);

        } else {
          // ENTRY_EXIT (3-begriffig) oder ADVANCED (4-begriffig)
          const shield = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          shield.setAttribute('x', '-16');
          shield.setAttribute('y', '-29');
          shield.setAttribute('width', '32');
          shield.setAttribute('height', '13');
          shield.setAttribute('rx', '3');
          shield.setAttribute('fill', '#0d1117');
          shield.setAttribute('stroke', '#30363d');
          shield.setAttribute('stroke-width', '1.5');
          g.appendChild(shield);

          // Schuten
          for (const sx of [-9, 0, 9]) {
            const hood = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hood.setAttribute('d', `M ${sx - 3} -25.5 A 3 3 0 0 1 ${sx + 3} -25.5`);
            hood.setAttribute('fill', 'none');
            hood.setAttribute('stroke', '#484f58');
            hood.setAttribute('stroke-width', '1');
            g.appendChild(hood);
          }

          // Rote Lampe
          const redDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          redDot.setAttribute('cx', '-9');
          redDot.setAttribute('cy', '-22.5');
          redDot.setAttribute('r', '3');
          redDot.setAttribute('fill', isRed ? '#f85149' : '#301311');
          if (isRed) redDot.setAttribute('filter', 'url(#glow-red)');
          g.appendChild(redDot);

          // Grüne Lampe
          const greenDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          greenDot.setAttribute('cx', '0');
          greenDot.setAttribute('cy', '-22.5');
          greenDot.setAttribute('r', '3');
          greenDot.setAttribute('fill', isGreen ? '#3fb950' : '#0c2211');
          if (isGreen) greenDot.setAttribute('filter', 'url(#glow-green)');
          g.appendChild(greenDot);

          // Gelbe Lampe (Hp2 Langsamfahrt: Grün + Gelb)
          const yellowDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          yellowDot.setAttribute('cx', '9');
          yellowDot.setAttribute('cy', '-22.5');
          yellowDot.setAttribute('r', '3');
          yellowDot.setAttribute('fill', isYellow ? '#e3b341' : '#2d2109');
          if (isYellow) yellowDot.setAttribute('filter', 'url(#glow-yellow)');
          g.appendChild(yellowDot);
        }

        // Signal Badge unten (immer lesbar / nie auf dem Kopf)
        const labelText = sig ? sig.name : 'Signal';
        const textLen = labelText.length;
        const badgeW = Math.max(36, textLen * 5.5 + 10);
        const badgeH = 13;
        const badgeCenterY = 19;

        const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        if (elem.rotation !== 0) {
          labelGroup.setAttribute('transform', `rotate(${-elem.rotation}, 0, ${badgeCenterY})`);
        }

        const badgeBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        badgeBg.setAttribute('x', `${-badgeW / 2}`);
        badgeBg.setAttribute('y', `${badgeCenterY - badgeH / 2}`);
        badgeBg.setAttribute('width', `${badgeW}`);
        badgeBg.setAttribute('height', `${badgeH}`);
        badgeBg.setAttribute('rx', '3');
        badgeBg.setAttribute('fill', 'rgba(13, 17, 23, 0.9)');
        badgeBg.setAttribute('stroke', '#30363d');
        badgeBg.setAttribute('stroke-width', '0.8');
        labelGroup.appendChild(badgeBg);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', '0');
        label.setAttribute('y', `${badgeCenterY}`);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('fill', isRed ? '#f85149' : '#3fb950');
        label.setAttribute('font-size', '8px');
        label.setAttribute('font-weight', 'bold');
        label.textContent = labelText;
        label.style.pointerEvents = 'none';
        labelGroup.appendChild(label);

        g.appendChild(labelGroup);

        if (!this.isEditMode) {
          g.style.cursor = 'pointer';
          g.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!sig) return;
            const supported = getSignalSupportedAspects(sig);
            const currIdx = supported.indexOf(sig.aspect || 'HP0');
            const nextAspect = supported[(currIdx + 1) % supported.length];
            wsClient.send({
              type: 'SET_SIGNAL',
              payload: { signalId: sig.id, aspect: nextAspect }
            });
          });
        } else {
          g.style.cursor = 'pointer';
          g.addEventListener('click', (e) => {
            if (this.currentTool === 'INSPECT' || this.currentTool === 'SIGNAL') {
              e.stopPropagation();
              this.openSignalModal(elem.linkedId, elem);
            }
          });
        }
        break;
      }

      case 'SENSOR': {
        // Schotterbett & Schwellen
        const ballast = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        ballast.setAttribute('x', `${-half}`);
        ballast.setAttribute('y', '-13');
        ballast.setAttribute('width', `${this.cellSize}`);
        ballast.setAttribute('height', '26');
        ballast.setAttribute('rx', '3');
        ballast.setAttribute('fill', '#161b22');
        ballast.setAttribute('stroke', '#21262d');
        ballast.setAttribute('stroke-width', '1');
        g.appendChild(ballast);

        for (const sx of [-32, -16, 0, 16, 32]) {
          this.renderSleeper(g, sx, -10, sx, 10);
        }

        // Schienen
        this.renderRailLine(g, -half, -6, half, -6);
        this.renderRailLine(g, -half, 6, half, 6);

        // Isolierstöße (Messabschnitt)
        this.renderInsulatedJoint(g, -24);
        this.renderInsulatedJoint(g, 24);

        // Sensor-Punkt / LED Kontakt in der Mitte
        const sensor = wsClient.sensors.find((s) => s.id === elem.linkedId);
        const isActive = !!sensor?.active;
        const allowManualTrigger = wsClient.settings?.manualSensorTriggerInRunMode !== false;

        // Metallfassung
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('cx', '0');
        ring.setAttribute('cy', '0');
        ring.setAttribute('r', '9');
        ring.setAttribute('fill', '#0d1117');
        ring.setAttribute('stroke', isActive ? '#f85149' : (allowManualTrigger && !this.isEditMode ? '#388bfd88' : '#30363d'));
        ring.setAttribute('stroke-width', '1.5');
        g.appendChild(ring);

        // Leuchtende LED
        const sensorDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        sensorDot.setAttribute('cx', '0');
        sensorDot.setAttribute('cy', '0');
        sensorDot.setAttribute('r', '6');
        sensorDot.setAttribute('fill', isActive ? '#f85149' : '#238636');
        sensorDot.setAttribute('stroke', '#fff');
        sensorDot.setAttribute('stroke-width', '1');
        if (isActive) {
          sensorDot.setAttribute('filter', 'url(#glow-red)');
        }
        g.appendChild(sensorDot);

        // Sensor Beschriftung Badge (immer lesbar / nie auf dem Kopf)
        const sensorText = sensor ? sensor.name : 'Sensor';
        const sTextLen = sensorText.length;
        const sBadgeW = Math.max(36, sTextLen * 5.5 + 10);
        const sBadgeH = 13;
        const sBadgeCenterY = -18;

        const sLabelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        if (elem.rotation !== 0) {
          sLabelGroup.setAttribute('transform', `rotate(${-elem.rotation}, 0, ${sBadgeCenterY})`);
        }

        const badgeBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        badgeBg.setAttribute('x', `${-sBadgeW / 2}`);
        badgeBg.setAttribute('y', `${sBadgeCenterY - sBadgeH / 2}`);
        badgeBg.setAttribute('width', `${sBadgeW}`);
        badgeBg.setAttribute('height', `${sBadgeH}`);
        badgeBg.setAttribute('rx', '3');
        badgeBg.setAttribute('fill', 'rgba(13, 17, 23, 0.85)');
        badgeBg.setAttribute('stroke', '#30363d');
        badgeBg.setAttribute('stroke-width', '0.8');
        sLabelGroup.appendChild(badgeBg);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', '0');
        label.setAttribute('y', `${sBadgeCenterY}`);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('fill', isActive ? '#f85149' : '#8b949e');
        label.setAttribute('font-size', '8px');
        label.setAttribute('font-weight', 'bold');
        label.textContent = sensorText;
        label.style.pointerEvents = 'none';
        sLabelGroup.appendChild(label);

        g.appendChild(sLabelGroup);

        if (this.isEditMode) {
          g.style.cursor = 'pointer';
          g.addEventListener('click', (e) => {
            if (this.currentTool === 'INSPECT' || this.currentTool === 'SENSOR') {
              e.stopPropagation();
              if (elem.linkedId) this.openSensorModal(elem.linkedId);
            }
          });
        } else if (allowManualTrigger) {
          // Im Fahrbetrieb: Klickbar für Testbetrieb / Simulation
          g.style.cursor = 'pointer';

          // SVG Tooltip
          const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent = `⚡ Rückmelder "${sensorText}" (#${sensor?.address ?? '?'})\n• Klick: Test-Impuls auslösen (Überfahrt simulieren)\n• Shift+Klick: Dauerbelegung umschalten (Toggle)`;
          g.appendChild(title);

          // Hover-Effekt: dezenter Glow um den Sensor
          g.addEventListener('mouseenter', () => {
            ring.setAttribute('stroke', '#58a6ff');
            ring.setAttribute('stroke-width', '2.5');
            ring.setAttribute('filter', 'url(#glow-blue)');
          });
          g.addEventListener('mouseleave', () => {
            ring.setAttribute('stroke', isActive ? '#f85149' : (allowManualTrigger ? '#388bfd88' : '#30363d'));
            ring.setAttribute('stroke-width', '1.5');
            ring.removeAttribute('filter');
          });

          // Long-Press für Touchscreens (wie Shift-Klick für Dauerbelegung)
          let sensorTouchTimer: any = null;
          let sensorTouchStartX = 0;
          let sensorTouchStartY = 0;
          let sensorLongPressTriggered = false;

          g.addEventListener('touchstart', (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            sensorLongPressTriggered = false;
            const t = e.touches[0];
            sensorTouchStartX = t.clientX;
            sensorTouchStartY = t.clientY;
            sensorTouchTimer = setTimeout(() => {
              sensorLongPressTriggered = true;
              if (navigator.vibrate) navigator.vibrate([25, 30, 25]);
              if (elem.linkedId) {
                const newState = !sensor?.active;
                wsClient.send({
                  type: 'TRIGGER_SENSOR',
                  payload: { sensorId: elem.linkedId, state: newState, autoReset: false }
                });
              }
            }, 450);
          }, { passive: true });

          g.addEventListener('touchmove', (e: TouchEvent) => {
            if (sensorTouchTimer && e.touches.length === 1) {
              const dx = e.touches[0].clientX - sensorTouchStartX;
              const dy = e.touches[0].clientY - sensorTouchStartY;
              if (Math.hypot(dx, dy) > 10) {
                clearTimeout(sensorTouchTimer);
                sensorTouchTimer = null;
              }
            }
          }, { passive: true });

          const cancelSensorTouch = () => {
            if (sensorTouchTimer) {
              clearTimeout(sensorTouchTimer);
              sensorTouchTimer = null;
            }
          };
          g.addEventListener('touchend', cancelSensorTouch);
          g.addEventListener('touchcancel', cancelSensorTouch);

          g.addEventListener('click', (e) => {
            if (sensorLongPressTriggered) {
              sensorLongPressTriggered = false;
              return;
            }
            e.stopPropagation();
            if (!elem.linkedId) return;

            if (sensor?.active) {
              // Wenn bereits aktiv: sofort ausschalten
              wsClient.send({
                type: 'TRIGGER_SENSOR',
                payload: { sensorId: elem.linkedId, state: false, autoReset: false }
              });
            } else if (e.shiftKey) {
              // Shift-Klick: Dauerbelegung einschalten (z. B. stehender Zug)
              wsClient.send({
                type: 'TRIGGER_SENSOR',
                payload: { sensorId: elem.linkedId, state: true, autoReset: false }
              });
            } else {
              // Normaler Klick: Test-Impuls (wie Zugüberfahrt)
              wsClient.send({
                type: 'TRIGGER_SENSOR',
                payload: { sensorId: elem.linkedId, state: true, autoReset: true }
              });
            }
          });
        }
        break;
      }

      case 'BUFFER': {
        // Schotterbett von links bis Pufferbohle
        const ballast = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        ballast.setAttribute('x', `${-half}`);
        ballast.setAttribute('y', '-13');
        ballast.setAttribute('width', `${half + 4}`);
        ballast.setAttribute('height', '26');
        ballast.setAttribute('rx', '3');
        ballast.setAttribute('fill', '#161b22');
        ballast.setAttribute('stroke', '#21262d');
        ballast.setAttribute('stroke-width', '1');
        g.appendChild(ballast);

        // Schwellen
        for (const sx of [-32, -18, -4]) {
          this.renderSleeper(g, sx, -10, sx, 10);
        }

        // Schienen
        this.renderRailLine(g, -half, -6, 0, -6);
        this.renderRailLine(g, -half, 6, 0, 6);

        // Bremsprellbock Stützen (Diagonalstreben)
        const brace1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        brace1.setAttribute('x1', '-10');
        brace1.setAttribute('y1', '-6');
        brace1.setAttribute('x2', '0');
        brace1.setAttribute('y2', '-10');
        brace1.setAttribute('stroke', '#484f58');
        brace1.setAttribute('stroke-width', '2');
        g.appendChild(brace1);

        const brace2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        brace2.setAttribute('x1', '-10');
        brace2.setAttribute('y1', '6');
        brace2.setAttribute('x2', '0');
        brace2.setAttribute('y2', '10');
        brace2.setAttribute('stroke', '#484f58');
        brace2.setAttribute('stroke-width', '2');
        g.appendChild(brace2);

        // Pufferbohle mit Warnschraffur
        const beam = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        beam.setAttribute('x', '0');
        beam.setAttribute('y', '-13');
        beam.setAttribute('width', '7');
        beam.setAttribute('height', '26');
        beam.setAttribute('rx', '2');
        beam.setAttribute('fill', 'url(#hazard-pattern)');
        beam.setAttribute('stroke', '#f0f6fc');
        beam.setAttribute('stroke-width', '1');
        g.appendChild(beam);

        // Zwei Pufferteller (rund)
        const bufferTop = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        bufferTop.setAttribute('cx', '0');
        bufferTop.setAttribute('cy', '-6');
        bufferTop.setAttribute('r', '3.5');
        bufferTop.setAttribute('fill', '#8b949e');
        bufferTop.setAttribute('stroke', '#fff');
        bufferTop.setAttribute('stroke-width', '1');
        g.appendChild(bufferTop);

        const bufferBottom = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        bufferBottom.setAttribute('cx', '0');
        bufferBottom.setAttribute('cy', '6');
        bufferBottom.setAttribute('r', '3.5');
        bufferBottom.setAttribute('fill', '#8b949e');
        bufferBottom.setAttribute('stroke', '#fff');
        bufferBottom.setAttribute('stroke-width', '1');
        g.appendChild(bufferBottom);

        // Haltesignal Sh0 / Sperrsignal Tafel
        const sh0 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        sh0.setAttribute('x', '1.5');
        sh0.setAttribute('y', '-4');
        sh0.setAttribute('width', '4');
        sh0.setAttribute('height', '8');
        sh0.setAttribute('rx', '1');
        sh0.setAttribute('fill', '#f85149');
        sh0.setAttribute('stroke', '#fff');
        sh0.setAttribute('stroke-width', '0.7');
        g.appendChild(sh0);
        break;
      }
    }
  }

  private renderTurnout(g: SVGGElement, elem: TrackElement, to?: Turnout): void {
    const half = this.cellSize / 2; // 40
    const isRight = elem.type === 'TURNOUT_RIGHT';
    const isDivergent = to?.state === 'DIVERGENT' || (to?.state as any) === 'TURNOUT';

    // 1. Schotterbett (Ballast bed)
    // Gerade
    const straightBallast = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    straightBallast.setAttribute('x', `${-half}`);
    straightBallast.setAttribute('y', '-13');
    straightBallast.setAttribute('width', `${this.cellSize}`);
    straightBallast.setAttribute('height', '26');
    straightBallast.setAttribute('rx', '3');
    straightBallast.setAttribute('fill', '#161b22');
    straightBallast.setAttribute('stroke', '#21262d');
    straightBallast.setAttribute('stroke-width', '1');
    g.appendChild(straightBallast);

    // Bogen-Schotterbett (Abzweig zu Süd 0,40 bzw. Nord 0,-40)
    const curveBallast = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (isRight) {
      curveBallast.setAttribute('d', `M ${-half} 0 A ${half} ${half} 0 0 1 0 ${half}`);
    } else {
      curveBallast.setAttribute('d', `M ${-half} 0 A ${half} ${half} 0 0 0 0 ${-half}`);
    }
    curveBallast.setAttribute('fill', 'none');
    curveBallast.setAttribute('stroke', '#161b22');
    curveBallast.setAttribute('stroke-width', '26');
    g.appendChild(curveBallast);

    // 2. Weichenschwellen (Langschwellen & Abzweigschwellen)
    if (isRight) {
      this.renderSleeper(g, -32, -10, -32, 10);
      this.renderSleeper(g, -16, -10, -16, 17);
      this.renderSleeper(g, 0, -10, 0, 25);
      this.renderSleeper(g, 16, -10, 16, 10);
      this.renderSleeper(g, 32, -10, 32, 10);
      this.renderSleeper(g, -12, 31, 6, 23);
      this.renderSleeper(g, -10, 38, 10, 38);
    } else {
      this.renderSleeper(g, -32, -10, -32, 10);
      this.renderSleeper(g, -16, -17, -16, 10);
      this.renderSleeper(g, 0, -25, 0, 10);
      this.renderSleeper(g, 16, -10, 16, 10);
      this.renderSleeper(g, 32, -10, 32, 10);
      this.renderSleeper(g, -12, -31, 6, -23);
      this.renderSleeper(g, -10, -38, 10, -38);
    }

    // 3. Schienen mit aktiver Routen-Hervorhebung
    const activeColor = '#58a6ff';
    const dimColor = '#484f58';
    const straightColor = !isDivergent ? activeColor : dimColor;
    const branchColor = isDivergent ? activeColor : dimColor;

    // Stammgleis (2 Schienen)
    this.renderRailLine(g, -half, -6, half, -6, straightColor, !isDivergent);
    this.renderRailLine(g, -half, 6, half, 6, straightColor, !isDivergent);

    // Abzweiggleis (2 Schienen, exakt anliegend an Stammgleis und orthogonal an den Zellrand mündend)
    if (isRight) {
      this.renderRailPath(g, `M ${-half} -6 A 46 46 0 0 1 6 ${half}`, branchColor, 2.5, isDivergent);
      this.renderRailPath(g, `M ${-half} 6 A 34 34 0 0 1 -6 ${half}`, branchColor, 2.5, isDivergent);
    } else {
      this.renderRailPath(g, `M ${-half} 6 A 46 46 0 0 0 6 ${-half}`, branchColor, 2.5, isDivergent);
      this.renderRailPath(g, `M ${-half} -6 A 34 34 0 0 0 -6 ${-half}`, branchColor, 2.5, isDivergent);
    }

    // 4. Herzstück (Frog) & Radlenker (Check rails)
    const frogY = isRight ? 6 : -6;
    const checkY = isRight ? 2.5 : -2.5;
    const checkRail = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    checkRail.setAttribute('x1', '-14');
    checkRail.setAttribute('y1', `${checkY}`);
    checkRail.setAttribute('x2', '-4');
    checkRail.setAttribute('y2', `${checkY}`);
    checkRail.setAttribute('stroke', '#8b949e');
    checkRail.setAttribute('stroke-width', '1.5');
    checkRail.setAttribute('stroke-linecap', 'round');
    g.appendChild(checkRail);

    const frogPoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    frogPoint.setAttribute('cx', '-9');
    frogPoint.setAttribute('cy', `${frogY}`);
    frogPoint.setAttribute('r', '1.8');
    frogPoint.setAttribute('fill', '#c9d1d9');
    g.appendChild(frogPoint);

    // 5. Interaktive Stellwerk-Weichenlaterne (Weichenanzeige & Schaltsymbol)
    const lanternY = isRight ? -22 : 22;
    const lanternGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    lanternGroup.setAttribute('transform', `translate(8, ${lanternY})`);

    const housing = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    housing.setAttribute('x', '-11');
    housing.setAttribute('y', '-10');
    housing.setAttribute('width', '22');
    housing.setAttribute('height', '20');
    housing.setAttribute('rx', '4');
    housing.setAttribute('fill', '#0d1117');
    housing.setAttribute('stroke', to?.locked ? '#d29922' : isDivergent ? '#58a6ff' : '#238636');
    housing.setAttribute('stroke-width', '1.5');
    lanternGroup.appendChild(housing);

    if (to?.locked) {
      const lockIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lockIcon.setAttribute('x', '0');
      lockIcon.setAttribute('y', '4');
      lockIcon.setAttribute('text-anchor', 'middle');
      lockIcon.setAttribute('font-size', '11px');
      lockIcon.textContent = '🔒';
      lanternGroup.appendChild(lockIcon);
    } else if (!isDivergent) {
      // Pfeil Geradeaus ➔
      const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrowPath.setAttribute('d', 'M -6 0 L 4 0 M 1 -3 L 5 0 L 1 3');
      arrowPath.setAttribute('fill', 'none');
      arrowPath.setAttribute('stroke', '#3fb950');
      arrowPath.setAttribute('stroke-width', '2');
      arrowPath.setAttribute('stroke-linecap', 'round');
      arrowPath.setAttribute('stroke-linejoin', 'round');
      lanternGroup.appendChild(arrowPath);
    } else {
      // Abzweig-Pfeil (⤵ für rechts, ⤴ für links)
      const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      if (isRight) {
        arrowPath.setAttribute('d', 'M -5 -3 H 1 Q 4 -3 4 1 V 4 M 1 2 L 4 5 L 7 2');
      } else {
        arrowPath.setAttribute('d', 'M -5 3 H 1 Q 4 3 4 -1 V -4 M 1 -2 L 4 -5 L 7 -2');
      }
      arrowPath.setAttribute('fill', 'none');
      arrowPath.setAttribute('stroke', '#58a6ff');
      arrowPath.setAttribute('stroke-width', '2');
      arrowPath.setAttribute('stroke-linecap', 'round');
      arrowPath.setAttribute('stroke-linejoin', 'round');
      lanternGroup.appendChild(arrowPath);
    }

    // Weichen-Kennung
    const toLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    toLabel.setAttribute('x', '0');
    toLabel.setAttribute('y', isRight ? '-13' : '19');
    toLabel.setAttribute('text-anchor', 'middle');
    toLabel.setAttribute('fill', '#8b949e');
    toLabel.setAttribute('font-size', '8px');
    toLabel.setAttribute('font-weight', 'bold');
    toLabel.textContent = to ? (to.name.length > 8 ? `W${to.address}` : to.name) : 'W';
    lanternGroup.appendChild(toLabel);

    // Klick-Events für Weiche & Laterne
    lanternGroup.style.cursor = 'pointer';
    g.style.cursor = 'pointer';

    const handleSwitch = (e: MouseEvent) => {
      e.stopPropagation();
      if (this.isEditMode) {
        if (this.currentTool === 'INSPECT' || this.currentTool.startsWith('TURNOUT')) {
          if (to) this.openTurnoutModal(to.id);
        }
      } else {
        if (!to) return;
        const nextState = to.state === 'STRAIGHT' ? 'DIVERGENT' : 'STRAIGHT';
        wsClient.send({ type: 'SET_TURNOUT', payload: { turnoutId: to.id, state: nextState } });
      }
    };

    lanternGroup.addEventListener('click', handleSwitch);
    g.appendChild(lanternGroup);
  }

  private renderBlockTrack(g: SVGGElement, elem: TrackElement): void {
    const half = this.cellSize / 2;

    // 1. Schotterbett & Schwellen unter dem Block
    const ballast = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    ballast.setAttribute('x', `${-half}`);
    ballast.setAttribute('y', '-13');
    ballast.setAttribute('width', `${this.cellSize}`);
    ballast.setAttribute('height', '26');
    ballast.setAttribute('rx', '3');
    ballast.setAttribute('fill', '#161b22');
    ballast.setAttribute('stroke', '#21262d');
    ballast.setAttribute('stroke-width', '1');
    g.appendChild(ballast);

    for (const sx of [-32, -16, 0, 16, 32]) {
      this.renderSleeper(g, sx, -10, sx, 10);
    }

    // 2. Schienen durch den Block
    this.renderRailLine(g, -half, -6, half, -6);
    this.renderRailLine(g, -half, 6, half, 6);

    // 3. Isolierstöße an den Blockgrenzen
    this.renderInsulatedJoint(g, -35);
    this.renderInsulatedJoint(g, 35);

    // Falls kein Block verknüpft ist: Platzhalter anzeigen
    const block = wsClient.blocks.find((b) => b.id === elem.linkedId);
    if (!block) {
      const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      placeholder.setAttribute('x', `${-this.cellSize * 0.7}`);
      placeholder.setAttribute('y', '-16');
      placeholder.setAttribute('width', `${this.cellSize * 1.4}`);
      placeholder.setAttribute('height', '32');
      placeholder.setAttribute('rx', '4');
      placeholder.setAttribute('fill', 'rgba(110, 118, 129, 0.25)');
      placeholder.setAttribute('stroke', '#6e7681');
      placeholder.setAttribute('stroke-dasharray', '4,4');
      g.appendChild(placeholder);

      const phText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      phText.setAttribute('x', '0');
      phText.setAttribute('y', '4');
      phText.setAttribute('text-anchor', 'middle');
      phText.setAttribute('fill', '#8b949e');
      phText.setAttribute('font-size', '9px');
      phText.textContent = 'Freier Block';
      g.appendChild(phText);
    }
  }

  private renderBlockBadge(g: SVGGElement, block: Block, elem: TrackElement): void {
    const isSelected = this.selectedStartBlockId === block.id;
    const isDragOver = this.dragOverBlockId === block.id;
    const isTargetForDepotLoco = !!TrainDepotDrawer.selectedLocoId;

    const loco = block.currentLocoId ? wsClient.locos.find((l) => l.id === block.currentLocoId) : null;
    const dirArrow = block.direction === '+' ? '➔' : '⬅';
    let typeIcon = '🏢';
    if (block.type === 'LOCAL_STATION') typeIcon = '🚏';
    else if (block.type === 'SHADOW_STATION') typeIcon = '🚇';
    else if (block.type === 'MAINLINE') typeIcon = '🛤️';
    else if (block.type === 'SIDING') typeIcon = '🏗️';
    const blockTitle = `${typeIcon} ${dirArrow} ${block.name}`;
    const locoTitle = loco ? `🚂 ${loco.name || block.currentLocoId} (${loco.speed || 0})` : '';

    const hasTimer = !!block.waitTimer;
    // Dynamische Breite & Typografie berechnen, damit lange Namen perfekt reinpassen und nichts abgeschnitten wird
    const maxChars = Math.max(blockTitle.length, locoTitle.length);
    const calculatedWidth = Math.max(this.cellSize * 1.5, maxChars * 6.5 + 22);
    // Begrenzung, damit er nicht zu tief in Nachbarkacheln ragt
    const width = Math.min(this.cellSize * 1.85, calculatedWidth);
    const height = hasTimer ? 48 : 34;

    // 1. Blickdichte Trägerplatte (GARANTIERT, dass darunterliegende Gleise NIEMALS durch den Text schneiden!)
    const bgBase = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgBase.setAttribute('x', `${-width / 2}`);
    bgBase.setAttribute('y', `${-height / 2}`);
    bgBase.setAttribute('width', `${width}`);
    bgBase.setAttribute('height', `${height}`);
    bgBase.setAttribute('rx', '6');
    bgBase.setAttribute('fill', '#0d1117');
    bgBase.setAttribute('stroke', 'none');
    g.appendChild(bgBase);

    // 2. Status-Hintergrund mit Farbcodierung & Glow
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', `${-width / 2}`);
    bg.setAttribute('y', `${-height / 2}`);
    bg.setAttribute('width', `${width}`);
    bg.setAttribute('height', `${height}`);
    bg.setAttribute('rx', '6');

    // Farbcodierung
    let stroke = '#30363d';
    let fill = 'rgba(22, 27, 34, 0.95)';

    if (block.state === 'OCCUPIED') {
      fill = 'rgba(218, 54, 51, 0.4)';
      stroke = '#f85149';
      bg.setAttribute('filter', 'url(#glow-red)');
    } else if (block.state === 'RESERVED') {
      fill = 'rgba(210, 153, 34, 0.4)';
      stroke = '#d29922';
      bg.setAttribute('filter', 'url(#glow-yellow)');
    } else if (block.state === 'GHOST') {
      fill = 'rgba(255, 0, 0, 0.65)';
      stroke = '#ff0000';
    }

    if (block.waitTimer?.status === 'WAITING') {
      stroke = '#e3b341';
      fill = 'rgba(227, 179, 65, 0.22)';
      bg.setAttribute('stroke-dasharray', '5,2.5');
    } else if (block.waitTimer?.status === 'DISPATCH_BLOCKED') {
      stroke = '#f85149';
      fill = 'rgba(218, 54, 51, 0.25)';
      bg.setAttribute('stroke-dasharray', '3,3');
    }

    if (isSelected) {
      stroke = '#58a6ff';
      fill = 'rgba(47, 129, 247, 0.45)';
    }

    if (isDragOver) {
      stroke = '#3fb950';
      fill = 'rgba(46, 160, 67, 0.45)';
      bg.setAttribute('filter', 'url(#glow-green)');
    } else if (isTargetForDepotLoco && !isSelected) {
      stroke = '#3fb950';
      bg.setAttribute('filter', 'url(#glow-green)');
    }

    bg.setAttribute('fill', fill);
    bg.setAttribute('stroke', stroke);
    bg.setAttribute('stroke-width', isDragOver ? '3' : ((isSelected || isTargetForDepotLoco) ? '2.5' : '1.5'));
    if (isDragOver || isTargetForDepotLoco) {
      bg.setAttribute('stroke-dasharray', '5,3');
    }

    bg.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.showBlockContextMenu(e.clientX, e.clientY, block);
    });

    // Long-Press für Touchscreens (ersetzt Rechtsklick für Block-Kontextmenü)
    let blockTouchTimer: any = null;
    let blockTouchStartX = 0;
    let blockTouchStartY = 0;
    let blockLongPressTriggered = false;

    bg.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      blockLongPressTriggered = false;
      const t = e.touches[0];
      blockTouchStartX = t.clientX;
      blockTouchStartY = t.clientY;
      blockTouchTimer = setTimeout(() => {
        blockLongPressTriggered = true;
        if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
        this.showBlockContextMenu(blockTouchStartX, blockTouchStartY, block);
      }, 500);
    }, { passive: true });

    bg.addEventListener('touchmove', (e: TouchEvent) => {
      if (blockTouchTimer && e.touches.length === 1) {
        const dx = e.touches[0].clientX - blockTouchStartX;
        const dy = e.touches[0].clientY - blockTouchStartY;
        if (Math.hypot(dx, dy) > 10) {
          clearTimeout(blockTouchTimer);
          blockTouchTimer = null;
        }
      }
    }, { passive: true });

    const cancelBlockTouch = () => {
      if (blockTouchTimer) {
        clearTimeout(blockTouchTimer);
        blockTouchTimer = null;
      }
    };
    bg.addEventListener('touchend', cancelBlockTouch);
    bg.addEventListener('touchcancel', cancelBlockTouch);

    if (!this.isEditMode) {
      bg.style.cursor = 'pointer';
      bg.addEventListener('click', (e) => {
        if (blockLongPressTriggered) {
          blockLongPressTriggered = false;
          return;
        }
        e.stopPropagation();
        this.handleBlockClick(block);
      });
    } else {
      bg.style.cursor = 'pointer';
      bg.addEventListener('click', (e) => {
        if (this.currentTool === 'INSPECT' || this.currentTool === 'BLOCK') {
          e.stopPropagation();
          this.openBlockModal(block.id);
        }
      });
    }

    g.appendChild(bg);

    // Text Label mit Richtungspfeil (immer lesbar / nie auf dem Kopf)
    const blockLabelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (elem.rotation !== 0) {
      blockLabelGroup.setAttribute('transform', `rotate(${-elem.rotation}, 0, 0)`);
    }

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', hasTimer ? '-9' : (block.currentLocoId ? '-2' : '4'));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#f0f6fc');

    let blockFontSize = '10px';
    if (blockTitle.length > 28) {
      blockFontSize = '8px';
    } else if (blockTitle.length > 21) {
      blockFontSize = '9px';
    }
    text.setAttribute('font-size', blockFontSize);
    text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', 'sans-serif');
    text.textContent = blockTitle;
    text.style.pointerEvents = 'none';
    blockLabelGroup.appendChild(text);

    // Wenn Zug im Block ist: Zug-Label anzeigen
    if (block.currentLocoId) {
      const locoText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      locoText.setAttribute('x', '0');
      locoText.setAttribute('y', hasTimer ? '4' : '12');
      locoText.setAttribute('text-anchor', 'middle');
      locoText.setAttribute('fill', '#58a6ff');

      let locoFontSize = '11px';
      if (locoTitle.length > 28) {
        locoFontSize = '8.5px';
      } else if (locoTitle.length > 21) {
        locoFontSize = '9.5px';
      }
      locoText.setAttribute('font-size', locoFontSize);
      locoText.setAttribute('font-weight', '700');
      locoText.setAttribute('font-family', 'monospace');
      locoText.textContent = locoTitle;
      locoText.style.pointerEvents = 'none';
      blockLabelGroup.appendChild(locoText);
    }

    // Wenn Wartezeit-Timer aktiv: Live-Countdown anzeigen
    if (block.waitTimer) {
      const timerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      timerText.setAttribute('id', `block-timer-text-${block.id}`);
      timerText.setAttribute('class', 'block-live-timer');
      timerText.setAttribute('data-block-id', block.id);
      timerText.setAttribute('x', '0');
      timerText.setAttribute('y', '17');
      timerText.setAttribute('text-anchor', 'middle');
      timerText.setAttribute('font-size', '9.5px');
      timerText.setAttribute('font-weight', '700');
      timerText.setAttribute('font-family', 'monospace');
      timerText.style.pointerEvents = 'none';

      if (block.waitTimer.status === 'WAITING') {
        const rem = Math.max(0, Math.ceil((block.waitTimer.departureTimestamp - Date.now()) / 1000));
        timerText.setAttribute('fill', '#e3b341');
        timerText.textContent = `⏳ Abfahrt in ${rem}s`;
      } else {
        timerText.setAttribute('fill', '#f85149');
        timerText.textContent = `🚦 Warten auf Ausfahrt`;
      }
      blockLabelGroup.appendChild(timerText);
    }

    g.appendChild(blockLabelGroup);
  }

  private renderSleeper(g: SVGGElement, x1: number, y1: number, x2: number, y2: number): void {
    const sleeper = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    sleeper.setAttribute('x1', `${x1}`);
    sleeper.setAttribute('y1', `${y1}`);
    sleeper.setAttribute('x2', `${x2}`);
    sleeper.setAttribute('y2', `${y2}`);
    sleeper.setAttribute('stroke', '#282e38');
    sleeper.setAttribute('stroke-width', '3.5');
    sleeper.setAttribute('stroke-linecap', 'round');
    g.appendChild(sleeper);
  }

  private renderRailLine(
    g: SVGGElement,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    customColor?: string,
    hasGlow?: boolean
  ): void {
    const baseRail = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    baseRail.setAttribute('x1', `${x1}`);
    baseRail.setAttribute('y1', `${y1}`);
    baseRail.setAttribute('x2', `${x2}`);
    baseRail.setAttribute('y2', `${y2}`);
    baseRail.setAttribute('stroke', customColor || '#8b949e');
    baseRail.setAttribute('stroke-width', '2.5');
    if (hasGlow) {
      baseRail.setAttribute('filter', 'url(#glow-blue)');
    }
    g.appendChild(baseRail);

    const shine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    shine.setAttribute('x1', `${x1}`);
    shine.setAttribute('y1', `${y1}`);
    shine.setAttribute('x2', `${x2}`);
    shine.setAttribute('y2', `${y2}`);
    shine.setAttribute('stroke', '#c9d1d9');
    shine.setAttribute('stroke-width', '0.8');
    shine.setAttribute('opacity', '0.7');
    g.appendChild(shine);
  }

  private renderRailPath(
    g: SVGGElement,
    d: string,
    customColor?: string,
    width = 2.5,
    hasGlow?: boolean
  ): void {
    const baseRail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    baseRail.setAttribute('d', d);
    baseRail.setAttribute('fill', 'none');
    baseRail.setAttribute('stroke', customColor || '#8b949e');
    baseRail.setAttribute('stroke-width', `${width}`);
    if (hasGlow) {
      baseRail.setAttribute('filter', 'url(#glow-blue)');
    }
    g.appendChild(baseRail);

    const shine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shine.setAttribute('d', d);
    shine.setAttribute('fill', 'none');
    shine.setAttribute('stroke', '#c9d1d9');
    shine.setAttribute('stroke-width', '0.8');
    shine.setAttribute('opacity', '0.7');
    g.appendChild(shine);
  }

  private renderInsulatedJoint(g: SVGGElement, x: number): void {
    const j1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    j1.setAttribute('x1', `${x}`);
    j1.setAttribute('y1', '-8');
    j1.setAttribute('x2', `${x}`);
    j1.setAttribute('y2', '-4');
    j1.setAttribute('stroke', '#d29922');
    j1.setAttribute('stroke-width', '1.5');
    g.appendChild(j1);

    const j2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    j2.setAttribute('x1', `${x}`);
    j2.setAttribute('y1', '4');
    j2.setAttribute('x2', `${x}`);
    j2.setAttribute('y2', '8');
    j2.setAttribute('stroke', '#d29922');
    j2.setAttribute('stroke-width', '1.5');
    g.appendChild(j2);
  }

  private handleBlockClick(block: Block): void {
    if (this.isEditMode) return;

    // 1. Wenn eine Lok im Depot zum Aufgleisen angetippt wurde:
    if (TrainDepotDrawer.selectedLocoId) {
      const locoId = TrainDepotDrawer.selectedLocoId;
      const loco = wsClient.locos.find((l) => l.id === locoId);
      if (loco) {
        if (block.currentLocoId && block.currentLocoId !== loco.id) {
          const currentLoco = wsClient.locos.find((l) => l.id === block.currentLocoId);
          const confirmReplace = confirm(
            `Block "${block.name}" ist aktuell belegt durch "${currentLoco?.name || block.currentLocoId}".\n` +
            `Möchtest du "${loco.name}" stattdessen in diesen Block setzen?`
          );
          if (!confirmReplace) return;
        }

        wsClient.send({
          type: 'ASSIGN_LOCO_TO_BLOCK',
          payload: {
            locoId: loco.id,
            blockId: block.id
          }
        });
        TrainDepotDrawer.clearSelection();
        return;
      }
    }

    if (!this.selectedStartBlockId) {
      if (block.currentLocoId) {
        this.selectedStartBlockId = block.id;
        this.updateHelperText();
        this.render();
      } else {
        alert(`Der Block "${block.name}" enthält keinen Zug. Klicke auf einen belegten Block als Start!`);
      }
    } else {
      if (this.selectedStartBlockId === block.id) {
        this.selectedStartBlockId = null;
        this.updateHelperText();
        this.render();
        return;
      }

      if (block.state !== 'FREE') {
        alert(`Zielblock "${block.name}" ist belegt oder reserviert! Bitte wähle ein freies Gleis.`);
        return;
      }

      const from = this.selectedStartBlockId;
      const to = block.id;
      this.selectedStartBlockId = null;
      this.updateHelperText();
      this.render();

      wsClient.send({
        type: 'REQUEST_ROUTE',
        payload: { fromBlockId: from, toBlockId: to }
      });
    }
  }

  public showBlockContextMenu(clientX: number, clientY: number, block: Block): void {
    const menu = document.getElementById('block-context-menu');
    if (!menu) return;

    const currentLoco = block.currentLocoId
      ? wsClient.locos.find((l) => l.id === block.currentLocoId)
      : null;

    const reservedLoco = block.reservedForLocoId
      ? wsClient.locos.find((l) => l.id === block.reservedForLocoId)
      : null;

    let statusHtml = '';
    let actionButtons = '';

    if (currentLoco) {
      statusHtml = `
        <div class="ctx-block-status occupied">
          <span class="status-indicator">🔴</span>
          <div class="status-details">
            <div class="status-label">Belegt von:</div>
            <div class="status-loco-name">🚂 ${currentLoco.name} <span class="loco-dcc">#${currentLoco.dccAddress}</span></div>
          </div>
        </div>
      `;

      actionButtons += `
        <button id="ctx-btn-free-block" class="ctx-menu-item danger">
          <span class="ctx-item-icon">🚫</span>
          <span class="ctx-item-text">
            <strong>Block freigeben</strong>
            <small>Zug "${currentLoco.name}" entfernen & Gleis räumen</small>
          </span>
        </button>
      `;
    } else if (reservedLoco || block.state === 'RESERVED') {
      statusHtml = `
        <div class="ctx-block-status reserved" style="border-left: 3px solid #d29922; background: rgba(210, 153, 34, 0.15); padding: 8px 12px; border-radius: 6px; margin-bottom: 10px;">
          <span class="status-indicator">🟡</span>
          <div class="status-details">
            <div class="status-label" style="font-size: 11px; color: #8b949e;">Fahrstraße reserviert:</div>
            <div class="status-loco-name" style="font-weight: bold; color: #d29922;">
              ${reservedLoco ? `🚂 ${reservedLoco.name} (#${reservedLoco.dccAddress})` : 'Reserviert für Fahrstraße'}
            </div>
          </div>
        </div>
      `;

      actionButtons += `
        <button id="ctx-btn-free-block" class="ctx-menu-item danger">
          <span class="ctx-item-icon">🚫</span>
          <span class="ctx-item-text">
            <strong>Reservierung aufheben & Block freigeben</strong>
            <small>Fahrstraße stornieren und Gleis auf FREI setzen</small>
          </span>
        </button>
      `;
    } else if (block.state === 'GHOST') {
      statusHtml = `
        <div class="ctx-block-status ghost" style="border-left: 3px solid #ff0000; background: rgba(255, 0, 0, 0.15); padding: 8px 12px; border-radius: 6px; margin-bottom: 10px;">
          <span class="status-indicator">⚠️</span>
          <div class="status-details">
            <div class="status-label" style="font-size: 11px; color: #f85149;">Geisterzug-Alarm!</div>
            <div class="status-loco-name" style="font-weight: bold; color: #ff7b72;">Unangemeldeter Sensor ausgelöst</div>
          </div>
        </div>
      `;

      actionButtons += `
        <button id="ctx-btn-free-block" class="ctx-menu-item danger">
          <span class="ctx-item-icon">🚫</span>
          <span class="ctx-item-text">
            <strong>Geisterzug-Alarm quittieren & Gleis freigeben</strong>
            <small>Block zurücksetzen</small>
          </span>
        </button>
      `;
    } else if (block.state === 'OCCUPIED') {
      statusHtml = `
        <div class="ctx-block-status occupied">
          <span class="status-indicator">🔴</span>
          <div class="status-details">
            <div class="status-label">Belegt (kein Zug zugewiesen)</div>
            <div class="status-loco-name">Sensor meldet Besetztzustand</div>
          </div>
        </div>
      `;

      actionButtons += `
        <button id="ctx-btn-free-block" class="ctx-menu-item danger">
          <span class="ctx-item-icon">🚫</span>
          <span class="ctx-item-text">
            <strong>Block freigeben & zurücksetzen</strong>
            <small>Gleis auf FREI setzen</small>
          </span>
        </button>
      `;
    } else {
      statusHtml = `
        <div class="ctx-block-status free">
          <span class="status-indicator">🟢</span>
          <div class="status-details">
            <div class="status-label">Gleis frei</div>
            <div class="status-loco-name">Bereit für Zugzuweisung</div>
          </div>
        </div>
      `;
    }

    // Wartezeit-Timer & Sofort-Abfahrt Button
    if (block.waitTimer) {
      const rem = Math.max(0, Math.ceil((block.waitTimer.departureTimestamp - Date.now()) / 1000));
      statusHtml += `
        <div class="ctx-timer-box ${block.waitTimer.status === 'DISPATCH_BLOCKED' ? 'blocked' : ''}">
          <div class="ctx-timer-header">
            <span>${block.waitTimer.status === 'WAITING' ? '⏳' : '🚦'}</span>
            <span>${block.waitTimer.status === 'WAITING' ? 'Planmäßiger Halt (Wartezeit)' : 'Ausfahrt aktuell blockiert'}</span>
          </div>
          <div class="ctx-timer-value" id="ctx-timer-countdown" data-block-id="${block.id}">
            ${block.waitTimer.status === 'WAITING'
              ? `Noch <strong>${rem}s</strong> bis zur planmäßigen Abfahrt (von ${block.waitTimer.totalWaitSec}s)`
              : 'Wartezeit abgelaufen. Signal oder Zielblock ist noch belegt!'}
          </div>
        </div>
      `;

      actionButtons = `
        <button id="ctx-btn-dispatch-now" class="ctx-menu-item primary">
          <span class="ctx-item-icon">⚡</span>
          <span class="ctx-item-text">
            <strong>Sofort abfahren lassen</strong>
            <small>${block.waitTimer.status === 'WAITING' ? 'Wartezeit überspringen & Route stellen' : 'Erneut Ausfahrt anfordern'}</small>
          </span>
        </button>
      ` + actionButtons;
    }

    // Quick-Zuweisung wenn kein Zug auf dem Block steht
    if (!currentLoco) {
      const unassignedLocos = wsClient.locos.filter((l) => !l.currentBlockId);
      if (unassignedLocos.length > 0) {
        actionButtons += `
          <div class="ctx-menu-group">
            <div class="ctx-group-title">Zug aus Depot aufsetzen:</div>
            <div class="ctx-quick-locos">
              ${unassignedLocos.map((l) => `
                <button class="ctx-btn-quick-assign" data-loco-id="${l.id}" title="${l.name}">
                  🚂 ${l.name} (#${l.dccAddress})
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }
    } else {
      // Wenn bereits eine Lok da ist: Zug tauschen anbieten
      const otherLocos = wsClient.locos.filter((l) => !l.currentBlockId && l.id !== currentLoco.id);
      if (otherLocos.length > 0) {
        actionButtons += `
          <div class="ctx-menu-group">
            <div class="ctx-group-title">Zug tauschen:</div>
            <div class="ctx-quick-locos">
              ${otherLocos.map((l) => `
                <button class="ctx-btn-quick-assign" data-loco-id="${l.id}" title="${l.name}">
                  🔄 ${l.name} (#${l.dccAddress})
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    menu.innerHTML = `
      <div class="ctx-menu-header">
        <div class="ctx-header-title">
          <span class="ctx-header-icon">⬛</span>
          <span class="ctx-header-name">${block.name}</span>
        </div>
        <span class="ctx-header-badge ${block.state.toLowerCase()}">${block.state}</span>
      </div>

      <div class="ctx-menu-body">
        ${statusHtml}
        <div class="ctx-menu-actions">
          ${actionButtons}
          <button id="ctx-btn-configure-block" class="ctx-menu-item">
            <span class="ctx-item-icon">⚙️</span>
            <span class="ctx-item-text">
              <strong>Block konfigurieren...</strong>
              <small>Länge, Richtung, RM-Melder einstellen</small>
            </span>
          </button>
        </div>
      </div>
    `;

    // Event Handlers
    document.getElementById('ctx-btn-dispatch-now')?.addEventListener('click', () => {
      wsClient.send({
        type: 'DISPATCH_BLOCK_NOW',
        payload: { blockId: block.id }
      });
      this.hideBlockContextMenu();
    });

    document.getElementById('ctx-btn-free-block')?.addEventListener('click', () => {
      wsClient.send({
        type: 'FREE_BLOCK',
        payload: { blockId: block.id }
      });
      this.hideBlockContextMenu();
    });

    document.getElementById('ctx-btn-configure-block')?.addEventListener('click', () => {
      this.hideBlockContextMenu();
      this.openBlockModal(block.id);
    });

    menu.querySelectorAll<HTMLButtonElement>('.ctx-btn-quick-assign').forEach((btn) => {
      btn.addEventListener('click', () => {
        const locoId = btn.dataset.locoId;
        if (locoId) {
          wsClient.send({
            type: 'ASSIGN_LOCO_TO_BLOCK',
            payload: { locoId, blockId: block.id }
          });
        }
        this.hideBlockContextMenu();
      });
    });

    // Menü anzeigen & positionieren (innerhalb des Viewports halten)
    menu.style.display = 'block';
    const menuWidth = 280;
    const menuHeight = menu.offsetHeight || 200;

    let posX = clientX;
    let posY = clientY;

    if (posX + menuWidth > window.innerWidth - 12) {
      posX = window.innerWidth - menuWidth - 12;
    }
    if (posY + menuHeight > window.innerHeight - 12) {
      posY = window.innerHeight - menuHeight - 12;
    }

    menu.style.left = `${Math.max(10, posX)}px`;
    menu.style.top = `${Math.max(10, posY)}px`;
  }

  public hideBlockContextMenu(): void {
    const menu = document.getElementById('block-context-menu');
    if (menu) {
      menu.style.display = 'none';
    }
  }
}
