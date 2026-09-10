import { Sensor, SensorType, WioNodeInfo } from '../types.js';
import { wsClient } from '../wsClient.js';

export class SensorMonitor {
  private container: HTMLElement;
  private wioContainer: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private form: HTMLFormElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.wioContainer = document.getElementById('wio-manager-content');
    this.init();
    this.initModal();
  }

  private init(): void {
    wsClient.subscribe(() => {
      this.render();
      this.updateWioStatusChip();
    });
    this.render();
    this.updateWioStatusChip();
  }

  private updateWioStatusChip(): void {
    const chip = document.getElementById('wio-status-chip');
    if (!chip) return;
    const wioCfg = wsClient.settings.wio;
    const port = wioCfg?.udpPort || 8051;
    const enabled = wioCfg?.enabled !== false;
    const activeNodes = wsClient.wioNodes || [];
    if (enabled) {
      if (activeNodes.length > 0) {
        const n = activeNodes[0];
        chip.textContent = `📡 ESP32: ${n.name || 'WIO'} (Unit #${n.unit}) online @ ${n.ip} (${n.connectionType || 'TCP'})`;
        chip.style.backgroundColor = '#238636';
      } else {
        chip.textContent = `📡 ESP32 WIO-Server: Port ${port} aktiv (Warte auf ESP)`;
        chip.style.backgroundColor = '#1f6feb';
      }
    } else {
      chip.textContent = `📡 ESP32 WIO: Deaktiviert`;
      chip.style.backgroundColor = '#484f58';
    }
  }

  private initModal(): void {
    this.modal = document.getElementById('sensor-modal');
    this.form = document.getElementById('form-sensor') as HTMLFormElement | null;

    const btnAdd = document.getElementById('btn-add-sensor');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => this.openModal());
    }

    const btnClose = document.getElementById('btn-sensor-close');
    const btnCancel = document.getElementById('btn-sensor-cancel');
    btnClose?.addEventListener('click', () => this.closeModal());
    btnCancel?.addEventListener('click', () => this.closeModal());

    const typeSelect = document.getElementById('sensor-form-type') as HTMLSelectElement | null;
    const wioGroup = document.getElementById('sensor-wio-fields');
    typeSelect?.addEventListener('change', () => {
      if (wioGroup) {
        wioGroup.style.display = typeSelect.value === 'WIO' ? 'block' : 'none';
      }
    });

    const btnDelete = document.getElementById('btn-sensor-delete');
    btnDelete?.addEventListener('click', () => {
      const idInput = document.getElementById('sensor-edit-id') as HTMLInputElement | null;
      if (idInput && idInput.value) {
        if (confirm('Möchtest du diesen Rückmelder wirklich unwiderruflich löschen?')) {
          wsClient.send({
            type: 'DELETE_SENSOR',
            payload: { sensorId: idInput.value }
          });
          this.closeModal();
        }
      }
    });

    if (this.form) {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSensor();
      });
    }

    // Auto-fetch ESP devices in background if not yet loaded
    if (wsClient.discoveredEsps.length === 0) {
      wsClient.triggerEspScan().catch(() => {});
    }
  }

  public openModal(sensor?: Sensor, prefillWio?: { unit: number; pin: number }): void {
    if (!this.modal || !this.form) return;

    const titleEl = document.getElementById('modal-sensor-title');
    const idInput = document.getElementById('sensor-edit-id') as HTMLInputElement | null;
    const nameInput = document.getElementById('sensor-form-name') as HTMLInputElement | null;
    const typeSelect = document.getElementById('sensor-form-type') as HTMLSelectElement | null;
    const unitInput = document.getElementById('sensor-form-wio-unit') as HTMLInputElement | null;
    const pinInput = document.getElementById('sensor-form-wio-pin') as HTMLInputElement | null;
    const addrInput = document.getElementById('sensor-form-address') as HTMLInputElement | null;
    const invCheckbox = document.getElementById('sensor-form-inverted') as HTMLInputElement | null;
    const btnDelete = document.getElementById('btn-sensor-delete');
    const wioGroup = document.getElementById('sensor-wio-fields');

    const defaultUnit = wsClient.wioNodes.length > 0 ? wsClient.wioNodes[0].unit : 33;

    if (sensor) {
      if (titleEl) titleEl.textContent = '✏️ Rückmelder bearbeiten';
      if (idInput) idInput.value = sensor.id;
      if (nameInput) nameInput.value = sensor.name;
      if (typeSelect) typeSelect.value = sensor.type;
      if (unitInput) unitInput.value = String(sensor.wioUnit || defaultUnit);
      if (pinInput) pinInput.value = String(sensor.wioPin || 1);
      if (addrInput) addrInput.value = String(sensor.address);
      if (invCheckbox) invCheckbox.checked = !!sensor.inverted;
      if (btnDelete) btnDelete.style.display = 'block';
    } else {
      if (titleEl) titleEl.textContent = '➕ Neuen Rückmelder anlegen';
      if (idInput) idInput.value = '';
      const unit = prefillWio ? prefillWio.unit : defaultUnit;
      const pin = prefillWio ? prefillWio.pin : wsClient.sensors.length + 1;
      if (nameInput) nameInput.value = prefillWio ? `WIO ${unit} Pin ${pin}` : `Rückmelder ${wsClient.sensors.length + 1}`;
      if (typeSelect) typeSelect.value = 'WIO';
      if (unitInput) unitInput.value = String(unit);
      if (pinInput) pinInput.value = String(pin);
      if (addrInput) addrInput.value = String(prefillWio ? unit * 100 + pin : wsClient.sensors.length + 1);
      if (invCheckbox) invCheckbox.checked = false;
      if (btnDelete) btnDelete.style.display = 'none';
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

  private saveSensor(): void {
    const idInput = document.getElementById('sensor-edit-id') as HTMLInputElement | null;
    const nameInput = document.getElementById('sensor-form-name') as HTMLInputElement | null;
    const typeSelect = document.getElementById('sensor-form-type') as HTMLSelectElement | null;
    const unitInput = document.getElementById('sensor-form-wio-unit') as HTMLInputElement | null;
    const pinInput = document.getElementById('sensor-form-wio-pin') as HTMLInputElement | null;
    const addrInput = document.getElementById('sensor-form-address') as HTMLInputElement | null;
    const invCheckbox = document.getElementById('sensor-form-inverted') as HTMLInputElement | null;

    if (!nameInput || !addrInput || !typeSelect) return;

    const isEdit = !!(idInput && idInput.value);
    const type = typeSelect.value as SensorType;

    const sensorData: Sensor = {
      id: isEdit ? idInput.value : `sens-${Date.now()}`,
      name: nameInput.value.trim(),
      type,
      address: parseInt(addrInput.value, 10) || 1,
      active: false,
      inverted: !!invCheckbox?.checked,
      wioUnit: type === 'WIO' && unitInput ? parseInt(unitInput.value, 10) || 33 : undefined,
      wioPin: type === 'WIO' && pinInput ? parseInt(pinInput.value, 10) || 1 : undefined
    };

    if (isEdit) {
      wsClient.send({
        type: 'UPDATE_SENSOR',
        payload: sensorData
      });
    } else {
      wsClient.send({
        type: 'CREATE_SENSOR',
        payload: sensorData
      });
    }

    this.closeModal();
  }

  public render(): void {
    this.renderWioManager();
    this.renderSensors();
  }

  private renderWioManager(): void {
    if (!this.wioContainer) {
      this.wioContainer = document.getElementById('wio-manager-content');
      if (!this.wioContainer) return;
    }

    const wioCfg = wsClient.settings.wio;
    const port = wioCfg?.udpPort || 8051;
    const serverHost = window.location.hostname || '127.0.0.1';
    const nodes = wsClient.wioNodes || [];
    const packets = wsClient.wioPackets || [];
    const discovered = wsClient.discoveredEsps || [];

    // Scanning indicator banner
    const scanningBanner = wsClient.isScanningEsp
      ? `
        <div style="background:rgba(31,111,235,0.15);border:1px solid #1f6feb;border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;color:#58a6ff;">
          <div style="font-size:22px;display:inline-block;animation:spin 1s linear infinite;">🔄</div>
          <div>
            <strong style="color:#f0f6fc;">Netzwerk-Scan läuft...</strong>
            <div style="font-size:12px;color:#8b949e;margin-top:2px;">Suche im lokalen Subnetz nach ESP32 Modulen & WIO Signal-Controllern...</div>
          </div>
        </div>
      `
      : '';

    // Discovered ESP devices section
    let discoveredHtml = '';
    if (discovered.length > 0) {
      const espItems = discovered.map((esp) => {
        const isConnected = esp.tcpConnected || nodes.some((n) => n.ip === esp.ip);
        const statusBadge = isConnected
          ? `<span style="background:rgba(35,134,54,0.2);border:1px solid #238636;color:#3fb950;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">🟢 Aktiv verbunden (TCP 8051)</span>`
          : `<span style="background:rgba(31,111,235,0.2);border:1px solid #1f6feb;color:#58a6ff;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">🔵 Online</span>`;

        return `
          <div style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:24px;">🎛️</span>
              <div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <strong style="color:#f0f6fc;font-size:14px;">${esp.name}</strong>
                  <span style="font-size:12px;color:#8b949e;">(${esp.title})</span>
                  ${statusBadge}
                </div>
                <div style="font-size:12px;color:#8b949e;margin-top:2px;">
                  IP: <code style="color:#58a6ff;">${esp.ip}</code>
                  ${esp.mac ? `• MAC: <span style="font-family:monospace;color:#c9d1d9;">${esp.mac}</span>` : ''}
                  ${esp.unit ? `• Baugruppe/Unit: <strong>${esp.unit}</strong>` : ''}
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <a href="${esp.webUrl}" target="_blank" class="btn btn-sm" style="background:#21262d;border:1px solid #30363d;color:#58a6ff;text-decoration:none;" title="Öffnet die ESP32 Konfiguration im Webbrowser">
                🌐 Web-UI (${esp.ip}) ↗️
              </a>
              ${esp.unit ? `
                <button id="btn-scan-create-${esp.unit}" class="btn btn-sm btn-save" title="Erstellt automatisch 16 Belegtmelder für dieses Modul">
                  ➕ 16 Pins für Unit ${esp.unit} anlegen
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      discoveredHtml = `
        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:14px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="font-weight:600;font-size:13px;color:#f0f6fc;display:flex;align-items:center;gap:6px;">
              <span>🔍 Gefundene ESP-Geräte im Netzwerk (${discovered.length})</span>
            </div>
            <span style="font-size:11px;color:#6e7681;">Rocrail WIO / ESP32 Signal- & Belegtmelder</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${espItems}
          </div>
        </div>
      `;
    }

    let nodesHtml = '';
    if (nodes.length === 0) {
      nodesHtml = `
        <div style="background:#161b22;border:1px dashed #30363d;border-radius:10px;padding:22px;text-align:center;">
          <div style="font-size:28px;margin-bottom:6px;">📡</div>
          <div style="font-weight:600;font-size:15px;color:#f0f6fc;margin-bottom:6px;">Warte auf Verbindung des ESP32...</div>
          <p style="font-size:13px;color:#8b949e;max-width:620px;margin:0 auto 14px;line-height:1.5;">
            Der TrainMaster Server lauscht auf <strong>Port ${port} (TCP & UDP)</strong>. Starte den Netzwerk-Scan oder trage im ESP32 die Server-IP <code style="color:#58a6ff;background:#21262d;padding:2px 6px;border-radius:4px;">${serverHost}</code> ein.
          </p>
          <button id="btn-wio-scan-empty" class="btn btn-save" style="margin:0 auto;">
            🔍 ESP-Netzwerkscan starten
          </button>
        </div>
      `;
    } else {
      nodesHtml = nodes.map((node) => this.renderNodeCard(node)).join('');
    }

    // Packet Sniffer rows
    const snifferRows = packets.length === 0
      ? `<div style="color:#6e7681;font-style:italic;">Noch keine Rohdaten empfangen. (Port ${port} lauscht aktiv)</div>`
      : packets.slice(0, 10).map((pkt) => {
          const time = new Date(pkt.timestamp).toLocaleTimeString();
          return `
            <div class="wio-sniffer-row">
              <span class="time">[${time}]</span>
              <span class="ip">${pkt.ip}</span>
              <span class="data">➔ ${this.escapeHtml(pkt.payload)}</span>
            </div>
          `;
        }).join('');

    this.wioContainer.innerHTML = `
      <div class="wio-manager-box">
        <!-- Connection Banner -->
        <div class="wio-info-banner">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:26px;">📡</span>
            <div>
              <div style="font-weight:700;font-size:15px;color:#f0f6fc;">ESP32 WIO Gerätemanager & Live-Monitor</div>
              <div style="font-size:12px;color:#8b949e;margin-top:2px;">
                Empfängt TCP & UDP Sensordaten auf Port <strong>${port}</strong> sowie HTTP-Webhooks unter <code style="color:#58a6ff;">/api/wio/sensor</code>.
              </div>
            </div>
          </div>
          <div class="wio-info-items">
            <div class="wio-info-pill" title="Server-IP für die ESP32 Konfiguration">Server-IP: <strong>${serverHost}</strong></div>
            <div class="wio-info-pill" title="Ziel-Port für TCP & UDP">Port: <strong>${port}</strong></div>
            <button id="btn-wio-scan" class="btn btn-sm" style="background:#238636;border:1px solid #2ea043;color:#ffffff;font-weight:600;display:flex;align-items:center;gap:6px;" ${wsClient.isScanningEsp ? 'disabled' : ''} title="Sucht das lokale Netzwerk nach ESP32 & WIO Geräten ab">
              ${wsClient.isScanningEsp ? '🔄 Scanne...' : '🔍 ESP-Scan starten'}
            </button>
            <button id="btn-wio-simulate" class="btn btn-sm" style="background:#21262d;border:1px solid #30363d;color:#58a6ff;" title="Simuliert ein WIO-ESP32 Paket zum Testen">
              ⚡ Test-Signal simulieren
            </button>
          </div>
        </div>

        ${scanningBanner}
        ${discoveredHtml}

        <!-- Detected ESP32 Nodes -->
        <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:14px;">
          ${nodesHtml}
        </div>

        <!-- Live Sniffer -->
        <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-size:12px;font-weight:600;color:#c9d1d9;display:flex;align-items:center;gap:6px;">
              <span>📦 Live-Paketprotokoll (letzte 10 Ereignisse)</span>
            </div>
            <span style="font-size:11px;color:#6e7681;">TCP / UDP Port ${port} & HTTP</span>
          </div>
          <div class="wio-sniffer-container">
            ${snifferRows}
          </div>
        </div>
      </div>
    `;

    // Attach scan button
    document.getElementById('btn-wio-scan')?.addEventListener('click', () => {
      wsClient.triggerEspScan();
    });
    document.getElementById('btn-wio-scan-empty')?.addEventListener('click', () => {
      wsClient.triggerEspScan();
    });

    // Attach simulation button
    document.getElementById('btn-wio-simulate')?.addEventListener('click', () => {
      this.simulateWioPacket();
    });

    // Attach scan create buttons
    for (const esp of discovered) {
      if (esp.unit) {
        document.getElementById(`btn-scan-create-${esp.unit}`)?.addEventListener('click', () => {
          wsClient.send({
            type: 'AUTO_CREATE_WIO_SENSORS',
            payload: { unit: esp.unit!, count: 16 }
          });
        });
      }
    }

    // Attach auto-create buttons
    for (const node of nodes) {
      document.getElementById(`btn-autocreate-wio-${node.unit}`)?.addEventListener('click', () => {
        wsClient.send({
          type: 'AUTO_CREATE_WIO_SENSORS',
          payload: { unit: node.unit, count: 16 }
        });
      });

      // Attach pin click handlers
      for (let pin = 1; pin <= 16; pin++) {
        const pinEl = document.getElementById(`pin-${node.unit}-${pin}`);
        if (pinEl) {
          pinEl.addEventListener('click', () => {
            const existing = wsClient.sensors.find((s) => s.type === 'WIO' && s.wioUnit === node.unit && s.wioPin === pin);
            if (existing) {
              this.openModal(existing);
            } else {
              this.openModal(undefined, { unit: node.unit, pin });
            }
          });
        }
      }
    }
  }

  private renderNodeCard(node: WioNodeInfo): string {
    const secAgo = Math.floor((Date.now() - node.lastSeen) / 1000);
    const isOnline = secAgo < 30;
    const statusText = isOnline ? `🟢 Online (Vor ${secAgo}s)` : `🟠 Zuletzt gesehen vor ${secAgo}s`;
    const connBadge = node.connectionType
      ? `<span style="background:#21262d;border:1px solid #30363d;padding:2px 6px;border-radius:4px;font-size:11px;color:#58a6ff;">${node.connectionType} 8051</span>`
      : '';
    const nameStr = node.name ? `"${node.name}" ` : '';
    const verStr = node.clientver ? `• FW v${node.clientver}` : '';

    // Generate 16 Pins
    let pinsHtml = '';
    for (let pin = 1; pin <= 16; pin++) {
      const isHigh = !!node.pinStates?.[pin];
      const sensor = wsClient.sensors.find((s) => s.type === 'WIO' && s.wioUnit === node.unit && s.wioPin === pin);
      const title = sensor
        ? `Pin ${pin}: ${isHigh ? 'BELEGT' : 'FREI'} (Sensor: ${sensor.name}) - Klicken zum Bearbeiten`
        : `Pin ${pin}: ${isHigh ? 'BELEGT' : 'FREI'} (Noch nicht als Sensor angelegt) - Klicken zum Anlegen`;

      pinsHtml += `
        <div id="pin-${node.unit}-${pin}" class="wio-pin-item ${isHigh ? 'active' : ''}" title="${title}" style="cursor:pointer;">
          <div class="pin-num">P${pin}</div>
          <div class="pin-label">${isHigh ? '🔴 BELEGT' : '⚪ FREI'}</div>
          ${sensor ? `<div style="font-size:9px;color:#58a6ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60px;" title="${sensor.name}">${sensor.name}</div>` : ''}
        </div>
      `;
    }

    return `
      <div class="wio-node-card ${isOnline ? 'online' : ''}">
        <div class="wio-node-header">
          <div class="wio-node-title">
            <span style="font-size:22px;">🎛️</span>
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="color:#f0f6fc;">ESP32 WIO - <strong>Unit #${node.unit}</strong> ${nameStr}</span>
                ${connBadge}
              </div>
              <div style="font-size:12px;color:#8b949e;font-weight:400;margin-top:2px;">
                ${statusText} ${verStr} • 📦 ${node.packetsReceived} Pakete empfangen
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <a href="http://${node.ip}" target="_blank" class="btn btn-sm" style="background:#21262d;border:1px solid #30363d;color:#58a6ff;text-decoration:none;" title="Öffnet die ESP32 Konfigurations-Webseite">
              🌐 Web-UI (${node.ip}) ↗️
            </a>
            <button id="btn-autocreate-wio-${node.unit}" class="btn btn-sm btn-save" title="Legt für alle 16 Pins dieses ESP32 automatisch Rückmelder in TrainMaster an">
              ➕ Alle 16 Pins anlegen
            </button>
          </div>
        </div>

        <div style="font-size:12px;color:#8b949e;margin-top:2px;">
          Live-Zustand der 16 Eingänge / Belegtmelder-Pins (Klicke auf einen Pin, um ihn zu konfigurieren):
        </div>
        <div class="wio-pin-grid">
          ${pinsHtml}
        </div>
      </div>
    `;
  }

  private simulateWioPacket(): void {
    const protocol = window.location.protocol;
    const host = window.location.hostname || 'localhost';
    const port = '3001';
    fetch(`${protocol}//${host}:${port}/api/wio/sensor?unit=1&pin=1&state=1&addr=101`)
      .then(() => {
        setTimeout(() => {
          fetch(`${protocol}//${host}:${port}/api/wio/sensor?unit=1&pin=1&state=0&addr=101`);
        }, 1200);
      })
      .catch((err) => console.error('Simulations-Fehler:', err));
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private renderSensors(): void {
    this.container.innerHTML = '';

    if (wsClient.sensors.length === 0) {
      this.container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #8b949e; background: #161b22; border-radius: 8px; border: 1px dashed #30363d;">
          <p style="font-size: 16px; margin-bottom: 12px;">📡 Keine Rückmelder vorhanden.</p>
          <button id="btn-add-sensor-empty" class="btn btn-save">➕ Ersten Rückmelder anlegen</button>
        </div>
      `;
      document.getElementById('btn-add-sensor-empty')?.addEventListener('click', () => this.openModal());
      return;
    }

    for (const sensor of wsClient.sensors) {
      const card = document.createElement('div');
      card.className = `sensor-card ${sensor.active ? 'active' : ''}`;
      card.style.position = 'relative';

      // Header
      const header = document.createElement('div');
      header.className = 'sensor-header';
      header.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:16px;">${sensor.type === 'WIO' ? '📡' : sensor.type === 'DCC_EX' ? '🚂' : '⚡'}</span>
          <div class="sensor-name" style="font-weight:600;color:#f0f6fc;">${sensor.name}</div>
        </div>
        <div class="sensor-badge ${sensor.active ? 'active' : 'free'}">
          ${sensor.active ? '🔴 BELEGT' : '⚪ FREI'}
        </div>
      `;
      card.appendChild(header);

      // Info Details
      const info = document.createElement('div');
      info.style.fontSize = '12px';
      info.style.color = '#8b949e';
      info.style.margin = '8px 0';
      info.style.lineHeight = '1.6';

      let addressText = '';
      if (sensor.type === 'WIO') {
        addressText = `WIO Node: <strong>Unit ${sensor.wioUnit ?? 1}</strong> • Pin: <strong>${sensor.wioPin ?? 1}</strong> (Adr: #${sensor.address})`;
      } else if (sensor.type === 'DCC_EX') {
        addressText = `DCC-EX Sensor-Pin: <strong>#${sensor.address}</strong>`;
      } else {
        addressText = `Adresse: <strong>#${sensor.address}</strong>`;
      }

      let badgesHtml = `<span style="background:#21262d;border:1px solid #30363d;padding:2px 6px;border-radius:4px;font-size:11px;color:#58a6ff;">Typ: ${sensor.type}</span>`;
      if (sensor.inverted) {
        badgesHtml += ` <span style="background:rgba(210,153,34,0.15);border:1px solid rgba(210,153,34,0.4);padding:2px 6px;border-radius:4px;font-size:11px;color:#e3b341;">⚠️ Invertiert</span>`;
      }

      let timeText = 'Noch nie ausgelöst';
      if (sensor.lastTriggered) {
        const secAgo = Math.floor((Date.now() - sensor.lastTriggered) / 1000);
        timeText = secAgo < 60 ? `Vor ${secAgo}s aktiv` : `Vor ${Math.floor(secAgo / 60)}m aktiv`;
      }

      info.innerHTML = `
        <div>${addressText}</div>
        <div style="margin-top:4px;">${badgesHtml}</div>
        <div style="font-size:11px;color:#484f58;margin-top:4px;">⏱️ ${timeText}</div>
      `;
      card.appendChild(info);

      // Button Bar
      const btnBar = document.createElement('div');
      btnBar.style.display = 'flex';
      btnBar.style.gap = '8px';
      btnBar.style.marginTop = '12px';

      // Test Button
      const btnTest = document.createElement('button');
      btnTest.className = 'btn btn-sm';
      btnTest.style.flex = '1';
      btnTest.style.backgroundColor = '#21262d';
      btnTest.style.border = '1px solid #30363d';
      btnTest.style.color = '#f0f6fc';
      btnTest.innerHTML = '⚡ Test-Impuls';
      btnTest.title = 'Löst einen virtuellen Belegt-Impuls auf diesem Kontakt aus';
      btnTest.addEventListener('click', (e) => {
        e.stopPropagation();
        wsClient.send({
          type: 'TRIGGER_SENSOR',
          payload: { sensorId: sensor.id, state: true }
        });
      });
      btnBar.appendChild(btnTest);

      // Edit Button
      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-sm';
      btnEdit.style.backgroundColor = '#161b22';
      btnEdit.style.border = '1px solid #30363d';
      btnEdit.style.color = '#58a6ff';
      btnEdit.innerHTML = '✏️ Edit';
      btnEdit.title = 'Rückmelder konfigurieren (Adresse, WIO-Pin, Typ)';
      btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openModal(sensor);
      });
      btnBar.appendChild(btnEdit);

      card.appendChild(btnBar);
      this.container.appendChild(card);
    }
  }
}
