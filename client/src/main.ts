import { wsClient } from './wsClient.js';
import { TrackCanvas } from './components/TrackCanvas.js';
import { Throttle, getActiveLoco, cycleActiveLoco } from './components/Throttle.js';
import { SensorMonitor } from './components/SensorMonitor.js';
import { BBTMonitor } from './components/BBTMonitor.js';
import { SettingsTab } from './components/SettingsTab.js';
import { SignalMonitor } from './components/SignalMonitor.js';
import { LayoutInspectorModal } from './components/LayoutInspectorModal.js';
import { TrainDepotDrawer } from './components/TrainDepotDrawer.js';
import { applyTranslationsToDOM, onLanguageChange, t, toggleLanguage } from './i18n.js';
import { iconCommandStation, iconPower, iconAuto, iconEstop } from './icons.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const badgeConnection = document.getElementById('badge-connection');
  const btnPower = document.getElementById('btn-power') as HTMLButtonElement;
  const btnAuto = document.getElementById('btn-auto') as HTMLButtonElement;
  const btnEstop = document.getElementById('btn-estop') as HTMLButtonElement;
  const logConsole = document.getElementById('log-console');
  const btnClearLogs = document.getElementById('btn-clear-logs');

  // Track Canvas & Components
  const trackSvg = document.getElementById('track-svg') as unknown as SVGSVGElement;
  const trackCanvas = new TrackCanvas(trackSvg);
  (window as any).trackCanvas = trackCanvas;

  const depotContainer = document.getElementById('train-depot-container');
  if (depotContainer) {
    const trainDepot = new TrainDepotDrawer(depotContainer);
    (window as any).trainDepot = trainDepot;
  }

  const throttleWrapper = document.getElementById('throttle-wrapper');
  if (throttleWrapper) new Throttle(throttleWrapper);

  const sensorCards = document.getElementById('sensor-cards');
  if (sensorCards) {
    const sensorMonitor = new SensorMonitor(sensorCards);
    (window as any).sensorMonitor = sensorMonitor;
  }

  const signalContent = document.getElementById('signal-manager-content');
  const signalMonitor = new SignalMonitor(signalContent);
  (window as any).signalMonitor = signalMonitor;

  const inspectorModal = new LayoutInspectorModal();
  (window as any).inspectorModal = inspectorModal;

  const bbtTbody = document.getElementById('bbt-tbody');
  if (bbtTbody) new BBTMonitor(bbtTbody);

  new SettingsTab();

  // Language Switcher & i18n
  applyTranslationsToDOM();
  document.getElementById('btn-lang-toggle')?.addEventListener('click', () => {
    toggleLanguage();
    wsClient.notify();
  });
  onLanguageChange(() => {
    wsClient.notify();
  });

  // Tab Switching
  const tabs = document.querySelectorAll<HTMLButtonElement>('.nav-tab');
  const panes = document.querySelectorAll<HTMLElement>('.tab-pane');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = `tab-${tab.dataset.tab}`;
      tabs.forEach((t) => t.classList.remove('active'));
      panes.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  // Editor vs Run Mode
  const btnModeRun = document.getElementById('btn-mode-run');
  const btnModeEdit = document.getElementById('btn-mode-edit');

  btnModeRun?.addEventListener('click', () => {
    btnModeRun.classList.add('active');
    btnModeEdit?.classList.remove('active');
    trackCanvas.setEditMode(false);
  });

  btnModeEdit?.addEventListener('click', () => {
    btnModeEdit.classList.add('active');
    btnModeRun?.classList.remove('active');
    trackCanvas.setEditMode(true);
  });

  // Editor Palette Buttons
  const paletteBtns = document.querySelectorAll<HTMLButtonElement>('.palette-btn');
  paletteBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool as any;
      if (!tool) return;
      paletteBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      trackCanvas.setTool(tool);
    });
  });

  // Gleisplan Speichern & Leeren
  document.getElementById('btn-save-layout')?.addEventListener('click', () => {
    trackCanvas.saveLayout();
  });

  document.getElementById('btn-clear-layout')?.addEventListener('click', () => {
    trackCanvas.clearLayout();
  });

  // Gleisplan-Prüfung & Fahrstraßen-Automatik
  document.getElementById('btn-inspect-layout')?.addEventListener('click', () => {
    inspectorModal.open('diagnose');
  });

  document.getElementById('btn-auto-routes')?.addEventListener('click', () => {
    inspectorModal.open('routes');
  });

  document.getElementById('btn-inspect-layout-palette')?.addEventListener('click', () => {
    inspectorModal.open('diagnose');
  });

  document.getElementById('btn-auto-routes-palette')?.addEventListener('click', () => {
    inspectorModal.open('routes');
  });

  // Zoom-Buttons
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => trackCanvas.zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => trackCanvas.zoomOut());
  document.getElementById('btn-zoom-reset')?.addEventListener('click', () => trackCanvas.zoomReset());

  // Rand erweitern (+Links, +Oben, +Rechts, +Unten)
  document.getElementById('btn-expand-left')?.addEventListener('click', () => trackCanvas.expandGrid('LEFT'));
  document.getElementById('btn-expand-top')?.addEventListener('click', () => trackCanvas.expandGrid('TOP'));
  document.getElementById('btn-expand-right')?.addEventListener('click', () => trackCanvas.expandGrid('RIGHT'));
  document.getElementById('btn-expand-bottom')?.addEventListener('click', () => trackCanvas.expandGrid('BOTTOM'));

  // Track Power Toggle
  const togglePower = () => {
    wsClient.send({
      type: 'SET_POWER',
      payload: { active: !wsClient.status.trackPower }
    });
  };
  btnPower?.addEventListener('click', togglePower);

  // Automatic Mode (Aquarium) Toggle
  btnAuto?.addEventListener('click', () => {
    wsClient.send({
      type: 'TOGGLE_AUTOMATIC_MODE',
      payload: { active: !wsClient.status.automaticMode }
    });
  });

  // Emergency Stop Toggle
  const toggleEstop = () => {
    if (wsClient.status.emergencyStop) {
      wsClient.send({ type: 'RESUME_STOP' });
    } else {
      wsClient.send({ type: 'EMERGENCY_STOP' });
    }
  };

  btnEstop?.addEventListener('click', toggleEstop);

  // --- Globale Tastatur- & Macropad-Steuerung (USB Rotary Knobs & Keypads) ---
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return;
    }

    // Leertaste: NOT-HALT
    if (e.code === 'Space') {
      e.preventDefault();
      toggleEstop();
      return;
    }

    // KeyP: Gleisstrom an/aus
    if (e.code === 'KeyP') {
      e.preventDefault();
      togglePower();
      return;
    }

    const currentLoco = getActiveLoco();
    if (!currentLoco) return;

    // Tab: Nächste Lokomotive auswählen
    if (e.code === 'Tab') {
      e.preventDefault();
      cycleActiveLoco();
      return;
    }

    // PageUp / ArrowUp / KeyW / Plus / Equal: Geschwindigkeit erhöhen (+5 Fahrstufen)
    if (e.code === 'PageUp' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'BracketRight' || e.code === 'NumpadAdd') {
      e.preventDefault();
      const newSpeed = Math.min(128, currentLoco.speed + 5);
      wsClient.send({
        type: 'SET_LOCO_SPEED',
        payload: { locoId: currentLoco.id, speed: newSpeed }
      });
      return;
    }

    // PageDown / ArrowDown / KeyS / Minus / Slash: Geschwindigkeit verringern (-5 Fahrstufen)
    if (e.code === 'PageDown' || e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Slash' || e.code === 'NumpadSubtract') {
      e.preventDefault();
      const newSpeed = Math.max(0, currentLoco.speed - 5);
      wsClient.send({
        type: 'SET_LOCO_SPEED',
        payload: { locoId: currentLoco.id, speed: newSpeed }
      });
      return;
    }

    // Home / KeyX: Soforthalt (0)
    if (e.code === 'Home' || e.code === 'KeyX') {
      e.preventDefault();
      wsClient.send({
        type: 'SET_LOCO_SPEED',
        payload: { locoId: currentLoco.id, speed: 0 }
      });
      return;
    }

    // KeyR: Richtung umkehren (FWD <-> REV)
    if (e.code === 'KeyR') {
      e.preventDefault();
      const newDir = currentLoco.direction === 'FWD' ? 'REV' : 'FWD';
      wsClient.send({
        type: 'SET_LOCO_SPEED',
        payload: { locoId: currentLoco.id, speed: currentLoco.speed, direction: newDir }
      });
      return;
    }

    // KeyL oder Digit0: F0 (Licht)
    if (e.code === 'KeyL' || e.code === 'Digit0' || e.code === 'Numpad0') {
      e.preventDefault();
      const curState = !!currentLoco.functions?.[0];
      wsClient.send({
        type: 'SET_LOCO_FUNCTION',
        payload: { locoId: currentLoco.id, functionIndex: 0, active: !curState }
      });
      return;
    }

    // Digit1 .. Digit9 / Numpad1 .. Numpad9: F1 .. F9
    let num = -1;
    if (e.code.startsWith('Digit')) num = parseInt(e.code.replace('Digit', ''), 10);
    else if (e.code.startsWith('Numpad')) num = parseInt(e.code.replace('Numpad', ''), 10);

    if (!isNaN(num) && num >= 1 && num <= 9) {
      e.preventDefault();
      const curState = !!currentLoco.functions?.[num];
      wsClient.send({
        type: 'SET_LOCO_FUNCTION',
        payload: { locoId: currentLoco.id, functionIndex: num, active: !curState }
      });
      return;
    }
  });

  // Clear Logs
  btnClearLogs?.addEventListener('click', () => {
    wsClient.status.log = [];
    if (logConsole) logConsole.innerHTML = '';
  });

  // Update Header & UI on State Change
  wsClient.subscribe(() => {
    // Connection Badge
    if (badgeConnection) {
      if (wsClient.status.connected) {
        badgeConnection.innerHTML = `<span class="indicator green"></span> <span class="text">${t('status.connected')}</span>`;
      } else {
        badgeConnection.innerHTML = `<span class="indicator red"></span> <span class="text">${t('status.disconnected')}</span>`;
      }
    }

    // CS Badge
    const badgeCs = document.getElementById('badge-cs');
    if (badgeCs) {
      const csType = wsClient.status.commandStationType;
      let label = 'Simulator';
      if (csType === 'DCC_EX') label = 'DCC-EX';
      if (csType === 'Z21') label = 'Roco Z21';
      badgeCs.innerHTML = `<span class="icon">${iconCommandStation(16)}</span> <span class="text">${label}</span>`;
    }

    // Power Button
    if (btnPower) {
      if (wsClient.status.trackPower) {
        btnPower.className = 'btn btn-power on';
        btnPower.innerHTML = `<span class="icon">${iconPower(true, 18)}</span> <span class="text">${t('status.power_on')}</span>`;
      } else {
        btnPower.className = 'btn btn-power';
        btnPower.innerHTML = `<span class="icon">${iconPower(false, 18)}</span> <span class="text">${t('status.power_off')}</span>`;
      }
    }

    // Auto Button
    if (btnAuto) {
      if (wsClient.status.automaticMode) {
        btnAuto.className = 'btn btn-auto active';
        btnAuto.innerHTML = `<span class="icon">${iconAuto(true, 18)}</span> <span class="text">${t('status.auto_on')}</span>`;
      } else {
        btnAuto.className = 'btn btn-auto';
        btnAuto.innerHTML = `<span class="icon">${iconAuto(false, 18)}</span> <span class="text">${t('status.auto_off')}</span>`;
      }
    }

    // E-Stop Button
    if (btnEstop) {
      if (wsClient.status.emergencyStop) {
        btnEstop.className = 'btn btn-estop active';
        btnEstop.innerHTML = `<span class="icon">${iconEstop(true, 18)}</span> <span class="text">${t('status.estop')}</span>`;
      } else {
        btnEstop.className = 'btn btn-estop';
        btnEstop.innerHTML = `<span class="icon">${iconEstop(false, 18)}</span> <span class="text">${t('status.estop')}</span>`;
      }
    }

    // Live Logs
    if (logConsole) {
      const currentCount = logConsole.childElementCount;
      if (currentCount !== wsClient.status.log.length) {
        logConsole.innerHTML = wsClient.status.log
          .map((line) => {
            let cls = 'log-entry';
            if (line.includes('[WARN]')) cls += ' warn';
            if (line.includes('[ERROR]') || line.includes('NOTHALT') || line.includes('GEISTERZUG')) cls += ' error';
            return `<div class="${cls}">${line}</div>`;
          })
          .join('');
        logConsole.scrollTop = logConsole.scrollHeight;
      }
    }
  });
});
