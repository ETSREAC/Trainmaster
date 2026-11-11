import { AppSettings, CommandStationConfig } from '../types.js';
import { wsClient } from '../wsClient.js';
import { iconSearch } from '../icons.js';
import { escapeAttr, escapeHtml } from '../sanitize.js';
import { getLanguage, setLanguage, onLanguageChange, Language, t } from '../i18n.js';

export class SettingsTab {
  private settingLanguage = document.getElementById('setting-language') as HTMLSelectElement | null;

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
    settingsPanel?.addEventListener('input', (e) => {
      if ((e.target as HTMLElement)?.id === 'setting-language') return;
      this.isDirty = true;
    });
    settingsPanel?.addEventListener('change', (e) => {
      if ((e.target as HTMLElement)?.id === 'setting-language') return;
      this.isDirty = true;
    });

    // Sprachauswahl Dropdown
    if (this.settingLanguage) {
      this.settingLanguage.value = getLanguage();
      this.settingLanguage.addEventListener('change', () => {
        const lang = (this.settingLanguage?.value || 'de') as Language;
        setLanguage(lang);
        wsClient.notify();
      });
    }

    onLanguageChange((lang) => {
      if (this.settingLanguage && this.settingLanguage.value !== lang) {
        this.settingLanguage.value = lang;
      }
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
      this.btnScanPorts.innerHTML = `${iconSearch(14)} ${t('settings.btn_scanning')}`;
      this.btnScanPorts.disabled = true;
      wsClient.send({ type: 'SCAN_SERIAL_PORTS' });
      setTimeout(() => {
        this.btnScanPorts.innerHTML = `${iconSearch(14)} ${t('settings.btn_scan')}`;
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
          options.push(`<option value="${escapeAttr(p.path)}">${escapeHtml(p.path)} (${escapeHtml(p.friendlyName || p.manufacturer || 'Erkannt')})</option>`);
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
    // Angaben je Zentralentyp: gemerkte Werte bevorzugen, sonst die aktiven (wenn der Typ passt)
    const cs = s.commandStation;
    const dccConn = cs.dccConnectionType || (cs.connectionType === 'TCP' && cs.type !== 'Z21' ? 'TCP' : 'SERIAL');
    const dccHost = cs.dccHost || (cs.type !== 'Z21' ? cs.host : undefined);
    const dccPortVal = cs.dccPort || (cs.type !== 'Z21' ? cs.port : undefined);
    const z21Host = cs.z21Host || (cs.type === 'Z21' ? cs.host : undefined);
    const z21PortVal = cs.z21Port || (cs.type === 'Z21' ? cs.port : undefined);

    const isAnyRadioFocused = Array.from(this.dccConnRadios).some((r) => this.isElementFocused(r));
    if (!isAnyRadioFocused) {
      this.dccConnRadios.forEach((r) => {
        r.checked = r.value === dccConn;
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
    if (this.dccIp && !this.isElementFocused(this.dccIp) && dccHost) {
      this.dccIp.value = dccHost;
    }
    if (this.dccPort && !this.isElementFocused(this.dccPort) && dccPortVal) {
      this.dccPort.value = `${dccPortVal}`;
    }

    // Z21
    if (this.z21Ip && !this.isElementFocused(this.z21Ip) && z21Host) {
      this.z21Ip.value = z21Host;
    }
    if (this.z21Port && !this.isElementFocused(this.z21Port) && z21PortVal) {
      this.z21Port.value = `${z21PortVal}`;
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
    // Sprache Dropdown synchronisieren
    if (this.settingLanguage && !this.isElementFocused(this.settingLanguage)) {
      this.settingLanguage.value = getLanguage();
    }
  }

  private saveSettings(): void {
    const csType = (this.csTypeSelect?.value || 'VIRTUAL') as 'VIRTUAL' | 'DCC_EX' | 'Z21';
    const prev: Partial<CommandStationConfig> = wsClient.settings?.commandStation || {};
    const portOf = (el: HTMLInputElement | null, fallback: number): number => {
      const n = parseInt(el?.value || '', 10);
      return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
    };

    // Die Angaben beider Zentralentypen werden immer mitgespeichert. Früher teilten sich
    // DCC-EX und Z21 die Felder host/port: ein Wechsel auf "Simulator" oder "Z21" hat die
    // DCC-EX-Adresse mit Standardwerten überschrieben.
    const dccConnectionType: 'SERIAL' | 'TCP' =
      Array.from(this.dccConnRadios).find((r) => r.checked)?.value === 'TCP' ? 'TCP' : 'SERIAL';
    const serialPort = this.dccSerialPort?.value.trim() || prev.serialPort || 'COM3';
    const baudRate = parseInt(this.dccBaud?.value || '', 10) || prev.baudRate || 115200;
    const dccHost = this.dccIp?.value.trim() || prev.dccHost || '192.168.4.1';
    const dccPort = portOf(this.dccPort, prev.dccPort || 2560);
    const z21Host = this.z21Ip?.value.trim() || prev.z21Host || '192.168.0.111';
    const z21Port = portOf(this.z21Port, prev.z21Port || 21105);

    // Aktive Verbindung: host/port/connectionType gelten für den gewählten Typ
    let connType: 'SERIAL' | 'TCP' | 'UDP' = prev.connectionType || 'SERIAL';
    let host = prev.host || dccHost;
    let port = prev.port || dccPort;
    if (csType === 'DCC_EX') {
      connType = dccConnectionType;
      host = dccHost;
      port = dccPort;
    } else if (csType === 'Z21') {
      connType = 'UDP';
      host = z21Host;
      port = z21Port;
    }

    const commandStation: CommandStationConfig = {
      type: csType,
      connectionType: connType,
      serialPort,
      baudRate,
      host,
      port,
      dccConnectionType,
      dccHost,
      dccPort,
      z21Host,
      z21Port
    };

    const wioEnabled = document.getElementById('wio-enabled') as HTMLInputElement | null;
    const wioPort = document.getElementById('wio-port') as HTMLInputElement | null;

    // CR-15: Nicht hier bearbeitete Bereiche (z. B. ambientLighting) unverändert übernehmen
    const newSettings: AppSettings = {
      ...wsClient.settings,
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

    alert(t('settings.saved_alert'));
  }
}
