import { Block, BlockStopPolicy, BlockType, Sensor, Signal, TrackElement, Turnout, getSignalSupportedAspects } from '../types.js';
import { wsClient } from '../wsClient.js';
import { TrainDepotDrawer } from './TrainDepotDrawer.js';
import { t } from '../i18n.js';
import { locoImageSrc } from '../locoImage.js';
import { escapeAttr, escapeHtml } from '../sanitize.js';
import { showToast } from '../toast.js';
import { iconAlert, iconDot, iconLocos, iconRoutes, iconSettings, iconTrash } from '../icons.js';
import type { EditorTool } from '../editor/editorTypes.ts';
import { LayoutHistory, RenderScheduler, decideGridClick, isRepeatClick, rotateBy90 } from '../editor/editorCore.ts';

export type { EditorTool };

type SaveState = 'saved' | 'pending' | 'offline';

const TYPE_NAMES: Record<string, string> = {
  STRAIGHT: 'Gerade',
  CURVE: 'Kurve',
  TURNOUT_LEFT: 'Weiche links',
  TURNOUT_RIGHT: 'Weiche rechts',
  BLOCK: 'Block',
  SIGNAL: 'Signal',
  SENSOR: 'Sensor',
  BUFFER: 'Prellbock'
};

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
  private hoverRect: SVGRectElement | null = null;
  private dragOverBlockId: string | null = null;

  // Editor-Robustheit: Auswahl, Undo/Redo, Speicherstatus, gebündeltes Neuzeichnen
  private selectedElemId: string | null = null;
  private history = new LayoutHistory(100);
  private layoutDirty = false;
  private saveState: SaveState = 'saved';
  private selectionBar: HTMLDivElement | null = null;
  private layoutAtEditExit: string | null = null;
  private scheduler: RenderScheduler;

  constructor(svgElement: SVGSVGElement) {
    this.svg = svgElement;
    this.scheduler = new RenderScheduler(() => this.renderNow(), (cb) => requestAnimationFrame(cb));
    this.init();
    this.initModals();
    this.initEditorControls();
  }

  private init(): void {
    // Server-Gleisplan darf lokale Editor-Änderungen nicht überschreiben
    wsClient.layoutGuard = () => this.isEditMode || this.layoutDirty;

    wsClient.subscribe(() => {
      // Nach Wiederverbindung nicht gesendete Gleisplan-Änderungen nachholen
      if (this.layoutDirty && wsClient.status.connected && !this.autoSaveTimer) {
        this.flushLayoutSave();
      }
      this.render();
    });

    // Während Maustaste/Finger gedrückt ist, nicht neu zeichnen (sonst gehen Klicks verloren)
    const canvasContainer = this.svg.parentElement;
    canvasContainer?.addEventListener('pointerdown', () => this.scheduler.hold(), true);
    window.addEventListener('pointerup', () => this.scheduler.release());
    window.addEventListener('pointercancel', () => this.scheduler.release());
    canvasContainer?.addEventListener('scroll', () => this.positionSelectionBar(), { passive: true });
    window.addEventListener('resize', () => this.positionSelectionBar());

    // Mouse Move für Gitter-Vorschau im Editor (nur das Hover-Rechteck verschieben, kein Neuzeichnen)
    this.svg.addEventListener('mousemove', (e) => {
      if (!this.isEditMode) return;
      const pos = this.getGridPosFromEvent(e);
      if (!this.hoveredCell || this.hoveredCell.x !== pos.x || this.hoveredCell.y !== pos.y) {
        this.hoveredCell = pos;
        this.updateHoverRect();
      }
    });

    this.svg.addEventListener('mouseleave', () => {
      if (this.isEditMode && this.hoveredCell) {
        this.hoveredCell = null;
        this.updateHoverRect();
      }
    });

    // Klick auf das SVG-Canvas (Editor): eine Stelle für alle Editor-Klicks
    this.svg.addEventListener('click', (e) => {
      if (!this.isEditMode) return;
      if (isRepeatClick(e)) return; // Doppelklick = nur eine Aktion
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
        if (!menu.contains(e.target as Node) && !this.isContextMenuJustOpened()) {
          this.hideBlockContextMenu();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideBlockContextMenu();
      }
    });

    // Editor-Tastenkürzel. Capture-Phase, damit z. B. "R" im Editor nicht zusätzlich
    // die Fahrtrichtung der aktiven Lok umschaltet (globale Steuerung in main.ts).
    window.addEventListener('keydown', (e) => this.handleEditorKey(e), true);

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
            textElem.textContent = `Abfahrt in ${rem} s`;
          } else {
            textElem.textContent = `Abfahrt …`;
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

      // Belegung läuft nicht über UPDATE_BLOCK (der Server übernimmt dort nur Stammdaten),
      // sondern über die Zuweisung: neue Lok aufsetzen oder bisherige Lok aus dem Block nehmen.
      if (newLocoId !== block.currentLocoId) {
        if (newLocoId) {
          wsClient.send({ type: 'ASSIGN_LOCO_TO_BLOCK', payload: { locoId: newLocoId, blockId: updatedBlock.id } });
        } else if (block.currentLocoId) {
          wsClient.send({ type: 'ASSIGN_LOCO_TO_BLOCK', payload: { locoId: block.currentLocoId, blockId: null } });
        }
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
      this.recordHistory();
      for (const el of wsClient.layout) {
        el.x += 1;
      }
      this.updateGridDimensions();
      this.render();
      this.triggerAutoSave();
    } else if (direction === 'TOP') {
      this.recordHistory();
      for (const el of wsClient.layout) {
        el.y += 1;
      }
      this.updateGridDimensions();
      this.render();
      this.triggerAutoSave();
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
    if (!edit && (this.autoSaveTimer || this.layoutDirty)) {
      this.flushLayoutSave();
    }

    this.isEditMode = edit;
    this.selectedStartBlockId = null;
    this.hoveredCell = null;
    this.selectedElemId = null;
    // Rückgängig-Verlauf bleibt über einen Abstecher in den Fahrbetrieb erhalten.
    // Nur wenn sich der Plan inzwischen von außen geändert hat, passt er nicht mehr -> verwerfen.
    if (edit) {
      if (this.layoutAtEditExit !== null && this.layoutAtEditExit !== JSON.stringify(wsClient.layout)) {
        this.history.clear();
      }
    } else {
      this.layoutAtEditExit = JSON.stringify(wsClient.layout);
    }

    const palette = document.getElementById('editor-palette');
    if (palette) {
      palette.style.display = edit ? 'flex' : 'none';
    }

    this.updateHelperText();
    this.updateEditorButtons();
    this.render();
  }

  public setTool(tool: EditorTool): void {
    this.currentTool = tool;
    this.updateHelperText();
  }

  private autoSaveTimer: number | null = null;

  private backupLayoutLocally(): void {
    try {
      localStorage.setItem('trainmaster_layout_backup', JSON.stringify(wsClient.layout));
    } catch {}
  }

  public triggerAutoSave(): void {
    if (this.autoSaveTimer) {
      window.clearTimeout(this.autoSaveTimer);
    }
    this.layoutDirty = true;
    this.setSaveState('pending');
    this.backupLayoutLocally();

    this.autoSaveTimer = window.setTimeout(() => {
      this.autoSaveTimer = null;
      this.flushLayoutSave();
    }, 600);
  }

  /** Gleisplan sofort senden. Ohne Verbindung bleibt er als "ungespeichert" markiert und wird nachgeholt. */
  private flushLayoutSave(): void {
    if (this.autoSaveTimer) {
      window.clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.backupLayoutLocally();
    const sent = wsClient.send({
      type: 'UPDATE_LAYOUT',
      payload: { elements: wsClient.layout }
    });
    this.layoutDirty = !sent;
    this.setSaveState(sent ? 'saved' : 'offline');
  }

  public saveLayout(showFeedback = true): void {
    this.layoutDirty = true;
    this.flushLayoutSave();
    if (showFeedback) {
      if (this.saveState === 'saved') showToast('✓ Gleisplan auf dem Server gespeichert.');
      else showToast('⚠ Keine Verbindung zum Server – wird automatisch nachgeholt.', { tone: 'warn' });
    }
  }

  public clearLayout(): void {
    if (wsClient.layout.length === 0) return;
    if (confirm('Möchtest du wirklich alle Gleise vom Plan entfernen?\n(Lässt sich mit "Rückgängig" wiederherstellen.)')) {
      this.recordHistory();
      wsClient.layout = [];
      this.selectedElemId = null;
      this.render();
      this.triggerAutoSave();
      showToast('Gleisplan geleert.', { actionLabel: 'Rückgängig', onAction: () => this.undo() });
    }
  }

  private setSaveState(state: SaveState): void {
    this.saveState = state;
    const el = document.getElementById('editor-save-status');
    if (!el) return;
    el.dataset.state = state;
    el.textContent = state === 'saved' ? '✓ Gespeichert' : state === 'pending' ? '… Speichert' : '⚠ Offline – wird nachgeholt';
  }

  // --- Undo / Redo -------------------------------------------------------

  private recordHistory(): void {
    this.history.record(wsClient.layout);
    this.updateEditorButtons();
  }

  public undo(): void {
    const prev = this.history.undo(wsClient.layout);
    if (!prev) return;
    this.applyHistoryState(prev);
  }

  public redo(): void {
    const next = this.history.redo(wsClient.layout);
    if (!next) return;
    this.applyHistoryState(next);
  }

  private applyHistoryState(layout: TrackElement[]): void {
    wsClient.layout = layout;
    if (this.selectedElemId && !layout.some((e) => e.id === this.selectedElemId)) {
      this.selectedElemId = null;
    }
    this.updateEditorButtons();
    this.render();
    this.triggerAutoSave();
  }

  private updateEditorButtons(): void {
    const undoBtn = document.getElementById('btn-undo') as HTMLButtonElement | null;
    const redoBtn = document.getElementById('btn-redo') as HTMLButtonElement | null;
    if (undoBtn) undoBtn.disabled = !this.history.canUndo;
    if (redoBtn) redoBtn.disabled = !this.history.canRedo;
  }

  private initEditorControls(): void {
    const guarded = (fn: () => void) => (e: MouseEvent) => {
      if (isRepeatClick(e)) return;
      fn();
    };
    document.getElementById('btn-undo')?.addEventListener('click', guarded(() => this.undo()));
    document.getElementById('btn-redo')?.addEventListener('click', guarded(() => this.redo()));
    this.updateEditorButtons();
    this.setSaveState('saved');
  }

  private isModalOpen(): boolean {
    return Array.from(document.querySelectorAll<HTMLElement>('.modal-overlay')).some(
      (m) => m.style.display !== 'none' && m.offsetParent !== null
    );
  }

  private handleEditorKey(e: KeyboardEvent): void {
    if (!this.isEditMode) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
    if (this.isModalOpen()) return;

    const ctrl = e.ctrlKey || e.metaKey;
    const consume = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    if (ctrl && e.code === 'KeyZ') {
      consume();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (ctrl && e.code === 'KeyY') {
      consume();
      this.redo();
      return;
    }
    if (ctrl) return;

    if (e.code === 'KeyR') {
      // Im Editor nie die Lok-Fahrtrichtung umschalten
      consume();
      if (!e.repeat && this.selectedElemId) this.rotateElement(this.selectedElemId);
      return;
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      if (this.selectedElemId) {
        consume();
        if (!e.repeat) this.deleteElement(this.selectedElemId);
      }
      return;
    }
    if (e.code === 'Escape' && this.selectedElemId) {
      this.selectElement(null);
    }
  }

  // --- Editor-Aktionen -----------------------------------------------------

  private handleGridClick(cellX: number, cellY: number): void {
    const existing = wsClient.layout.find((el) => el.x === cellX && el.y === cellY) || null;
    const decision = decideGridClick(existing, this.currentTool, this.selectedElemId);

    switch (decision.kind) {
      case 'place':
        this.placeElement(cellX, cellY, this.currentTool);
        break;
      case 'select':
        this.selectElement(decision.elemId);
        break;
      case 'deselect':
        this.selectElement(null);
        break;
      case 'rotate':
        this.rotateElement(decision.elemId);
        break;
      case 'delete':
        this.deleteElement(decision.elemId);
        break;
      case 'inspect':
        this.selectElement(decision.elemId);
        this.configureElement(decision.elemId);
        break;
      case 'none':
        break;
    }
  }

  private placeElement(cellX: number, cellY: number, tool: EditorTool): void {
    this.recordHistory();
    const newElem: TrackElement = {
      id: `elem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      x: cellX,
      y: cellY,
      rotation: 0,
      type: tool as TrackElement['type']
    };
    this.assignDefaultLinkedId(newElem);
    wsClient.layout.push(newElem);
    // Neues Element ausgewählt lassen, damit es direkt mit R gedreht werden kann
    this.selectedElemId = newElem.id;
    this.render();
    this.triggerAutoSave();
  }

  private selectElement(elemId: string | null): void {
    this.selectedElemId = elemId;
    this.render();
  }

  private rotateElement(elemId: string): void {
    const elem = wsClient.layout.find((e) => e.id === elemId);
    if (!elem) return;
    this.recordHistory();
    elem.rotation = rotateBy90(elem.rotation);
    this.render();
    this.triggerAutoSave();
  }

  private deleteElement(elemId: string): void {
    const idx = wsClient.layout.findIndex((e) => e.id === elemId);
    if (idx < 0) return;
    const elem = wsClient.layout[idx];
    this.recordHistory();
    wsClient.layout.splice(idx, 1);
    if (this.selectedElemId === elemId) this.selectedElemId = null;
    this.render();
    this.triggerAutoSave();
    showToast(`${this.describeElement(elem)} gelöscht.`, { actionLabel: 'Rückgängig', onAction: () => this.undo() });
  }

  private configureElement(elemId: string): void {
    const elem = wsClient.layout.find((e) => e.id === elemId);
    if (!elem) return;
    if (elem.type === 'BLOCK' && elem.linkedId) {
      this.openBlockModal(elem.linkedId);
    } else if (elem.type.startsWith('TURNOUT') && elem.linkedId) {
      this.openTurnoutModal(elem.linkedId);
    } else if (elem.type === 'SENSOR' && elem.linkedId) {
      this.openSensorModal(elem.linkedId);
    } else if (elem.type === 'SIGNAL') {
      this.openSignalModal(elem.linkedId, elem);
    }
  }

  private isConfigurable(elem: TrackElement): boolean {
    return elem.type === 'SIGNAL' || (!!elem.linkedId && (elem.type === 'BLOCK' || elem.type === 'SENSOR' || elem.type.startsWith('TURNOUT')));
  }

  private describeElement(elem: TrackElement): string {
    const base = TYPE_NAMES[elem.type] || elem.type;
    let name: string | undefined;
    if (elem.type === 'BLOCK') name = wsClient.blocks.find((b) => b.id === elem.linkedId)?.name;
    else if (elem.type.startsWith('TURNOUT')) name = wsClient.turnouts.find((t) => t.id === elem.linkedId)?.name;
    else if (elem.type === 'SIGNAL') name = wsClient.signals.find((s) => s.id === elem.linkedId)?.name;
    else if (elem.type === 'SENSOR') name = wsClient.sensors.find((s) => s.id === elem.linkedId)?.name;
    return name ? `${base} „${name}“` : base;
  }

  // --- Auswahl-Leiste über dem gewählten Element --------------------------

  private getSelectionBar(): HTMLDivElement {
    if (this.selectionBar) return this.selectionBar;
    const bar = document.createElement('div');
    bar.className = 'editor-selection-bar';
    bar.style.display = 'none';
    bar.innerHTML = `
      <span class="sel-label"></span>
      <button type="button" data-act="rotate" title="Drehen (Taste R)">⟳ Drehen <kbd>R</kbd></button>
      <button type="button" data-act="config" title="Einstellungen öffnen">⚙ Einstellungen</button>
      <button type="button" data-act="delete" class="danger" title="Löschen (Taste Entf)">🗑 Löschen <kbd>Entf</kbd></button>
    `;
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isRepeatClick(e)) return;
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      const id = this.selectedElemId;
      if (!btn || !id) return;
      if (btn.dataset.act === 'rotate') this.rotateElement(id);
      else if (btn.dataset.act === 'delete') this.deleteElement(id);
      else if (btn.dataset.act === 'config') this.configureElement(id);
    });
    document.body.appendChild(bar);
    this.selectionBar = bar;
    return bar;
  }

  private positionSelectionBar(): void {
    const elem = this.isEditMode && this.selectedElemId
      ? wsClient.layout.find((e) => e.id === this.selectedElemId)
      : undefined;
    if (!elem) {
      if (this.selectionBar) this.selectionBar.style.display = 'none';
      return;
    }
    const bar = this.getSelectionBar();
    const label = bar.querySelector('.sel-label');
    if (label) label.textContent = this.describeElement(elem);
    const cfgBtn = bar.querySelector<HTMLButtonElement>('button[data-act="config"]');
    if (cfgBtn) cfgBtn.style.display = this.isConfigurable(elem) ? '' : 'none';

    const svgRect = this.svg.getBoundingClientRect();
    const scale = svgRect.width / (this.cols * this.cellSize);
    const cellLeft = svgRect.left + elem.x * this.cellSize * scale;
    const cellTop = svgRect.top + elem.y * this.cellSize * scale;
    const cellW = this.cellSize * scale;

    // Nur zeigen, wenn das Element im sichtbaren Bereich des Gleisplans liegt
    const container = this.svg.parentElement?.getBoundingClientRect();
    const visible = !container || (
      cellLeft + cellW > container.left && cellLeft < container.right &&
      cellTop + cellW > container.top && cellTop < container.bottom
    );
    if (!visible) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'flex';
    const barW = bar.offsetWidth;
    const barH = bar.offsetHeight;
    let left = cellLeft + cellW / 2 - barW / 2;
    let top = cellTop - barH - 8;
    const minTop = (container?.top ?? 0) + 4;
    if (top < minTop) top = cellTop + cellW + 8; // kein Platz oben -> unter das Feld
    // Innerhalb des Gleisplans bleiben (nicht über das Zugdepot legen)
    const minLeft = (container?.left ?? 0) + 8;
    const maxLeft = Math.min(window.innerWidth, container?.right ?? window.innerWidth) - barW - 8;
    left = Math.max(minLeft, Math.min(maxLeft, left));
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
  }

  private updateHoverRect(): void {
    const r = this.hoverRect;
    if (!r) return;
    if (!this.isEditMode || !this.hoveredCell) {
      r.setAttribute('visibility', 'hidden');
      return;
    }
    r.setAttribute('visibility', 'visible');
    r.setAttribute('x', `${this.hoveredCell.x * this.cellSize}`);
    r.setAttribute('y', `${this.hoveredCell.y * this.cellSize}`);
    const occupied = wsClient.layout.some((e) => e.x === this.hoveredCell!.x && e.y === this.hoveredCell!.y);
    // Leeres Feld + Platzier-Werkzeug: blau (hier wird gesetzt). Belegt: grau (hier wird ausgewählt).
    const placing = !occupied && !['INSPECT', 'ROTATE', 'DELETE'].includes(this.currentTool);
    const deleting = occupied && this.currentTool === 'DELETE';
    r.setAttribute('fill', deleting ? 'rgba(248, 81, 73, 0.18)' : placing ? 'rgba(47, 129, 247, 0.15)' : 'rgba(139, 148, 158, 0.10)');
    r.setAttribute('stroke', deleting ? '#f85149' : placing ? '#58a6ff' : '#8b949e');
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

    if (titleEl) titleEl.textContent = `Block bearbeiten: ${block.name}`;
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

    if (titleEl) titleEl.textContent = `Weiche bearbeiten: ${turnout.name}`;
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
        case 'INSPECT': toolName = 'Einstellen'; break;
        case 'ROTATE': toolName = 'Drehen (+90°)'; break;
        case 'DELETE': toolName = 'Löschen'; break;
      }
      const hint = this.currentTool === 'DELETE'
        ? 'Klick auf ein Element löscht es.'
        : this.currentTool === 'ROTATE'
          ? 'Klick auf ein Element dreht es um 90°.'
          : this.currentTool === 'INSPECT'
            ? 'Klick auf ein Element öffnet seine Einstellungen.'
            : 'Klick auf ein leeres Feld setzt das Element. Klick auf ein vorhandenes Element wählt es aus.';
      textEl.innerHTML = `<em>Werkzeug: <strong>${toolName}</strong>. ${hint} <span class="helper-keys">R drehen · Entf löschen · Strg+Z rückgängig</span></em>`;
    } else if (this.selectedStartBlockId) {
      const b = wsClient.blocks.find((x) => x.id === this.selectedStartBlockId);
      textEl.innerHTML = `<span class="helper-step">Start: <strong>${escapeHtml(b?.name || '')}</strong>. Jetzt den <strong>Zielblock</strong> antippen.</span> <button type="button" id="btn-cancel-route" class="helper-cancel">Abbrechen</button>`;
      document.getElementById('btn-cancel-route')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedStartBlockId = null;
        this.updateHelperText();
        this.render();
      });
    } else if (TrainDepotDrawer.selectedLocoId) {
      const loco = wsClient.locos.find((l) => l.id === TrainDepotDrawer.selectedLocoId);
      textEl.innerHTML = `<span class="helper-step"><strong>${t('depot.instruction_selected')} (${escapeHtml(loco?.name || '')})</strong></span> <button type="button" id="btn-cancel-assign" class="helper-cancel">${t('depot.btn_cancel')}</button>`;
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

  /** Neuzeichnen anfordern. Wird gebündelt (max. 1x pro Frame) und während gedrückter Maustaste zurückgehalten. */
  public render(): void {
    this.scheduler.request();
  }

  private renderNow(): void {
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

    // Hover-Vorschau im Editor-Modus (wird bei Mausbewegung nur verschoben, nicht neu gebaut)
    this.hoverRect = null;
    if (this.isEditMode) {
      const hoverRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hoverRect.setAttribute('width', `${this.cellSize}`);
      hoverRect.setAttribute('height', `${this.cellSize}`);
      hoverRect.setAttribute('stroke-dasharray', '4,4');
      hoverRect.setAttribute('stroke-width', '1.5');
      hoverRect.style.pointerEvents = 'none';
      this.svg.appendChild(hoverRect);
      this.hoverRect = hoverRect;
      this.updateHoverRect();
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

    // Auswahlrahmen im Editor (über allem, klickt nicht mit)
    const selected = this.isEditMode && this.selectedElemId
      ? wsClient.layout.find((e) => e.id === this.selectedElemId)
      : undefined;
    if (this.selectedElemId && !selected) this.selectedElemId = null;
    if (selected) {
      const sel = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      sel.setAttribute('x', `${selected.x * this.cellSize + 2}`);
      sel.setAttribute('y', `${selected.y * this.cellSize + 2}`);
      sel.setAttribute('width', `${this.cellSize - 4}`);
      sel.setAttribute('height', `${this.cellSize - 4}`);
      sel.setAttribute('rx', '6');
      sel.setAttribute('fill', 'rgba(227, 179, 65, 0.08)');
      sel.setAttribute('stroke', '#e3b341');
      sel.setAttribute('stroke-width', '2.5');
      sel.style.pointerEvents = 'none';
      this.svg.appendChild(sel);
    }
    this.positionSelectionBar();
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
        const badgeW = Math.max(40, textLen * 6 + 12);
        const badgeH = 15;
        const badgeCenterY = 27;

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
        label.setAttribute('font-size', '9.5px');
        label.setAttribute('font-weight', 'bold');
        label.textContent = labelText;
        label.style.pointerEvents = 'none';
        labelGroup.appendChild(label);

        g.appendChild(labelGroup);

        // Im Editor übernimmt der zentrale Raster-Klick (Auswahl/Konfigurieren)
        if (!this.isEditMode) {
          g.style.cursor = 'pointer';
          g.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isRepeatClick(e) || !sig) return;
            const supported = getSignalSupportedAspects(sig);
            const currIdx = supported.indexOf(sig.aspect || 'HP0');
            const nextAspect = supported[(currIdx + 1) % supported.length];
            wsClient.send({
              type: 'SET_SIGNAL',
              payload: { signalId: sig.id, aspect: nextAspect }
            });
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
        // Etwas größer und höher als früher, damit das Block-Schild (Höhe 34) den Namen nicht verdeckt
        const sBadgeW = Math.max(40, sTextLen * 6 + 12);
        const sBadgeH = 15;
        const sBadgeCenterY = -27;

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
        label.setAttribute('font-size', '9.5px');
        label.setAttribute('font-weight', 'bold');
        label.textContent = sensorText;
        label.style.pointerEvents = 'none';
        sLabelGroup.appendChild(label);

        g.appendChild(sLabelGroup);

        if (!this.isEditMode && allowManualTrigger) {
          // Im Fahrbetrieb: Klickbar für Testbetrieb / Simulation
          g.style.cursor = 'pointer';

          // SVG Tooltip
          const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent = `Rückmelder "${sensorText}" (#${sensor?.address ?? '?'})\n• Klick: Test-Impuls auslösen (Überfahrt simulieren)\n• Shift+Klick: Dauerbelegung umschalten (Toggle)`;
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
            if (isRepeatClick(e) || !elem.linkedId) return;

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
    toLabel.setAttribute('font-size', '9.5px');
    toLabel.setAttribute('font-weight', 'bold');
    toLabel.textContent = to ? (to.name.length > 8 ? `W${to.address}` : to.name) : 'W';
    lanternGroup.appendChild(toLabel);

    // Klick auf die Laterne stellt die Weiche (nur Fahrbetrieb; im Editor übernimmt der Raster-Klick)
    if (!this.isEditMode) {
      lanternGroup.style.cursor = 'pointer';
      g.style.cursor = 'pointer';
      lanternGroup.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        // Doppelklick würde die Weiche hin- und sofort zurückstellen
        if (isRepeatClick(e) || !to) return;
        const nextState = to.state === 'STRAIGHT' ? 'DIVERGENT' : 'STRAIGHT';
        wsClient.send({ type: 'SET_TURNOUT', payload: { turnoutId: to.id, state: nextState } });
      });
    }
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
    // Lokbild: belegender Zug oder (bei Reservierung) der erwartete Zug
    const imageLoco = loco ?? (block.state === 'RESERVED' && block.reservedForLocoId
      ? wsClient.locos.find((l) => l.id === block.reservedForLocoId) ?? null
      : null);
    const imageSrc = locoImageSrc(imageLoco);
    const imageW = 40;
    const imageExtra = imageSrc ? imageW + 6 : 0;
    const dirArrow = block.direction === '+' ? '➔' : '⬅';
    const blockTitle = `${dirArrow} ${block.name}`;
    const locoTitle = loco ? `${loco.name || block.currentLocoId} (${loco.speed || 0})` : '';

    const hasTimer = !!block.waitTimer;
    // Dynamische Breite & Typografie berechnen, damit lange Namen perfekt reinpassen und nichts abgeschnitten wird
    const maxChars = Math.max(blockTitle.length, locoTitle.length);
    const calculatedWidth = Math.max(this.cellSize * 1.5, maxChars * 6.5 + 22);
    // Begrenzung, damit er nicht zu tief in Nachbarkacheln ragt (Bild bekommt eigenen Platz)
    const width = Math.min(this.cellSize * 1.85, calculatedWidth) + imageExtra;
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

    bg.style.cursor = 'pointer';
    if (!this.isEditMode) {
      bg.addEventListener('click', (e) => {
        if (blockLongPressTriggered) {
          blockLongPressTriggered = false;
          return;
        }
        e.stopPropagation();
        // Doppelklick würde Startblock wählen und gleich wieder abwählen
        if (isRepeatClick(e)) return;
        this.handleBlockClick(block);
      });
    }

    g.appendChild(bg);

    // Text Label mit Richtungspfeil (immer lesbar / nie auf dem Kopf)
    const blockLabelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    if (elem.rotation !== 0) {
      blockLabelGroup.setAttribute('transform', `rotate(${-elem.rotation}, 0, 0)`);
    }

    // Lokbild links im Badge (aufrecht, da in der gegenläufig rotierten Label-Gruppe)
    const textX = `${imageExtra / 2}`;
    if (imageSrc && imageLoco) {
      const clipId = `blk-img-clip-${block.id}`.replace(/[^A-Za-z0-9_-]/g, '_');
      // Bei 90°/270° liegt das Label quer zur Trägerplatte: am Text statt an der Plattenbreite ausrichten
      const imgX = elem.rotation % 180 === 0 ? -width / 2 + 4 : -(width - imageExtra) / 2 - imageExtra / 2 + 4;
      const imgY = -12;
      const clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
      clip.setAttribute('id', clipId);
      const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      clipRect.setAttribute('x', `${imgX}`);
      clipRect.setAttribute('y', `${imgY}`);
      clipRect.setAttribute('width', `${imageW}`);
      clipRect.setAttribute('height', '24');
      clipRect.setAttribute('rx', '4');
      clip.appendChild(clipRect);
      blockLabelGroup.appendChild(clip);

      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', imageSrc);
      img.setAttribute('x', `${imgX}`);
      img.setAttribute('y', `${imgY}`);
      img.setAttribute('width', `${imageW}`);
      img.setAttribute('height', '24');
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('clip-path', `url(#${clipId})`);
      if (!loco) img.setAttribute('opacity', '0.55'); // nur reserviert
      img.style.pointerEvents = 'none';
      const imgTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      imgTitle.textContent = imageLoco.name;
      img.appendChild(imgTitle);
      img.addEventListener('error', () => img.remove(), { once: true });
      blockLabelGroup.appendChild(img);
    }

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', textX);
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
      locoText.setAttribute('x', textX);
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
      timerText.setAttribute('x', textX);
      timerText.setAttribute('y', '17');
      timerText.setAttribute('text-anchor', 'middle');
      timerText.setAttribute('font-size', '9.5px');
      timerText.setAttribute('font-weight', '700');
      timerText.setAttribute('font-family', 'monospace');
      timerText.style.pointerEvents = 'none';

      if (block.waitTimer.status === 'WAITING') {
        const rem = Math.max(0, Math.ceil((block.waitTimer.departureTimestamp - Date.now()) / 1000));
        timerText.setAttribute('fill', '#e3b341');
        timerText.textContent = `Abfahrt in ${rem} s`;
      } else {
        timerText.setAttribute('fill', '#f85149');
        timerText.textContent = `Warten auf Ausfahrt`;
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
        showToast(`„${block.name}“ ist leer. Tippe zuerst einen Block mit Zug an.`, { tone: 'warn' });
      }
    } else {
      if (this.selectedStartBlockId === block.id) {
        this.selectedStartBlockId = null;
        this.updateHelperText();
        this.render();
        return;
      }

      if (block.state !== 'FREE') {
        showToast(`Zielblock „${block.name}“ ist belegt oder reserviert. Bitte ein freies Gleis wählen.`, { tone: 'warn' });
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

    const dangerBtn = (title: string, sub: string) => `
        <button type="button" id="ctx-btn-free-block" class="ctx-menu-item danger" data-confirm-title="Wirklich freigeben? Nochmal klicken">
          <span class="ctx-item-icon">${iconTrash(16)}</span>
          <span class="ctx-item-text">
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(sub)}</small>
          </span>
        </button>`;

    if (currentLoco) {
      const photo = locoImageSrc(currentLoco);
      statusHtml = `
        <div class="ctx-block-status occupied">
          ${photo ? `<img class="ctx-loco-photo" src="${escapeAttr(photo)}" alt="${escapeAttr(currentLoco.name)}" width="64" height="36">` : `<span class="status-indicator">${iconLocos(18)}</span>`}
          <div class="status-details">
            <div class="status-label">Belegt von</div>
            <div class="status-loco-name">${escapeHtml(currentLoco.name)} <span class="loco-dcc">#${currentLoco.dccAddress}</span></div>
          </div>
        </div>
      `;
      actionButtons += dangerBtn('Block freigeben', `Zug „${currentLoco.name}“ vom Gleis nehmen`);
    } else if (reservedLoco || block.state === 'RESERVED') {
      statusHtml = `
        <div class="ctx-block-status reserved">
          <span class="status-indicator">${iconDot('#d29922', 9)}</span>
          <div class="status-details">
            <div class="status-label">Fahrstraße reserviert</div>
            <div class="status-loco-name">${reservedLoco ? `${escapeHtml(reservedLoco.name)} <span class="loco-dcc">#${reservedLoco.dccAddress}</span>` : 'Reserviert für Fahrstraße'}</div>
          </div>
        </div>
      `;
      actionButtons += dangerBtn('Reservierung aufheben', 'Fahrstraße stornieren, Gleis wird frei');
    } else if (block.state === 'GHOST') {
      statusHtml = `
        <div class="ctx-block-status ghost">
          <span class="status-indicator">${iconAlert(18, '#f85149')}</span>
          <div class="status-details">
            <div class="status-label">Geisterzug-Alarm</div>
            <div class="status-loco-name">Melder ohne angemeldeten Zug ausgelöst</div>
          </div>
        </div>
      `;
      actionButtons += dangerBtn('Alarm quittieren und freigeben', 'Block zurücksetzen');
    } else if (block.state === 'OCCUPIED') {
      statusHtml = `
        <div class="ctx-block-status occupied">
          <span class="status-indicator">${iconDot('#f85149', 9)}</span>
          <div class="status-details">
            <div class="status-label">Belegt (kein Zug zugewiesen)</div>
            <div class="status-loco-name">Rückmelder meldet belegt</div>
          </div>
        </div>
      `;
      actionButtons += dangerBtn('Block freigeben', 'Gleis auf „frei“ setzen');
    } else {
      statusHtml = `
        <div class="ctx-block-status free">
          <span class="status-indicator">${iconDot('#3fb950', 9)}</span>
          <div class="status-details">
            <div class="status-label">Gleis frei</div>
            <div class="status-loco-name">Bereit für einen Zug</div>
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
            <span>${block.waitTimer.status === 'WAITING' ? 'Planmäßiger Halt (Wartezeit)' : 'Ausfahrt blockiert'}</span>
          </div>
          <div class="ctx-timer-value" id="ctx-timer-countdown" data-block-id="${escapeAttr(block.id)}">
            ${block.waitTimer.status === 'WAITING'
              ? `Noch <strong>${rem} s</strong> bis zur Abfahrt (von ${block.waitTimer.totalWaitSec} s)`
              : 'Wartezeit abgelaufen. Signal oder Zielblock ist noch belegt.'}
          </div>
        </div>
      `;

      actionButtons = `
        <button type="button" id="ctx-btn-dispatch-now" class="ctx-menu-item primary">
          <span class="ctx-item-icon">${iconRoutes(16)}</span>
          <span class="ctx-item-text">
            <strong>Sofort abfahren</strong>
            <small>${block.waitTimer.status === 'WAITING' ? 'Wartezeit überspringen und Fahrstraße stellen' : 'Ausfahrt erneut anfordern'}</small>
          </span>
        </button>
      ` + actionButtons;
    }

    // Quick-Zuweisung: Loks aus dem Depot (aufsetzen bzw. tauschen)
    const depotLocos = wsClient.locos.filter((l) => !l.currentBlockId && l.id !== currentLoco?.id);
    if (depotLocos.length > 0) {
      actionButtons += `
        <div class="ctx-menu-group">
          <div class="ctx-group-title">${currentLoco ? 'Zug tauschen gegen' : 'Zug aus dem Depot aufsetzen'}</div>
          <div class="ctx-quick-locos">
            ${depotLocos.map((l) => `
              <button type="button" class="ctx-btn-quick-assign" data-loco-id="${escapeAttr(l.id)}" title="${escapeAttr(l.name)}">
                <span class="ctx-quick-icon">${iconLocos(14)}</span>
                <span class="ctx-quick-name">${escapeHtml(l.name)}</span>
                <span class="loco-dcc">#${l.dccAddress}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    const STATE_LABEL: Record<string, string> = {
      FREE: 'Frei', OCCUPIED: 'Belegt', RESERVED: 'Reserviert', GHOST: 'Alarm'
    };

    menu.innerHTML = `
      <div class="ctx-menu-header">
        <div class="ctx-header-title">
          <span class="ctx-header-name">${escapeHtml(block.name)}</span>
        </div>
        <span class="ctx-header-badge ${block.state.toLowerCase()}">${STATE_LABEL[block.state] || block.state}</span>
        <button type="button" class="ctx-close" id="ctx-btn-close" aria-label="Schließen" title="Schließen (Esc)">✕</button>
      </div>

      <div class="ctx-menu-body">
        ${statusHtml}
        <div class="ctx-menu-actions">
          ${actionButtons}
          <button type="button" id="ctx-btn-configure-block" class="ctx-menu-item">
            <span class="ctx-item-icon">${iconSettings(16)}</span>
            <span class="ctx-item-text">
              <strong>Block einstellen …</strong>
              <small>Länge, Richtung, Rückmelder</small>
            </span>
          </button>
        </div>
      </div>
    `;

    // Event Handlers (Mehrfachklick löst jede Aktion nur einmal aus)
    const once = (fn: () => void) => (e: MouseEvent) => {
      if (isRepeatClick(e)) return;
      fn();
    };

    document.getElementById('ctx-btn-close')?.addEventListener('click', () => this.hideBlockContextMenu());

    document.getElementById('ctx-btn-dispatch-now')?.addEventListener('click', once(() => {
      wsClient.send({ type: 'DISPATCH_BLOCK_NOW', payload: { blockId: block.id } });
      this.hideBlockContextMenu();
    }));

    // Freigeben braucht zwei Klicks: der erste macht den Knopf rot, der zweite führt aus
    const freeBtn = document.getElementById('ctx-btn-free-block') as HTMLButtonElement | null;
    if (freeBtn) {
      let armedAt = 0;
      let disarmTimer: number | null = null;
      const label = freeBtn.querySelector('strong');
      const original = label?.textContent || '';
      freeBtn.addEventListener('click', (e) => {
        if (isRepeatClick(e)) return;
        const now = Date.now();
        // Zweiter Klick zählt erst nach kurzer Pause – ein Doppelklick bestätigt also nicht versehentlich
        if (armedAt && now - armedAt > 350) {
          if (disarmTimer) window.clearTimeout(disarmTimer);
          wsClient.send({ type: 'FREE_BLOCK', payload: { blockId: block.id } });
          this.hideBlockContextMenu();
          showToast(`Block „${block.name}“ freigegeben.`);
          return;
        }
        if (armedAt) return;
        armedAt = now;
        freeBtn.classList.add('armed');
        if (label) label.textContent = 'Wirklich? Zum Bestätigen nochmal klicken';
        disarmTimer = window.setTimeout(() => {
          armedAt = 0;
          freeBtn.classList.remove('armed');
          if (label) label.textContent = original;
        }, 4000);
      });
    }

    document.getElementById('ctx-btn-configure-block')?.addEventListener('click', once(() => {
      this.hideBlockContextMenu();
      this.openBlockModal(block.id);
    }));

    menu.querySelectorAll<HTMLButtonElement>('.ctx-btn-quick-assign').forEach((btn) => {
      btn.addEventListener('click', once(() => {
        const locoId = btn.dataset.locoId;
        if (locoId) {
          wsClient.send({
            type: 'ASSIGN_LOCO_TO_BLOCK',
            payload: { locoId, blockId: block.id }
          });
        }
        this.hideBlockContextMenu();
      }));
    });

    // Menü NEBEN den Block legen (nicht darüber), innerhalb des Fensters halten
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';
    const menuWidth = menu.offsetWidth || 300;
    const menuHeight = menu.offsetHeight || 220;
    const margin = 12;

    const badge = this.svg.querySelector<SVGGElement>(`g[data-block-id="${CSS.escape(block.id)}"]`);
    const anchor = badge?.getBoundingClientRect() ?? new DOMRect(clientX, clientY, 0, 0);

    let posX = anchor.right + 10;
    if (posX + menuWidth > window.innerWidth - margin) {
      posX = anchor.left - menuWidth - 10; // links vom Block
    }
    if (posX < margin) {
      // Weder rechts noch links Platz (Handy): unter bzw. über den Block
      posX = Math.max(margin, Math.min(window.innerWidth - menuWidth - margin, clientX - menuWidth / 2));
    }
    let posY = posX === anchor.right + 10 || posX === anchor.left - menuWidth - 10
      ? anchor.top - 8
      : anchor.bottom + 10;
    if (posY + menuHeight > window.innerHeight - margin) {
      posY = Math.max(margin, window.innerHeight - menuHeight - margin);
    }

    menu.style.left = `${Math.max(margin, posX)}px`;
    menu.style.top = `${Math.max(margin, posY)}px`;
    menu.style.visibility = '';
    this.contextMenuOpenedAt = Date.now();
  }

  private contextMenuOpenedAt = 0;

  /** Kurz nach dem Öffnen (lang drücken auf Touch) feuert der Browser noch einen Klick – der darf das Menü nicht schließen. */
  public isContextMenuJustOpened(): boolean {
    return Date.now() - this.contextMenuOpenedAt < 450;
  }

  public hideBlockContextMenu(): void {
    const menu = document.getElementById('block-context-menu');
    if (menu) {
      menu.style.display = 'none';
    }
  }
}
