import { Locomotive } from '../types.js';
import { wsClient } from '../wsClient.js';
import { iconEdit, iconLocos, iconPlus } from '../icons.js';
import { t } from '../i18n.js';

export let activeLocoId: string | null = null;

export function getActiveLoco(): Locomotive | null {
  if (!wsClient.locos || wsClient.locos.length === 0) return null;
  const found = wsClient.locos.find((l) => l.id === activeLocoId);
  return found || wsClient.locos[0];
}

export function setActiveLocoId(id: string | null): void {
  activeLocoId = id;
  wsClient.notify();
}

export function cycleActiveLoco(): void {
  if (!wsClient.locos || wsClient.locos.length === 0) return;
  const curIdx = wsClient.locos.findIndex((l) => l.id === activeLocoId);
  const nextIdx = (curIdx + 1) % wsClient.locos.length;
  activeLocoId = wsClient.locos[nextIdx].id;
  wsClient.notify();
}

interface LocoCardRef {
  card: HTMLElement;
  locoId: string;
  nameEl: HTMLElement;
  activeBadgeEl: HTMLElement;
  metaEl: HTMLElement;
  dccAddrEl: HTMLElement;
  speedNumEl: HTMLElement;
  sliderEl: HTMLInputElement;
  fwdBtn: HTMLButtonElement;
  revBtn: HTMLButtonElement;
  fnBox: HTMLElement;
  fnBtns: Map<number, HTMLButtonElement>;
  presetBtns: HTMLButtonElement[];
  isDragging: boolean;
  pendingSpeed: number | null;
  throttleTimer: number | null;
}

export class Throttle {
  private container: HTMLElement;
  private modal: HTMLElement | null = null;
  private modalTitle: HTMLElement | null = null;
  private formLoco: HTMLFormElement | null = null;
  private editIdInput: HTMLInputElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private addressInput: HTMLInputElement | null = null;
  private typeSelect: HTMLSelectElement | null = null;
  private vMinInput: HTMLInputElement | null = null;
  private vMidInput: HTMLInputElement | null = null;
  private vMaxInput: HTMLInputElement | null = null;
  private lengthInput: HTMLInputElement | null = null;
  private btnModalDelete: HTMLButtonElement | null = null;

  // Cache für DOM-Referenzen jeder Lokkarte (Performance & kein Flackern bei Slider-Bedienung)
  private cards: Map<string, LocoCardRef> = new Map();

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init(): void {
    this.initModal();

    wsClient.subscribe(() => {
      this.render();
    });

    this.render();
  }

  private initModal(): void {
    this.modal = document.getElementById('loco-modal');
    this.modalTitle = document.getElementById('modal-loco-title') || document.getElementById('loco-modal-title');
    this.formLoco = document.getElementById('form-loco') as HTMLFormElement | null;
    this.editIdInput = (document.getElementById('loco-edit-id') || document.getElementById('edit-loco-id')) as HTMLInputElement | null;
    this.nameInput = (document.getElementById('loco-form-name') || document.getElementById('loco-name')) as HTMLInputElement | null;
    this.addressInput = (document.getElementById('loco-form-address') || document.getElementById('loco-address')) as HTMLInputElement | null;
    this.typeSelect = (document.getElementById('loco-form-type') || document.getElementById('loco-type')) as HTMLSelectElement | null;
    this.vMinInput = (document.getElementById('loco-form-vmin') || document.getElementById('loco-vmin')) as HTMLInputElement | null;
    this.vMidInput = (document.getElementById('loco-form-vmid') || document.getElementById('loco-vmid')) as HTMLInputElement | null;
    this.vMaxInput = (document.getElementById('loco-form-vmax') || document.getElementById('loco-vmax')) as HTMLInputElement | null;
    this.lengthInput = (document.getElementById('loco-form-length') || document.getElementById('loco-length')) as HTMLInputElement | null;
    this.btnModalDelete = (document.getElementById('btn-modal-delete') || document.getElementById('btn-loco-modal-delete')) as HTMLButtonElement | null;

    const btnAdd = document.getElementById('btn-add-loco');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => this.openCreateModal());
    }

    const btnClose = document.getElementById('btn-modal-close') || document.getElementById('btn-loco-close');
    const btnCancel = document.getElementById('btn-modal-cancel') || document.getElementById('btn-loco-cancel');

    const closeModal = () => {
      if (this.modal) this.modal.style.display = 'none';
    };

    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) closeModal();
    });

    // Formular absenden (Speichern)
    this.formLoco?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveLocoFromForm();
      closeModal();
    });

    // Löschen
    this.btnModalDelete?.addEventListener('click', () => {
      const id = this.editIdInput?.value;
      if (id && confirm('Möchtest du diese Lokomotive wirklich aus der Datenbank löschen?')) {
        wsClient.send({
          type: 'DELETE_LOCO',
          payload: { locoId: id }
        });
        closeModal();
      }
    });
  }

  public openCreateModal(): void {
    if (!this.modal) return;
    if (this.modalTitle) this.modalTitle.innerHTML = `${iconPlus(18)} <span>Neue Lokomotive anlegen</span>`;
    if (this.btnModalDelete) this.btnModalDelete.style.display = 'none';
    if (this.editIdInput) this.editIdInput.value = '';

    if (this.nameInput) this.nameInput.value = '';
    if (this.addressInput) this.addressInput.value = '3';
    if (this.typeSelect) this.typeSelect.value = 'PASSENGER';
    if (this.vMinInput) this.vMinInput.value = '10';
    if (this.vMidInput) this.vMidInput.value = '50';
    if (this.vMaxInput) this.vMaxInput.value = '100';
    if (this.lengthInput) this.lengthInput.value = '25';

    this.modal.style.display = 'flex';
    this.nameInput?.focus();
  }

  public openEditModal(loco: Locomotive): void {
    if (!this.modal) return;
    if (this.modalTitle) this.modalTitle.innerHTML = `${iconEdit(18)} <span>${loco.name} bearbeiten</span>`;
    if (this.btnModalDelete) this.btnModalDelete.style.display = 'block';
    if (this.editIdInput) this.editIdInput.value = loco.id;

    if (this.nameInput) this.nameInput.value = loco.name;
    if (this.addressInput) this.addressInput.value = `${loco.dccAddress}`;
    if (this.typeSelect) this.typeSelect.value = loco.trainType;
    if (this.vMinInput) this.vMinInput.value = `${loco.vMin || 10}`;
    if (this.vMidInput) this.vMidInput.value = `${loco.vMid || 50}`;
    if (this.vMaxInput) this.vMaxInput.value = `${loco.vMax || 100}`;
    if (this.lengthInput) this.lengthInput.value = `${loco.lengthCm || 25}`;

    this.modal.style.display = 'flex';
    this.nameInput?.focus();
  }

  private saveLocoFromForm(): void {
    const editId = this.editIdInput?.value;
    const name = this.nameInput?.value.trim() || 'Neue Lok';
    const dccAddress = parseInt(this.addressInput?.value || '3', 10);
    const trainType = (this.typeSelect?.value as any) || 'PASSENGER';
    const vMin = parseInt(this.vMinInput?.value || '10', 10);
    const vMid = parseInt(this.vMidInput?.value || '50', 10);
    const vMax = parseInt(this.vMaxInput?.value || '100', 10);
    const lengthCm = parseInt(this.lengthInput?.value || '25', 10);

    if (editId) {
      // Vorhandene Lok bearbeiten
      const existing = wsClient.locos.find((l) => l.id === editId);
      if (existing) {
        const updatedLoco: Locomotive = {
          ...existing,
          name,
          dccAddress,
          trainType,
          vMin,
          vMid,
          vMax,
          lengthCm
        };
        wsClient.send({
          type: 'UPDATE_LOCO',
          payload: updatedLoco
        });
      }
    } else {
      // Neue Lokomotive anlegen
      const newLoco: Locomotive = {
        id: `loco-${Date.now()}`,
        name,
        dccAddress,
        speed: 0,
        targetSpeed: 0,
        direction: 'FWD',
        functions: { 0: false, 1: false, 2: false, 3: false },
        vMin,
        vMid,
        vMax,
        lengthCm,
        trainType,
        currentBlockId: null
      };
      wsClient.send({
        type: 'CREATE_LOCO',
        payload: newLoco
      });
    }
  }

  private sendSpeed(locoId: string, speed: number, direction?: 'FWD' | 'REV'): void {
    wsClient.send({
      type: 'SET_LOCO_SPEED',
      payload: { locoId, speed, ...(direction ? { direction } : {}) }
    });
  }

  public render(): void {
    if (wsClient.locos.length === 0) {
      this.cards.forEach((ref) => {
        if (ref.throttleTimer !== null) window.clearTimeout(ref.throttleTimer);
      });
      this.cards.clear();
      this.container.innerHTML = `
        <div style="color:#8b949e;text-align:center;padding:40px;width:100%;">
          <div style="margin-bottom:12px;color:#58a6ff;">${iconLocos(36)}</div>
          <h3>${t('throttle.empty_title')}</h3>
          <p style="margin-top:8px;">${t('throttle.empty_desc')}</p>
        </div>
      `;
      return;
    }

    // Falls die Leer-Meldung vorher da war, leeren
    const emptyPlaceholder = this.container.querySelector('div h3');
    if (emptyPlaceholder) {
      this.container.innerHTML = '';
    }

    // Gelöschte Loks entfernen
    const currentIds = new Set(wsClient.locos.map((l) => l.id));
    for (const [id, ref] of this.cards.entries()) {
      if (!currentIds.has(id)) {
        if (ref.throttleTimer !== null) window.clearTimeout(ref.throttleTimer);
        ref.card.remove();
        this.cards.delete(id);
      }
    }

    // In-place aktualisieren oder neue Karten erzeugen (in geordneter Reihenfolge)
    for (const loco of wsClient.locos) {
      let ref = this.cards.get(loco.id);
      if (!ref) {
        ref = this.createLocoCard(loco);
        this.cards.set(loco.id, ref);
        this.container.appendChild(ref.card);
      } else {
        this.updateLocoCard(ref, loco);
      }
    }
  }

  private createLocoCard(loco: Locomotive): LocoCardRef {
    const card = document.createElement('div');
    const isActive = getActiveLoco()?.id === loco.id;
    card.className = `throttle-card ${isActive ? 'active-throttle' : ''}`;
    card.dataset.locoId = loco.id;
    if (isActive) {
      card.style.borderColor = '#3b82f6';
      card.style.boxShadow = '0 0 16px rgba(59, 130, 246, 0.4)';
    }

    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
      setActiveLocoId(loco.id);
    });

    // Header mit Name, Typ, DCC-Adresse und Bearbeiten-Stift
    const header = document.createElement('div');
    header.className = 'throttle-header';

    const headerLeft = document.createElement('div');
    const nameEl = document.createElement('div');
    nameEl.className = 'loco-name';
    nameEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="color:#58a6ff;">${iconLocos(18)}</span> <span>${loco.name}</span></span>`;

    const activeBadgeEl = document.createElement('span');
    activeBadgeEl.style.cssText = 'background:#2563eb;color:#fff;font-size:10px;font-weight:bold;padding:2px 8px;border-radius:10px;margin-left:8px;vertical-align:middle;';
    activeBadgeEl.textContent = t('throttle.active');
    activeBadgeEl.style.display = isActive ? 'inline-block' : 'none';
    nameEl.appendChild(activeBadgeEl);

    const metaEl = document.createElement('span');
    metaEl.style.cssText = 'font-size:12px;color:#8b949e;';
    metaEl.textContent = `${t('throttle.type')}: ${loco.trainType} • ${t('throttle.length')}: ${loco.lengthCm}cm`;

    headerLeft.appendChild(nameEl);
    headerLeft.appendChild(metaEl);

    const headerRight = document.createElement('div');
    headerRight.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const dccAddrEl = document.createElement('div');
    dccAddrEl.className = 'dcc-addr-tag';
    dccAddrEl.textContent = `DCC #${loco.dccAddress}`;

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-icon btn-edit-loco';
    btnEdit.title = t('throttle.edit_tooltip');
    btnEdit.style.cssText = 'cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:4px;';
    btnEdit.innerHTML = iconEdit(15);
    btnEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = wsClient.locos.find((l) => l.id === loco.id) || loco;
      this.openEditModal(current);
    });

    headerRight.appendChild(dccAddrEl);
    headerRight.appendChild(btnEdit);

    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    card.appendChild(header);

    // Speed Display
    const speedDisplay = document.createElement('div');
    speedDisplay.className = 'throttle-speed-display';

    const speedNumEl = document.createElement('div');
    speedNumEl.className = 'speed-number';
    speedNumEl.id = `speed-num-${loco.id}`;
    speedNumEl.textContent = `${loco.speed}`;

    const speedUnit = document.createElement('div');
    speedUnit.className = 'speed-unit';
    speedUnit.textContent = t('throttle.speed_step');

    speedDisplay.appendChild(speedNumEl);
    speedDisplay.appendChild(speedUnit);
    card.appendChild(speedDisplay);

    // Slider Box
    const sliderBox = document.createElement('div');
    sliderBox.className = 'throttle-slider-box';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '128';
    slider.value = `${loco.speed}`;
    slider.className = 'speed-slider';
    slider.setAttribute('aria-label', `${t('throttle.speed_label')} ${loco.name}`);

    const ref: LocoCardRef = {
      card,
      locoId: loco.id,
      nameEl,
      activeBadgeEl,
      metaEl,
      dccAddrEl,
      speedNumEl,
      sliderEl: slider,
      fwdBtn: null as any,
      revBtn: null as any,
      fnBox: null as any,
      fnBtns: new Map(),
      presetBtns: [],
      isDragging: false,
      pendingSpeed: null,
      throttleTimer: null
    };

    // Pointer-Capture für flüssiges Draggen ohne Hängenbleiben
    const handlePointerStart = (e: PointerEvent) => {
      ref.isDragging = true;
      slider.classList.add('dragging');
      try {
        slider.setPointerCapture(e.pointerId);
      } catch {}
    };

    const handlePointerEnd = (e: PointerEvent) => {
      ref.isDragging = false;
      slider.classList.remove('dragging');
      try {
        if (slider.hasPointerCapture(e.pointerId)) {
          slider.releasePointerCapture(e.pointerId);
        }
      } catch {}
      if (ref.throttleTimer !== null) {
        window.clearTimeout(ref.throttleTimer);
        ref.throttleTimer = null;
      }
      const finalVal = parseInt(slider.value, 10);
      ref.pendingSpeed = null;
      this.sendSpeed(loco.id, finalVal);
    };

    slider.addEventListener('pointerdown', handlePointerStart);
    slider.addEventListener('pointerup', handlePointerEnd);
    slider.addEventListener('pointercancel', handlePointerEnd);

    // Sofortige visuelle Rückmeldung + gedrosselte WebSocket-Übertragung (25 Updates/s)
    slider.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      speedNumEl.textContent = `${val}`;
      ref.pendingSpeed = val;

      if (ref.throttleTimer === null) {
        this.sendSpeed(loco.id, val);
        ref.throttleTimer = window.setTimeout(() => {
          ref.throttleTimer = null;
          if (ref.pendingSpeed !== null && ref.pendingSpeed !== val) {
            this.sendSpeed(loco.id, ref.pendingSpeed);
          }
        }, 40);
      }
    });

    slider.addEventListener('change', () => {
      const val = parseInt(slider.value, 10);
      speedNumEl.textContent = `${val}`;
      this.sendSpeed(loco.id, val);
    });

    sliderBox.appendChild(slider);

    // Speed Presets
    const presets = document.createElement('div');
    presets.className = 'preset-buttons';
    const presetValues = [
      { label: t('throttle.preset_stop'), val: 0 },
      { label: t('throttle.preset_shunt'), val: loco.vMin || 12 },
      { label: t('throttle.preset_cruise'), val: loco.vMid || 55 },
      { label: t('throttle.preset_fast'), val: 85 },
      { label: t('throttle.preset_vmax'), val: loco.vMax || 105 }
    ];

    for (const p of presetValues) {
      const btn = document.createElement('button');
      btn.className = `preset-btn ${p.val === 0 ? 'stop' : ''}`;
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(p.val === 0 ? 35 : 15);
        slider.value = `${p.val}`;
        speedNumEl.textContent = `${p.val}`;
        this.sendSpeed(loco.id, p.val);
      });
      presets.appendChild(btn);
      ref.presetBtns.push(btn);
    }
    sliderBox.appendChild(presets);
    card.appendChild(sliderBox);

    // Direction Controls
    const dirBox = document.createElement('div');
    dirBox.className = 'dir-controls';

    const fwdBtn = document.createElement('button');
    fwdBtn.className = `dir-btn ${loco.direction === 'FWD' ? 'active' : ''}`;
    fwdBtn.innerHTML = t('throttle.direction_fwd');
    fwdBtn.addEventListener('click', () => {
      if (navigator.vibrate) navigator.vibrate(20);
      const current = wsClient.locos.find((l) => l.id === loco.id) || loco;
      this.sendSpeed(loco.id, current.speed, 'FWD');
    });

    const revBtn = document.createElement('button');
    revBtn.className = `dir-btn ${loco.direction === 'REV' ? 'active' : ''}`;
    revBtn.innerHTML = t('throttle.direction_rev');
    revBtn.addEventListener('click', () => {
      if (navigator.vibrate) navigator.vibrate(20);
      const current = wsClient.locos.find((l) => l.id === loco.id) || loco;
      this.sendSpeed(loco.id, current.speed, 'REV');
    });

    dirBox.appendChild(fwdBtn);
    dirBox.appendChild(revBtn);
    card.appendChild(dirBox);

    ref.fwdBtn = fwdBtn;
    ref.revBtn = revBtn;

    // Functions Grid (Dynamisch für alle definierten Funktionen F0 - F28)
    const fnBox = document.createElement('div');
    fnBox.className = 'functions-grid';

    const defaultLabels: Record<number, string> = {
      0: '💡 F0 Licht',
      1: '🔊 F1 Sound',
      2: '🎺 F2 Horn',
      3: '🐢 F3 Rangier',
      4: '🔗 F4 Kuppl.',
      5: '💨 F5 Rauch',
      6: '🔔 F6 Glocke',
      7: '🔇 F7 Mute'
    };

    const labelsToUse = loco.functionLabels || defaultLabels;
    const functionIndices = Object.keys(labelsToUse).map((k) => parseInt(k, 10)).sort((a, b) => a - b);

    for (const f of functionIndices) {
      const active = !!loco.functions[f];
      const fnBtn = document.createElement('button');
      fnBtn.className = `fn-btn ${active ? 'active' : ''}`;
      fnBtn.textContent = labelsToUse[f] || `F${f}`;
      fnBtn.title = labelsToUse[f] || `F${f}`;
      fnBtn.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(15);
        const currentLoco = wsClient.locos.find((l) => l.id === loco.id) || loco;
        const curActive = !!currentLoco.functions[f];
        wsClient.send({
          type: 'SET_LOCO_FUNCTION',
          payload: { locoId: loco.id, functionIndex: f, active: !curActive }
        });
      });
      fnBox.appendChild(fnBtn);
      ref.fnBtns.set(f, fnBtn);
    }
    card.appendChild(fnBox);
    ref.fnBox = fnBox;

    return ref;
  }

  private updateLocoCard(ref: LocoCardRef, loco: Locomotive): void {
    const isActive = getActiveLoco()?.id === loco.id;

    // Aktiver Status
    ref.card.classList.toggle('active-throttle', isActive);
    if (isActive) {
      ref.card.style.borderColor = '#3b82f6';
      ref.card.style.boxShadow = '0 0 16px rgba(59, 130, 246, 0.4)';
    } else {
      ref.card.style.borderColor = '';
      ref.card.style.boxShadow = '';
    }
    ref.activeBadgeEl.style.display = isActive ? 'inline-block' : 'none';

    // Textfelder
    const nameSpan = ref.nameEl.querySelector('span span:last-child');
    if (nameSpan) {
      nameSpan.textContent = loco.name;
    } else {
      ref.nameEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="color:#58a6ff;">${iconLocos(18)}</span> <span>${loco.name}</span></span>`;
      ref.nameEl.appendChild(ref.activeBadgeEl);
    }
    ref.metaEl.textContent = `Typ: ${loco.trainType} • Länge: ${loco.lengthCm}cm`;
    ref.dccAddrEl.textContent = `DCC #${loco.dccAddress}`;

    // Geschwindigkeits-Slider: NUR aktualisieren, wenn der Nutzer NICHT gerade draggt!
    if (!ref.isDragging) {
      ref.sliderEl.value = `${loco.speed}`;
      ref.speedNumEl.textContent = `${loco.speed}`;
    }

    // Richtungs-Buttons
    ref.fwdBtn.classList.toggle('active', loco.direction === 'FWD');
    ref.revBtn.classList.toggle('active', loco.direction === 'REV');

    // Funktions-Buttons
    for (const [f, btn] of ref.fnBtns.entries()) {
      btn.classList.toggle('active', !!loco.functions[f]);
    }
  }
}
