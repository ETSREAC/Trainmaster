import { Locomotive } from '../types.js';
import { wsClient } from '../wsClient.js';

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

export class Throttle {
  private container: HTMLElement;

  // Modal Elemente
  private modal: HTMLElement | null = null;
  private formLoco: HTMLFormElement | null = null;
  private editIdInput: HTMLInputElement | null = null;
  private modalTitle: HTMLElement | null = null;
  private btnModalDelete: HTMLButtonElement | null = null;
  private btnModalClose: HTMLButtonElement | null = null;
  private btnModalCancel: HTMLButtonElement | null = null;

  private nameInput: HTMLInputElement | null = null;
  private addressInput: HTMLInputElement | null = null;
  private typeSelect: HTMLSelectElement | null = null;
  private vMinInput: HTMLInputElement | null = null;
  private vMidInput: HTMLInputElement | null = null;
  private vMaxInput: HTMLInputElement | null = null;
  private lengthInput: HTMLInputElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.initModalElements();
    this.init();
  }

  private initModalElements(): void {
    this.modal = document.getElementById('loco-modal');
    this.formLoco = document.getElementById('form-loco') as HTMLFormElement;
    this.editIdInput = document.getElementById('loco-edit-id') as HTMLInputElement;
    this.modalTitle = document.getElementById('modal-loco-title');
    this.btnModalDelete = document.getElementById('btn-modal-delete') as HTMLButtonElement;
    this.btnModalClose = document.getElementById('btn-modal-close') as HTMLButtonElement;
    this.btnModalCancel = document.getElementById('btn-modal-cancel') as HTMLButtonElement;

    this.nameInput = document.getElementById('loco-form-name') as HTMLInputElement;
    this.addressInput = document.getElementById('loco-form-address') as HTMLInputElement;
    this.typeSelect = document.getElementById('loco-form-type') as HTMLSelectElement;
    this.vMinInput = document.getElementById('loco-form-vmin') as HTMLInputElement;
    this.vMidInput = document.getElementById('loco-form-vmid') as HTMLInputElement;
    this.vMaxInput = document.getElementById('loco-form-vmax') as HTMLInputElement;
    this.lengthInput = document.getElementById('loco-form-length') as HTMLInputElement;

    // "➕ Neuen Zug anlegen" Button
    document.getElementById('btn-add-loco')?.addEventListener('click', () => {
      this.openCreateModal();
    });

    // Modal Schließen
    const closeModal = () => {
      if (this.modal) this.modal.style.display = 'none';
    };

    this.btnModalClose?.addEventListener('click', closeModal);
    this.btnModalCancel?.addEventListener('click', closeModal);
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

  private openCreateModal(): void {
    if (!this.modal) return;
    if (this.editIdInput) this.editIdInput.value = '';
    if (this.modalTitle) this.modalTitle.textContent = '🚂 Neue Lokomotive anlegen';
    if (this.btnModalDelete) this.btnModalDelete.style.display = 'none';

    if (this.nameInput) this.nameInput.value = '';
    if (this.addressInput) this.addressInput.value = '3';
    if (this.typeSelect) this.typeSelect.value = 'PASSENGER';
    if (this.vMinInput) this.vMinInput.value = '12';
    if (this.vMidInput) this.vMidInput.value = '55';
    if (this.vMaxInput) this.vMaxInput.value = '105';
    if (this.lengthInput) this.lengthInput.value = '20';

    this.modal.style.display = 'flex';
    this.nameInput?.focus();
  }

  private openEditModal(loco: Locomotive): void {
    if (!this.modal) return;
    if (this.editIdInput) this.editIdInput.value = loco.id;
    if (this.modalTitle) this.modalTitle.textContent = `🚂 Lokomotive "${loco.name}" bearbeiten`;
    if (this.btnModalDelete) this.btnModalDelete.style.display = 'block';

    if (this.nameInput) this.nameInput.value = loco.name;
    if (this.addressInput) this.addressInput.value = `${loco.dccAddress}`;
    if (this.typeSelect) this.typeSelect.value = loco.trainType;
    if (this.vMinInput) this.vMinInput.value = `${loco.vMin || 12}`;
    if (this.vMidInput) this.vMidInput.value = `${loco.vMid || 55}`;
    if (this.vMaxInput) this.vMaxInput.value = `${loco.vMax || 105}`;
    if (this.lengthInput) this.lengthInput.value = `${loco.lengthCm || 20}`;

    this.modal.style.display = 'flex';
    this.nameInput?.focus();
  }

  private saveLocoFromForm(): void {
    const editId = this.editIdInput?.value;
    const name = this.nameInput?.value.trim() || 'Unbenannte Lok';
    const dccAddress = parseInt(this.addressInput?.value || '3', 10);
    const trainType = (this.typeSelect?.value || 'PASSENGER') as any;
    const vMin = parseInt(this.vMinInput?.value || '12', 10);
    const vMid = parseInt(this.vMidInput?.value || '55', 10);
    const vMax = parseInt(this.vMaxInput?.value || '105', 10);
    const lengthCm = parseFloat(this.lengthInput?.value || '20');

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

  private init(): void {
    wsClient.subscribe(() => this.render());
    this.render();
  }

  public render(): void {
    this.container.innerHTML = '';

    if (wsClient.locos.length === 0) {
      this.container.innerHTML = `
        <div style="color:#8b949e;text-align:center;padding:40px;width:100%;">
          <h3>Noch keine Züge im Fuhrpark vorhanden</h3>
          <p style="margin-top:8px;">Klicke oben auf <strong>"➕ Neuen Zug anlegen"</strong>, um deine erste Lokomotive mit DCC-Adresse anzulegen.</p>
        </div>
      `;
      return;
    }

    for (const loco of wsClient.locos) {
      const card = this.createLocoCard(loco);
      this.container.appendChild(card);
    }
  }

  private createLocoCard(loco: Locomotive): HTMLElement {
    const card = document.createElement('div');
    const isActive = getActiveLoco()?.id === loco.id;
    card.className = `throttle-card ${isActive ? 'active-throttle' : ''}`;
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
    header.innerHTML = `
      <div>
        <div class="loco-name">
          🚂 ${loco.name}
          ${isActive ? '<span style="background:#2563eb;color:#fff;font-size:10px;font-weight:bold;padding:2px 8px;border-radius:10px;margin-left:8px;vertical-align:middle;">⭐ AKTIV</span>' : ''}
        </div>
        <span style="font-size:12px;color:#8b949e;">Typ: ${loco.trainType} • Länge: ${loco.lengthCm}cm</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <div class="dcc-addr-tag">DCC #${loco.dccAddress}</div>
        <button class="btn-icon btn-edit-loco" title="Lokomotive bearbeiten" style="font-size:14px;cursor:pointer;">✏️</button>
      </div>
    `;

    header.querySelector('.btn-edit-loco')?.addEventListener('click', () => {
      this.openEditModal(loco);
    });

    card.appendChild(header);

    // Speed Display
    const speedDisplay = document.createElement('div');
    speedDisplay.className = 'throttle-speed-display';
    speedDisplay.innerHTML = `
      <div class="speed-number" id="speed-num-${loco.id}">${loco.speed}</div>
      <div class="speed-unit">Fahrstufe (0 - 128)</div>
    `;
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

    slider.addEventListener('input', (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      const numEl = document.getElementById(`speed-num-${loco.id}`);
      if (numEl) numEl.textContent = `${val}`;
      wsClient.send({
        type: 'SET_LOCO_SPEED',
        payload: { locoId: loco.id, speed: val }
      });
    });
    sliderBox.appendChild(slider);

    // Speed Presets
    const presets = document.createElement('div');
    presets.className = 'preset-buttons';
    const presetValues = [
      { label: 'Stop', val: 0 },
      { label: 'Rangier', val: loco.vMin || 12 },
      { label: 'Reise', val: loco.vMid || 55 },
      { label: 'Schnell', val: 85 },
      { label: 'Vmax', val: loco.vMax || 105 }
    ];

    for (const p of presetValues) {
      const btn = document.createElement('button');
      btn.className = `preset-btn ${p.val === 0 ? 'stop' : ''}`;
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate(p.val === 0 ? 35 : 15);
        slider.value = `${p.val}`;
        const numEl = document.getElementById(`speed-num-${loco.id}`);
        if (numEl) numEl.textContent = `${p.val}`;
        wsClient.send({
          type: 'SET_LOCO_SPEED',
          payload: { locoId: loco.id, speed: p.val }
        });
      });
      presets.appendChild(btn);
    }
    sliderBox.appendChild(presets);
    card.appendChild(sliderBox);

    // Direction Controls
    const dirBox = document.createElement('div');
    dirBox.className = 'dir-controls';

    const fwdBtn = document.createElement('button');
    fwdBtn.className = `dir-btn ${loco.direction === 'FWD' ? 'active' : ''}`;
    fwdBtn.innerHTML = '▲ Vorwärts';
    fwdBtn.addEventListener('click', () => {
      if (navigator.vibrate) navigator.vibrate(20);
      wsClient.send({
        type: 'SET_LOCO_SPEED',
        payload: { locoId: loco.id, speed: loco.speed, direction: 'FWD' }
      });
    });

    const revBtn = document.createElement('button');
    revBtn.className = `dir-btn ${loco.direction === 'REV' ? 'active' : ''}`;
    revBtn.innerHTML = '▼ Rückwärts';
    revBtn.addEventListener('click', () => {
      if (navigator.vibrate) navigator.vibrate(20);
      wsClient.send({
        type: 'SET_LOCO_SPEED',
        payload: { locoId: loco.id, speed: loco.speed, direction: 'REV' }
      });
    });

    dirBox.appendChild(fwdBtn);
    dirBox.appendChild(revBtn);
    card.appendChild(dirBox);

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
        wsClient.send({
          type: 'SET_LOCO_FUNCTION',
          payload: { locoId: loco.id, functionIndex: f, active: !active }
        });
      });
      fnBox.appendChild(fnBtn);
    }
    card.appendChild(fnBox);

    return card;
  }
}
