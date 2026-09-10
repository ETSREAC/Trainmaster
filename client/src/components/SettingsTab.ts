import { AppSettings, CommandStationConfig } from '../types.js';
import { wsClient } from '../wsClient.js';

export class SettingsTab {
  private csTypeSelect = document.getElementById('cs-type-select') as HTMLSelectElement;
  private cfgDccEx = document.getElementById('cfg-dcc-ex') as HTMLElement;
  private cfgZ21 = document.getElementById('cfg-z21') as HTMLElement;

  private dccConnRadios = document.querySelectorAll<HTMLInputElement>('input[name="dcc-conn"]');
  private dccSerialFields = document.getElementById('dcc-serial-fields') as HTMLElement;
  private dccTcpFields = document.getElementById('dcc-tcp-fields') as HTMLElement;

  private dccSerialPort = document.getElementById('dcc-serial-port') as HTMLSelectElement;
  private btnScanPorts = document.getElementById('btn-scan-ports') as HTMLButtonElement;
  private dccBaud = document.getElementById('dcc-baud') as HTMLSelectElement;

  private dccIp = document.getElementById('dcc-ip') as HTMLInputElement;
  private dccPort = document.getElementById('dcc-port') as HTMLInputElement;

  private z21Ip = document.getElementById('z21-ip') as HTMLInputElement;
  private z21Port = document.getElementById('z21-port') as HTMLInputElement;

  private settingScale = document.getElementById('setting-scale') as HTMLSelectElement;
  private settingCreepTime = document.getElementById('setting-creep-time') as HTMLInputElement;
  private settingGhostActive = document.getElementById('setting-ghost-active') as HTMLInputElement;
  private settingManualSensorTrigger = document.getElementById('setting-manual-sensor-trigger') as HTMLInputElement;

  private btnSave = document.getElementById('btn-save-settings') as HTMLButtonElement;

  constructor() {
    this.init();
  }

  private init(): void {
    // Dropdown Zentrale Wechsel
    this.csTypeSelect?.addEventListener('change', () => {
      this.updateVisibility();
    });

    // DCC-EX Schnittstellen-Auswahl (USB vs WiFi)
    this.dccConnRadios.forEach((r) => {
      r.addEventListener('change', () => {
        this.updateDccConnVisibility();
      });
    });

    // COM-Ports scannen
    this.btnScanPorts?.addEventListener('click', () => {
      this.btnScanPorts.textContent = '⏳ Suche...';
      wsClient.send({ type: 'SCAN_SERIAL_PORTS' });
    });

    // Speichern
    this.btnSave?.addEventListener('click', () => {
      this.saveSettings();
    });

    // Auf State-Änderungen hören
    wsClient.subscribe(() => {
      this.populateFromState();
    });

    // Initial befüllen
    this.populateFromState();
  }

  private updateVisibility(): void {
    const val = this.csTypeSelect.value;
    if (this.cfgDccEx) this.cfgDccEx.style.display = val === 'DCC_EX' ? 'block' : 'none';
    if (this.cfgZ21) this.cfgZ21.style.display = val === 'Z21' ? 'block' : 'none';
  }

  private updateDccConnVisibility(): void {
    const isSerial = Array.from(this.dccConnRadios).find((r) => r.checked)?.value === 'SERIAL';
    if (this.dccSerialFields) this.dccSerialFields.style.display = isSerial ? 'block' : 'none';
    if (this.dccTcpFields) this.dccTcpFields.style.display = isSerial ? 'none' : 'block';
  }

  private populateFromState(): void {
    const s = wsClient.settings;
    if (!s) return;

    if (this.csTypeSelect) this.csTypeSelect.value = s.commandStation.type;
    this.updateVisibility();

    // DCC-EX
    this.dccConnRadios.forEach((r) => {
      r.checked = r.value === s.commandStation.connectionType;
    });
    this.updateDccConnVisibility();

    if (this.dccBaud && s.commandStation.baudRate) {
      this.dccBaud.value = `${s.commandStation.baudRate}`;
    }
    if (this.dccIp && s.commandStation.host) {
      this.dccIp.value = s.commandStation.host;
    }
    if (this.dccPort && s.commandStation.port) {
      this.dccPort.value = `${s.commandStation.port}`;
    }

    // Z21
    if (s.commandStation.type === 'Z21') {
      if (this.z21Ip && s.commandStation.host) this.z21Ip.value = s.commandStation.host;
      if (this.z21Port && s.commandStation.port) this.z21Port.value = `${s.commandStation.port}`;
    }

    // COM-Ports aktualisieren falls neue Liste empfangen
    if (wsClient.serialPorts.length > 0 && this.dccSerialPort) {
      this.btnScanPorts.textContent = '🔄 Suchen';
      const currentVal = this.dccSerialPort.value;
      this.dccSerialPort.innerHTML = wsClient.serialPorts
        .map((p) => `<option value="${p.path}">${p.path} (${p.friendlyName || p.manufacturer || 'Unbekannt'})</option>`)
        .join('');
      if (currentVal && wsClient.serialPorts.some((p) => p.path === currentVal)) {
        this.dccSerialPort.value = currentVal;
      }
    }

    // Sonstige Einstellungen
    if (this.settingScale) this.settingScale.value = s.scale;
    if (this.settingCreepTime) this.settingCreepTime.value = `${s.targetCreepMs}`;
    if (this.settingGhostActive) this.settingGhostActive.checked = s.ghostDetectionActive;
    if (this.settingManualSensorTrigger) {
      this.settingManualSensorTrigger.checked = s.manualSensorTriggerInRunMode !== false;
    }

    // WIO Einstellungen
    const wioEnabled = document.getElementById('wio-enabled') as HTMLInputElement | null;
    const wioPort = document.getElementById('wio-port') as HTMLInputElement | null;
    if (wioEnabled) {
      wioEnabled.checked = s.wio?.enabled !== false;
    }
    if (wioPort) {
      wioPort.value = String(s.wio?.udpPort || 8051);
    }
  }

  private saveSettings(): void {
    const csType = this.csTypeSelect.value as 'VIRTUAL' | 'DCC_EX' | 'Z21';
    let connType: 'SERIAL' | 'TCP' | 'UDP' = 'SERIAL';
    let host = '192.168.0.111';
    let port = 21105;
    let serialPort = 'COM3';
    let baudRate = 115200;

    if (csType === 'DCC_EX') {
      const isSerial = Array.from(this.dccConnRadios).find((r) => r.checked)?.value === 'SERIAL';
      connType = isSerial ? 'SERIAL' : 'TCP';
      serialPort = this.dccSerialPort?.value || 'COM3';
      baudRate = parseInt(this.dccBaud?.value || '115200', 10);
      host = this.dccIp?.value || '192.168.4.1';
      port = parseInt(this.dccPort?.value || '2560', 10);
    } else if (csType === 'Z21') {
      connType = 'UDP';
      host = this.z21Ip?.value || '192.168.0.111';
      port = parseInt(this.z21Port?.value || '21105', 10);
    }

    const commandStation: CommandStationConfig = {
      type: csType,
      connectionType: connType,
      serialPort,
      baudRate,
      host,
      port
    };

    const wioEnabled = document.getElementById('wio-enabled') as HTMLInputElement | null;
    const wioPort = document.getElementById('wio-port') as HTMLInputElement | null;

    const newSettings: AppSettings = {
      commandStation,
      wio: {
        enabled: wioEnabled ? wioEnabled.checked : true,
        udpPort: parseInt(wioPort?.value || '8051', 10) || 8051
      },
      scale: (this.settingScale?.value || 'H0') as any,
      targetCreepMs: parseInt(this.settingCreepTime?.value || '1200', 10),
      ghostDetectionActive: !!this.settingGhostActive?.checked,
      manualSensorTriggerInRunMode: !!this.settingManualSensorTrigger?.checked
    };

    wsClient.send({
      type: 'UPDATE_SETTINGS',
      payload: newSettings
    });

    alert('✅ Einstellungen gespeichert! Die Zentrale wird jetzt verbunden...');
  }
}
