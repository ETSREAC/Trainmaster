import { AppSettings, CommandStationConfig } from '../types.js';
import { wsClient } from '../wsClient.js';
import { iconSearch } from '../icons.js';

export class SettingsTab {
  private csTypeSelect = document.getElementById('cs-type-select') as HTMLSelectElement;
  private cfgDccEx = document.getElementById('cfg-dcc-ex') as HTMLElement;
  private cfgZ21 = document.getElementById('cfg-z21') as HTMLElement;

  private dccConnRadios = document.querySelectorAll<HTMLInputElement>('input[name="dcc-conn"]');
  private dccSerialFields = document.getElementById('dcc-serial-fields') as HTMLElement;
  private dccTcpFields = document.getElementById('dcc-tcp-fields') as HTMLElement;

  private dccSerialPort = document.getElementById('dcc-serial-port') as HTMLInputElement;
  private dccSerialPortList = document.getElementById('dcc-serial-port-list') as HTMLDataListElement | null;
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

  private isDirty = false;
  private lastSettingsJson = '';

  constructor() {
    this.init();
  }

  private init(): void {
    // Dirty-Tracking bei Nutzereingaben, damit Hintergrund-Updates Eingaben nicht plätten
    const settingsPanel = document.getElementById('tab-settings');
    settingsPanel?.addEventListener('input', () => {
      this.isDirty = true;
    });
    settingsPanel?.addEventListener('change', () => {
      this.isDirty = true;
    });

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
      this.btnScanPorts.innerHTML = `${iconSearch(14)} Scanne...`;
      this.btnScanPorts.disabled = true;
      wsClient.send({ type: 'SCAN_SERIAL_PORTS' });
      setTimeout(() => {
        this.btnScanPorts.innerHTML = `${iconSearch(14)} Suchen`;
        this.btnScanPorts.disabled = false;
      }, 1500);
    });

    // Speichern
    this.btnSave?.addEventListener('click', () => {
      this.saveSettings();
    });

    // Bei Updates der Settings vom Server
    wsClient.subscribe(() => {
      this.populateFromState();
    });

    // Initial befüllen
    this.populateFromState(true);
  }

  private updateVisibility(): void {
    const val = this.csTypeSelect?.value;
    if (this.cfgDccEx) this.cfgDccEx.style.display = val === 'DCC_EX' ? 'block' : 'none';
    if (this.cfgZ21) this.cfgZ21.style.display = val === 'Z21' ? 'block' : 'none';
  }

  private updateDccConnVisibility(): void {
    const isSerial = Array.from(this.dccConnRadios).find((r) => r.checked)?.value === 'SERIAL';
    if (this.dccSerialFields) this.dccSerialFields.style.display = isSerial ? 'block' : 'none';
    if (this.dccTcpFields) this.dccTcpFields.style.display = isSerial ? 'none' : 'block';
  }

  private isElementFocused(el: HTMLElement | null): boolean {
    return !!el && document.activeElement === el;
  }

  private updateSerialPortsDatalist(): void {
    if (this.dccSerialPortList) {
      const options: string[] = [];
      if (wsClient.serialPorts.length > 0) {
        for (const p of wsClient.serialPorts) {
          options.push(`<option value="${p.path}">${p.path} (${p.friendlyName || p.manufacturer || 'Erkannt'})</option>`);
        }
      }
      const defaults = ['COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', '/dev/ttyUSB0', '/dev/ttyACM0'];
      for (const def of defaults) {
        if (!options.some((o) => o.includes(`value="${def}"`))) {
          options.push(`<option value="${def}">${def}</option>`);
        }
      }
      this.dccSerialPortList.innerHTML = options.join('');
    }

    if (this.btnScanPorts && wsClient.serialPorts.length > 0) {
      this.btnScanPorts.innerHTML = `${iconSearch(14)} Suchen`;
    }
  }

  private populateFromState(force = false): void {
    const s = wsClient.settings;
    if (!s) return;

    const currentJson = JSON.stringify(s);
    const settingsChanged = currentJson !== this.lastSettingsJson;
    this.lastSettingsJson = currentJson;

    // Datalist für COM-Ports immer aktualisieren wenn Ports gescannt wurden
    this.updateSerialPortsDatalist();

    // Wenn der Nutzer gerade editiert und keine erzwungene Aktualisierung vorliegt,
    // überschreiben wir die Formularfelder NICHT.
    if (this.isDirty && !force) {
      return;
    }

    // Wenn sich die Settings nicht geändert haben und es nicht force ist, nichts tun
    if (!settingsChanged && !force) {
      return;
    }

    if (this.csTypeSelect && !this.isElementFocused(this.csTypeSelect)) {
      this.csTypeSelect.value = s.commandStation.type;
    }
    this.updateVisibility();

    // DCC-EX Schnittstellen Radios
    const isAnyRadioFocused = Array.from(this.dccConnRadios).some((r) => this.isElementFocused(r));
    if (!isAnyRadioFocused) {
      this.dccConnRadios.forEach((r) => {
        r.checked = r.value === s.commandStation.connectionType;
      });
      this.updateDccConnVisibility();
    }

    // COM-Port (Serial)
    if (this.dccSerialPort && !this.isElementFocused(this.dccSerialPort)) {
      if (s.commandStation.serialPort) {
        this.dccSerialPort.value = s.commandStation.serialPort;
      } else if (!this.dccSerialPort.value) {
        this.dccSerialPort.value = 'COM3';
      }
    }

    if (this.dccBaud && !this.isElementFocused(this.dccBaud) && s.commandStation.baudRate) {
      this.dccBaud.value = `${s.commandStation.baudRate}`;
    }
    if (this.dccIp && !this.isElementFocused(this.dccIp) && s.commandStation.host) {
      this.dccIp.value = s.commandStation.host;
    }
    if (this.dccPort && !this.isElementFocused(this.dccPort) && s.commandStation.port) {
      this.dccPort.value = `${s.commandStation.port}`;
    }

    // Z21
    if (s.commandStation.type === 'Z21') {
      if (this.z21Ip && !this.isElementFocused(this.z21Ip) && s.commandStation.host) {
        this.z21Ip.value = s.commandStation.host;
      }
      if (this.z21Port && !this.isElementFocused(this.z21Port) && s.commandStation.port) {
        this.z21Port.value = `${s.commandStation.port}`;
      }
    }

    // Sonstige Einstellungen
    if (this.settingScale && !this.isElementFocused(this.settingScale)) {
      this.settingScale.value = s.scale;
    }
    if (this.settingCreepTime && !this.isElementFocused(this.settingCreepTime)) {
      this.settingCreepTime.value = `${s.targetCreepMs}`;
    }
    if (this.settingGhostActive && !this.isElementFocused(this.settingGhostActive)) {
      this.settingGhostActive.checked = s.ghostDetectionActive;
    }
    if (this.settingManualSensorTrigger && !this.isElementFocused(this.settingManualSensorTrigger)) {
      this.settingManualSensorTrigger.checked = s.manualSensorTriggerInRunMode !== false;
    }

    // WIO Einstellungen
    const wioEnabled = document.getElementById('wio-enabled') as HTMLInputElement | null;
    const wioPort = document.getElementById('wio-port') as HTMLInputElement | null;
    if (wioEnabled && !this.isElementFocused(wioEnabled)) {
      wioEnabled.checked = s.wio?.enabled !== false;
    }
    if (wioPort && !this.isElementFocused(wioPort)) {
      wioPort.value = String(s.wio?.udpPort || 8051);
    }
  }

  private saveSettings(): void {
    const csType = (this.csTypeSelect?.value || 'VIRTUAL') as 'VIRTUAL' | 'DCC_EX' | 'Z21';
    let connType: 'SERIAL' | 'TCP' | 'UDP' = 'SERIAL';
    let host = '192.168.0.111';
    let port = 21105;
    let serialPort = 'COM3';
    let baudRate = 115200;

    if (csType === 'DCC_EX') {
      const isSerial = Array.from(this.dccConnRadios).find((r) => r.checked)?.value === 'SERIAL';
      connType = isSerial ? 'SERIAL' : 'TCP';
      serialPort = this.dccSerialPort?.value.trim() || 'COM3';
      baudRate = parseInt(this.dccBaud?.value || '115200', 10) || 115200;
      host = this.dccIp?.value.trim() || '192.168.4.1';
      const parsedPort = parseInt(this.dccPort?.value || '2560', 10);
      port = isNaN(parsedPort) ? 2560 : parsedPort;
    } else if (csType === 'Z21') {
      connType = 'UDP';
      host = this.z21Ip?.value.trim() || '192.168.0.111';
      const parsedPort = parseInt(this.z21Port?.value || '21105', 10);
      port = isNaN(parsedPort) ? 21105 : parsedPort;
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

    this.isDirty = false;
    this.lastSettingsJson = JSON.stringify(newSettings);

    wsClient.send({
      type: 'UPDATE_SETTINGS',
      payload: newSettings
    });

    alert('Einstellungen gespeichert! Die Zentrale wird jetzt verbunden...');
  }
}
