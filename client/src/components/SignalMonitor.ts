import { Signal, SignalKind, SignalPins, SignalType, TrackElement, getSignalSupportedAspects } from '../types.js';
import { wsClient } from '../wsClient.js';
import {
  iconDot,
  iconEdit,
  iconLightbulb,
  iconPlus,
  iconSearch,
  iconSignal
} from '../icons.js';

export class SignalMonitor {
  private container: HTMLElement | null;
  private modal: HTMLElement | null = null;
  private form: HTMLFormElement | null = null;
  private activeTrackElement: TrackElement | null = null;
  private filterKind: 'ALL' | 'BLOCK' | 'ENTRY_EXIT' | 'SHUNTING' = 'ALL';
  private searchQuery: string = '';

  constructor(container: HTMLElement | null) {
    this.container = container;
    this.init();
    this.initModal();
  }

  private init(): void {
    wsClient.subscribe(() => {
      this.render();
    });
    this.render();
  }

  private updateKindUi(kind: SignalKind): void {
    const groupRed = document.getElementById('group-pin-red');
    const groupGreen = document.getElementById('group-pin-green');
    const groupYellow = document.getElementById('group-pin-yellow');
    const groupWhite = document.getElementById('group-pin-white');
    const hintEl = document.getElementById('signal-kind-hint');

    if (groupRed) groupRed.style.display = 'block';
    if (groupGreen) groupGreen.style.display = kind === 'SHUNTING' ? 'none' : 'block';
    if (groupYellow) groupYellow.style.display = kind === 'ENTRY_EXIT' || kind === 'ADVANCED' ? 'block' : 'none';
    if (groupWhite) groupWhite.style.display = kind === 'ADVANCED' || kind === 'SHUNTING' ? 'block' : 'none';

    if (hintEl) {
      const bulb = `<span style="color:#e3b341;display:inline-flex;align-items:center;margin-right:4px;">${iconLightbulb(15)}</span>`;
      switch (kind) {
        case 'BLOCK':
          hintEl.innerHTML = `${bulb}<strong>2-begriffiges Blocksignal (Hp0 / Hp1)</strong>: Fahrstraßen stellen hier <em>niemals Gelb</em>, sondern stets Hp1 (Grün).`;
          break;
        case 'ENTRY_EXIT':
          hintEl.innerHTML = `${bulb}<strong>3-begriffiges Signal (Hp0 / Hp1 / Hp2)</strong>: Fahrstraßen über abzweigende Weichen stellen automatisch Hp2 (Gelb/Grün).`;
          break;
        case 'ADVANCED':
          hintEl.innerHTML = `${bulb}<strong>4-begriffiges Signal</strong>: Unterstützt Hp0, Hp1, Hp2 und Sh1 (Rangierfahrt).`;
          break;
        case 'SHUNTING':
          hintEl.innerHTML = `${bulb}<strong>Sperrsignal (Sh0 / Sh1)</strong>: Reines Rangiersignal mit Sh0 (Halt) und Sh1 (Fahrverbot aufgehoben).`;
          break;
      }
    }
  }

  private initModal(): void {
    this.modal = document.getElementById('signal-modal');
    this.form = document.getElementById('form-signal') as HTMLFormElement | null;

    const btnAdd = document.getElementById('btn-add-signal');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => this.openModal());
    }

    const btnClose = document.getElementById('btn-signal-close');
    const btnCancel = document.getElementById('btn-signal-cancel');
    btnClose?.addEventListener('click', () => this.closeModal());
    btnCancel?.addEventListener('click', () => this.closeModal());

    const typeSelect = document.getElementById('signal-form-type') as HTMLSelectElement | null;
    const wioGroup = document.getElementById('signal-wio-fields');
    typeSelect?.addEventListener('change', () => {
      if (wioGroup) {
        wioGroup.style.display = typeSelect.value === 'WIO' ? 'block' : 'none';
      }
    });

    const kindSelect = document.getElementById('signal-form-kind') as HTMLSelectElement | null;
    kindSelect?.addEventListener('change', () => {
      this.updateKindUi(kindSelect.value as SignalKind);
    });

    const btnDelete = document.getElementById('btn-signal-delete');
    btnDelete?.addEventListener('click', () => {
      const idInput = document.getElementById('signal-edit-id') as HTMLInputElement | null;
      if (idInput && idInput.value) {
        if (confirm('Möchtest du dieses Signal wirklich löschen?')) {
          wsClient.send({
            type: 'DELETE_SIGNAL',
            payload: { signalId: idInput.value }
          });
          this.closeModal();
        }
      }
    });

    // Entkoppeln: Erstellt ein neues, separates Signal für das aktive Gleiselement
    const btnUnlink = document.getElementById('btn-signal-unlink-new');
    btnUnlink?.addEventListener('click', () => {
      if (!this.activeTrackElement) return;
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
      wsClient.send({
        type: 'CREATE_SIGNAL',
        payload: newSig
      });
      this.activeTrackElement.linkedId = newSig.id;
      wsClient.send({
        type: 'UPDATE_LAYOUT',
        payload: { elements: wsClient.layout }
      });
      this.openModal(newSig, this.activeTrackElement);
    });

    // Zuweisung wechseln: Track-Element mit anderem Signal verknüpfen
    const selectLinked = document.getElementById('signal-select-linked') as HTMLSelectElement | null;
    selectLinked?.addEventListener('change', () => {
      if (!this.activeTrackElement || !selectLinked.value) return;
      this.activeTrackElement.linkedId = selectLinked.value;
      wsClient.send({
        type: 'UPDATE_LAYOUT',
        payload: { elements: wsClient.layout }
      });
      const targetSig = wsClient.signals.find((s) => s.id === selectLinked.value);
      if (targetSig) {
        this.openModal(targetSig, this.activeTrackElement);
      }
    });

    if (this.form) {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSignal();
      });
    }
  }

  public openModal(signal?: Signal, trackElem?: TrackElement): void {
    if (!this.modal || !this.form) return;
    this.activeTrackElement = trackElem || null;

    const titleEl = document.getElementById('modal-signal-title');
    const idInput = document.getElementById('signal-edit-id') as HTMLInputElement | null;
    const nameInput = document.getElementById('signal-form-name') as HTMLInputElement | null;
    const kindSelect = document.getElementById('signal-form-kind') as HTMLSelectElement | null;
    const typeSelect = document.getElementById('signal-form-type') as HTMLSelectElement | null;
    const addrInput = document.getElementById('signal-form-address') as HTMLInputElement | null;
    const unitInput = document.getElementById('signal-form-wio-unit') as HTMLInputElement | null;
    const pinRedInput = document.getElementById('signal-form-pin-red') as HTMLInputElement | null;
    const pinGreenInput = document.getElementById('signal-form-pin-green') as HTMLInputElement | null;
    const pinYellowInput = document.getElementById('signal-form-pin-yellow') as HTMLInputElement | null;
    const pinWhiteInput = document.getElementById('signal-form-pin-white') as HTMLInputElement | null;
    const invCheckbox = document.getElementById('signal-form-inverted') as HTMLInputElement | null;
    const ledIdxInput = document.getElementById('signal-form-led-idx') as HTMLInputElement | null;
    const btnDelete = document.getElementById('btn-signal-delete');
    const wioGroup = document.getElementById('signal-wio-fields');
    const linkBox = document.getElementById('signal-track-link-box');
    const coordsEl = document.getElementById('signal-track-coords');
    const selectLinked = document.getElementById('signal-select-linked') as HTMLSelectElement | null;

    // Track Link Box
    if (this.activeTrackElement && linkBox && selectLinked) {
      linkBox.style.display = 'block';
      if (coordsEl) coordsEl.textContent = `(X: ${this.activeTrackElement.x}, Y: ${this.activeTrackElement.y})`;

      selectLinked.innerHTML = '';
      for (const s of wsClient.signals) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} [#${s.address}]`;
        if (s.id === (signal?.id || this.activeTrackElement.linkedId)) opt.selected = true;
        selectLinked.appendChild(opt);
      }
    } else if (linkBox) {
      linkBox.style.display = 'none';
    }

    if (signal) {
      const initialKind: SignalKind = signal.kind || (signal.wioPins?.yellow !== undefined ? 'ENTRY_EXIT' : 'BLOCK');
      if (titleEl) titleEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">${iconEdit(18)} <span>Signal bearbeiten: ${signal.name}</span></span>`;
      if (idInput) idInput.value = signal.id;
      if (nameInput) nameInput.value = signal.name;
      if (kindSelect) kindSelect.value = initialKind;
      if (typeSelect) typeSelect.value = signal.type || 'WIO';
      if (addrInput) addrInput.value = String(signal.address || 1);
      if (unitInput) unitInput.value = String(signal.wioUnit || 1);
      if (pinRedInput) pinRedInput.value = signal.wioPins?.red !== undefined ? String(signal.wioPins.red) : '12';
      if (pinGreenInput) pinGreenInput.value = signal.wioPins?.green !== undefined ? String(signal.wioPins.green) : '13';
      if (pinYellowInput) pinYellowInput.value = signal.wioPins?.yellow !== undefined ? String(signal.wioPins.yellow) : '';
      if (pinWhiteInput) pinWhiteInput.value = signal.wioPins?.white !== undefined ? String(signal.wioPins.white) : '';
      if (invCheckbox) invCheckbox.checked = !!signal.inverted;
      if (ledIdxInput) ledIdxInput.value = signal.wioLedIndex !== undefined ? String(signal.wioLedIndex) : '';
      if (btnDelete) btnDelete.style.display = 'block';
      this.updateKindUi(initialKind);
    } else {
      if (titleEl) titleEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;">${iconPlus(18)} <span>Neues Signal anlegen</span></span>`;
      if (idInput) idInput.value = '';
      const num = wsClient.signals.length + 1;
      if (nameInput) nameInput.value = `Signal ${num}`;
      if (kindSelect) kindSelect.value = 'BLOCK';
      if (typeSelect) typeSelect.value = 'WIO';
      if (addrInput) addrInput.value = String(100 + num);
      if (unitInput) unitInput.value = '1';
      if (pinRedInput) pinRedInput.value = '12';
      if (pinGreenInput) pinGreenInput.value = '13';
      if (pinYellowInput) pinYellowInput.value = '';
      if (pinWhiteInput) pinWhiteInput.value = '';
      if (invCheckbox) invCheckbox.checked = false;
      if (ledIdxInput) ledIdxInput.value = '';
      if (btnDelete) btnDelete.style.display = 'none';
      this.updateKindUi('BLOCK');
    }

    if (wioGroup && typeSelect) {
      wioGroup.style.display = typeSelect.value === 'WIO' ? 'block' : 'none';
    }

    this.modal.style.display = 'flex';
  }

  public closeModal(): void {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
  }

  private saveSignal(): void {
    const idInput = document.getElementById('signal-edit-id') as HTMLInputElement | null;
    const nameInput = document.getElementById('signal-form-name') as HTMLInputElement | null;
    const kindSelect = document.getElementById('signal-form-kind') as HTMLSelectElement | null;
    const typeSelect = document.getElementById('signal-form-type') as HTMLSelectElement | null;
    const addrInput = document.getElementById('signal-form-address') as HTMLInputElement | null;
    const unitInput = document.getElementById('signal-form-wio-unit') as HTMLInputElement | null;
    const pinRedInput = document.getElementById('signal-form-pin-red') as HTMLInputElement | null;
    const pinGreenInput = document.getElementById('signal-form-pin-green') as HTMLInputElement | null;
    const pinYellowInput = document.getElementById('signal-form-pin-yellow') as HTMLInputElement | null;
    const pinWhiteInput = document.getElementById('signal-form-pin-white') as HTMLInputElement | null;
    const invCheckbox = document.getElementById('signal-form-inverted') as HTMLInputElement | null;
    const ledIdxInput = document.getElementById('signal-form-led-idx') as HTMLInputElement | null;

    if (!nameInput || !addrInput || !typeSelect) return;

    const isEdit = !!(idInput && idInput.value);
    const kind: SignalKind = (kindSelect?.value as SignalKind) || 'BLOCK';
    const type = typeSelect.value as SignalType;
    const existing = isEdit ? wsClient.signals.find((s) => s.id === idInput.value) : null;

    // Pin-Zuweisung je nach Bauart filtern (Blocksignale haben kein Gelb/Weiß)
    const pins: SignalPins = {};
    if (pinRedInput && pinRedInput.value !== '') pins.red = parseInt(pinRedInput.value, 10);
    if (kind !== 'SHUNTING' && pinGreenInput && pinGreenInput.value !== '') pins.green = parseInt(pinGreenInput.value, 10);
    if ((kind === 'ENTRY_EXIT' || kind === 'ADVANCED') && pinYellowInput && pinYellowInput.value !== '') {
      pins.yellow = parseInt(pinYellowInput.value, 10);
    }
    if ((kind === 'ADVANCED' || kind === 'SHUNTING') && pinWhiteInput && pinWhiteInput.value !== '') {
      pins.white = parseInt(pinWhiteInput.value, 10);
    }

    const signalData: Signal = {
      id: isEdit ? idInput.value : `sig-${Date.now()}`,
      name: nameInput.value.trim(),
      address: parseInt(addrInput.value, 10) || 101,
      aspect: existing ? existing.aspect : 'HP0',
      type,
      kind,
      wioUnit: type === 'WIO' && unitInput ? parseInt(unitInput.value, 10) || 1 : undefined,
      wioPins: type === 'WIO' ? pins : undefined,
      inverted: !!invCheckbox?.checked,
      wioLedIndex: ledIdxInput && ledIdxInput.value !== '' ? parseInt(ledIdxInput.value, 10) : undefined
    };

    if (isEdit) {
      wsClient.send({
        type: 'UPDATE_SIGNAL',
        payload: signalData
      });
    } else {
      wsClient.send({
        type: 'CREATE_SIGNAL',
        payload: signalData
      });
    }

    if (this.activeTrackElement) {
      this.activeTrackElement.linkedId = signalData.id;
      wsClient.send({
        type: 'UPDATE_LAYOUT',
        payload: { elements: wsClient.layout }
      });
    }

    this.closeModal();
  }

  public render(): void {
    if (!this.container) {
      this.container = document.getElementById('signal-manager-content');
      if (!this.container) return;
    }

    const signals = wsClient.signals || [];

    const filteredSignals = signals.filter((s) => {
      const kind = s.kind || (s.wioPins?.yellow !== undefined ? 'ENTRY_EXIT' : 'BLOCK');
      if (this.filterKind !== 'ALL' && kind !== this.filterKind) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || String(s.address).includes(q);
      }
      return true;
    });

    let cardsHtml = '';
    if (signals.length === 0) {
      cardsHtml = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: #8b949e; background: #161b22; border-radius: 8px; border: 1px dashed #30363d;">
          <div style="margin-bottom:12px;color:#58a6ff;">${iconSignal(36)}</div>
          <p style="font-size: 15px; margin-bottom: 12px;">Keine Signale angelegt.</p>
          <button id="btn-add-signal-empty" class="btn btn-save" style="display:inline-flex;align-items:center;gap:6px;">
            ${iconPlus(16)} Erstes Signal anlegen
          </button>
        </div>
      `;
    } else if (filteredSignals.length === 0) {
      cardsHtml = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: #8b949e; background: #161b22; border-radius: 8px; border: 1px dashed #30363d;">
          <p style="font-size: 14px; margin-bottom: 8px;">Keine Signale gefunden, die dem Filter entsprechen.</p>
          <button id="btn-reset-signal-filter" class="btn btn-sm" style="background:#21262d;border:1px solid #30363d;color:#58a6ff;">Filter zurücksetzen</button>
        </div>
      `;
    } else {
      cardsHtml = filteredSignals.map((sig) => this.renderSignalCard(sig)).join('');
    }

    this.container.innerHTML = `
      <div class="card-container" style="margin-top: 16px; padding: 20px;">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="color:#58a6ff;">${iconSignal(24)}</span>
            <div>
              <h2 style="margin:0;">Signal-Steuerung & Konfiguration</h2>
              <p style="margin:4px 0 0;font-size:13px;color:#8b949e;">Echtzeit-Signalisierung über ESP32 (WIO-Pins / WS2812) oder DCC-EX. Wähle Bauarten (2-begriffige Blocksignale oder 3/4-begriffige Hauptsignale) und schalte live.</p>
            </div>
          </div>
          <button id="btn-add-signal" class="btn btn-save" style="display:inline-flex;align-items:center;gap:6px;">
            ${iconPlus(16)} Neues Signal anlegen
          </button>
        </div>

        <div class="subnav-filter-row" style="margin-bottom: 14px;">
          <div class="filter-pills">
            <button class="filter-pill ${this.filterKind === 'ALL' ? 'active' : ''}" data-sig-filter="ALL">Alle (${signals.length})</button>
            <button class="filter-pill ${this.filterKind === 'BLOCK' ? 'active' : ''}" data-sig-filter="BLOCK">Block (Hp0/1)</button>
            <button class="filter-pill ${this.filterKind === 'ENTRY_EXIT' ? 'active' : ''}" data-sig-filter="ENTRY_EXIT">Hauptsignale (Hp0/1/2)</button>
            <button class="filter-pill ${this.filterKind === 'SHUNTING' ? 'active' : ''}" data-sig-filter="SHUNTING">Sperrsignale (Sh0/1)</button>
          </div>
          <div class="filter-search-box">
            <span class="search-icon">${iconSearch(14)}</span>
            <input type="text" class="filter-search-input" id="real-signal-search" placeholder="Signal suchen..." value="${this.searchQuery}">
          </div>
        </div>

        <div class="signal-grid" id="signal-cards-grid">
          ${cardsHtml}
        </div>
      </div>
    `;

    document.getElementById('btn-add-signal')?.addEventListener('click', () => this.openModal());
    document.getElementById('btn-add-signal-empty')?.addEventListener('click', () => this.openModal());
    document.getElementById('btn-reset-signal-filter')?.addEventListener('click', () => {
      this.filterKind = 'ALL';
      this.searchQuery = '';
      this.render();
    });

    this.container.querySelectorAll<HTMLButtonElement>('.filter-pill[data-sig-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filterKind = (btn.dataset.sigFilter as any) || 'ALL';
        this.render();
      });
    });

    const searchInput = document.getElementById('real-signal-search') as HTMLInputElement | null;
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.render();
      const updatedInput = document.getElementById('real-signal-search') as HTMLInputElement | null;
      if (updatedInput) {
        updatedInput.focus();
        updatedInput.setSelectionRange(this.searchQuery.length, this.searchQuery.length);
      }
    });

    // Attach aspect click handlers only for supported aspects of each filtered signal
    for (const sig of filteredSignals) {
      const supported = getSignalSupportedAspects(sig);
      for (const aspect of supported) {
        document.getElementById(`btn-aspect-${sig.id}-${aspect}`)?.addEventListener('click', (e) => {
          e.stopPropagation();
          wsClient.send({
            type: 'SET_SIGNAL',
            payload: { signalId: sig.id, aspect }
          });
        });
      }

      document.getElementById(`btn-edit-sig-${sig.id}`)?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openModal(sig);
      });
    }
  }

  private renderSignalCard(sig: Signal): string {
    const isWio = sig.type === 'WIO' || !sig.type;
    const kind: SignalKind = sig.kind || (sig.wioPins?.yellow !== undefined ? 'ENTRY_EXIT' : 'BLOCK');
    const aspect = sig.aspect || 'HP0';
    const supportedAspects = getSignalSupportedAspects(sig);

    const isRed = aspect === 'HP0' || aspect === 'SH0';
    const isGreen = aspect === 'HP1' || aspect === 'HP2';
    const isYellow = aspect === 'HP2';
    const isWhite = aspect === 'SH1';

    const redGlow = isRed ? 'fill="#f85149" filter="url(#glow-red)"' : 'fill="#481816"';
    const greenGlow = isGreen ? 'fill="#3fb950" filter="url(#glow-green)"' : 'fill="#13381a"';
    const yellowGlow = isYellow ? 'fill="#d29922" filter="url(#glow-yellow)"' : 'fill="#3d2c0b"';
    const whiteGlow = isWhite ? 'fill="#f0f6fc" filter="url(#glow-white)"' : 'fill="#30363d"';

    // Bauartspezifischer SVG Signalschirm
    let signalHeadSvg = '';
    if (kind === 'BLOCK') {
      // 2-Begriffiges Blocksignal (Nur Rot / Grün)
      signalHeadSvg = `
        <svg width="44" height="58" viewBox="0 0 44 58" style="flex-shrink:0;">
          <!-- Mast -->
          <line x1="22" y1="28" x2="22" y2="58" stroke="#8b949e" stroke-width="4"/>
          <line x1="16" y1="56" x2="28" y2="56" stroke="#8b949e" stroke-width="3"/>
          <!-- Schirm (2 Linsen) -->
          <rect x="10" y="2" width="24" height="30" rx="9" fill="#0d1117" stroke="#30363d" stroke-width="2"/>
          <circle cx="22" cy="10" r="4.5" ${redGlow}/>
          <circle cx="22" cy="22" r="4.5" ${greenGlow}/>
        </svg>
      `;
    } else if (kind === 'SHUNTING') {
      // Sperrsignal (Sh0 / Sh1)
      signalHeadSvg = `
        <svg width="44" height="52" viewBox="0 0 44 52" style="flex-shrink:0;">
          <line x1="22" y1="24" x2="22" y2="52" stroke="#8b949e" stroke-width="4"/>
          <line x1="16" y1="50" x2="28" y2="50" stroke="#8b949e" stroke-width="3"/>
          <rect x="10" y="4" width="24" height="24" rx="4" fill="#0d1117" stroke="#30363d" stroke-width="2"/>
          <circle cx="17" cy="16" r="3.5" ${redGlow}/>
          <circle cx="27" cy="16" r="3.5" ${whiteGlow}/>
        </svg>
      `;
    } else {
      // 3-begriffig (ENTRY_EXIT) oder 4-begriffig (ADVANCED)
      signalHeadSvg = `
        <svg width="44" height="68" viewBox="0 0 44 68" style="flex-shrink:0;">
          <!-- Mast -->
          <line x1="22" y1="36" x2="22" y2="68" stroke="#8b949e" stroke-width="4"/>
          <line x1="16" y1="66" x2="28" y2="66" stroke="#8b949e" stroke-width="3"/>
          <!-- Schirm -->
          <rect x="10" y="2" width="24" height="42" rx="10" fill="#0d1117" stroke="#30363d" stroke-width="2"/>
          <!-- Lampen -->
          <circle cx="22" cy="11" r="4.5" ${redGlow}/>
          <circle cx="22" cy="23" r="4.5" ${greenGlow}/>
          <circle cx="22" cy="35" r="4" ${yellowGlow}/>
          ${kind === 'ADVANCED' && isWhite ? `<circle cx="16" cy="17" r="2.5" ${whiteGlow}/><circle cx="28" cy="29" r="2.5" ${whiteGlow}/>` : ''}
        </svg>
      `;
    }

    // Kind Badge
    let kindBadge = '';
    switch (kind) {
      case 'BLOCK':
        kindBadge = `<span class="badge" style="background:#23863622;color:#3fb950;border:1px solid #2ea04344;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${iconDot('#3fb950', 6)} Block (Hp0/Hp1)</span>`;
        break;
      case 'ENTRY_EXIT':
        kindBadge = `<span class="badge" style="background:#d2992222;color:#e3b341;border:1px solid #d2992244;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${iconDot('#e3b341', 6)} Einfahr/Ausfahr (Hp0/1/2)</span>`;
        break;
      case 'ADVANCED':
        kindBadge = `<span class="badge" style="background:#a371f722;color:#bc8cff;border:1px solid #a371f744;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${iconDot('#bc8cff', 6)} Haupt/Sperr (4-begr.)</span>`;
        break;
      case 'SHUNTING':
        kindBadge = `<span class="badge" style="background:#58a6ff22;color:#58a6ff;border:1px solid #58a6ff44;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${iconDot('#58a6ff', 6)} Sperrsignal (Sh0/Sh1)</span>`;
        break;
    }

    // Aspect Info Badge
    let aspectBadge = '';
    switch (aspect) {
      case 'HP0':
        aspectBadge = `<span class="signal-badge-status status-hp0" style="display:inline-flex;align-items:center;gap:5px;">${iconDot('#f85149', 6)} HP0 (HALT)</span>`;
        break;
      case 'HP1':
        aspectBadge = `<span class="signal-badge-status status-hp1" style="display:inline-flex;align-items:center;gap:5px;">${iconDot('#3fb950', 6)} HP1 (FAHRT)</span>`;
        break;
      case 'HP2':
        aspectBadge = `<span class="signal-badge-status status-hp2" style="display:inline-flex;align-items:center;gap:5px;">${iconDot('#e3b341', 6)} HP2 (LANGSAM)</span>`;
        break;
      case 'SH1':
        aspectBadge = `<span class="signal-badge-status status-sh1" style="display:inline-flex;align-items:center;gap:5px;">${iconDot('#79c0ff', 6)} SH1 (RANGIEREN)</span>`;
        break;
      case 'SH0':
        aspectBadge = `<span class="signal-badge-status status-sh0" style="display:inline-flex;align-items:center;gap:5px;">${iconDot('#f85149', 6)} SH0 (HALT)</span>`;
        break;
      default:
        aspectBadge = `<span class="signal-badge-status">${aspect}</span>`;
    }

    // Hardware Details
    let hwDetails = '';
    if (isWio) {
      const pins = sig.wioPins;
      const pinParts: string[] = [];
      if (pins?.red !== undefined) pinParts.push(`Rot: <strong>P${pins.red}</strong>`);
      if (pins?.green !== undefined && kind !== 'SHUNTING') pinParts.push(`Grün: <strong>P${pins.green}</strong>`);
      if (pins?.yellow !== undefined && (kind === 'ENTRY_EXIT' || kind === 'ADVANCED')) pinParts.push(`Gelb: <strong>P${pins.yellow}</strong>`);
      if (pins?.white !== undefined && (kind === 'ADVANCED' || kind === 'SHUNTING')) pinParts.push(`Weiß: <strong>P${pins.white}</strong>`);

      const pinList = pinParts.length > 0 ? pinParts.join(' • ') : 'Keine Pins konfiguriert';
      hwDetails = `ESP32 WIO <strong>Unit #${sig.wioUnit || 1}</strong> • ${pinList}${sig.inverted ? ' • <span style="color:#e3b341;">Active-Low</span>' : ''}`;
    } else {
      hwDetails = `Typ: ${sig.type} • DCC-Adresse: #${sig.address}`;
    }

    // Schaltknöpfe: Ausgewogene Beschriftung je nach Anzahl der Begriffe
    const count = supportedAspects.length;
    const aspectButtonsHtml = supportedAspects.map((asp) => {
      let label = '';
      const isActive = aspect === asp;
      const activeClass = isActive ? `active active-${asp.toLowerCase()}` : '';

      switch (asp) {
        case 'HP0':
          label = count <= 2 ? `${iconDot('#f85149', 6)} Hp0 (Halt)` : (count === 3 ? `${iconDot('#f85149', 6)} Hp0 (Halt)` : `${iconDot('#f85149', 6)} Hp0`);
          break;
        case 'HP1':
          label = count <= 2 ? `${iconDot('#3fb950', 6)} Hp1 (Fahrt)` : (count === 3 ? `${iconDot('#3fb950', 6)} Hp1 (Fahrt)` : `${iconDot('#3fb950', 6)} Hp1`);
          break;
        case 'HP2':
          label = count <= 3 ? `${iconDot('#e3b341', 6)} Hp2 (Langsam)` : `${iconDot('#e3b341', 6)} Hp2`;
          break;
        case 'SH1':
          label = count <= 2 ? `${iconDot('#79c0ff', 6)} Sh1 (Rangieren)` : `${iconDot('#79c0ff', 6)} Sh1`;
          break;
        case 'SH0':
          label = count <= 2 ? `${iconDot('#f85149', 6)} Sh0 (Halt)` : `${iconDot('#f85149', 6)} Sh0`;
          break;
      }

      return `
        <button id="btn-aspect-${sig.id}-${asp}" class="signal-aspect-btn ${activeClass}" title="${asp}">
          ${label}
        </button>
      `;
    }).join('');

    const cols = Math.max(2, supportedAspects.length);

    return `
      <div class="signal-card ${isRed ? 'halt' : 'proceed'}">
        <div class="signal-card-header">
          <div class="signal-card-icon">
            ${signalHeadSvg}
          </div>
          <div class="signal-card-main">
            <div class="signal-card-top-row">
              <span class="signal-card-name" title="${sig.name}">${sig.name}</span>
              <div style="flex-shrink:0;">${aspectBadge}</div>
            </div>
            <div class="signal-card-meta-row">
              ${kindBadge}
            </div>
            <div class="signal-card-hw">${hwDetails}</div>
          </div>
        </div>

        <!-- Buttons zum Schalten (dynamisch je nach Bauart) -->
        <div class="signal-aspect-grid" style="grid-template-columns:repeat(${cols}, 1fr);">
          ${aspectButtonsHtml}
        </div>

        <div>
          <button id="btn-edit-sig-${sig.id}" class="signal-config-btn" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;">
            ${iconEdit(14)} Signal konfigurieren (Bauart / Pins / Unit)
          </button>
        </div>
      </div>
    `;
  }
}


