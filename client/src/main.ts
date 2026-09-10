import { wsClient } from './wsClient.js';
import { TrackCanvas } from './components/TrackCanvas.js';
import { Throttle } from './components/Throttle.js';
import { SensorMonitor } from './components/SensorMonitor.js';
import { BBTMonitor } from './components/BBTMonitor.js';
import { SettingsTab } from './components/SettingsTab.js';
import { SignalMonitor } from './components/SignalMonitor.js';
import { LayoutInspectorModal } from './components/LayoutInspectorModal.js';
import { TrainDepotDrawer } from './components/TrainDepotDrawer.js';

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
  btnPower?.addEventListener('click', () => {
    wsClient.send({
      type: 'SET_POWER',
      payload: { active: !wsClient.status.trackPower }
    });
  });

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

  // Spacebar Hotkey für NOT-HALT
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
      e.preventDefault();
      toggleEstop();
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
        badgeConnection.innerHTML = '<span class="indicator green"></span> <span class="text">Verbunden</span>';
      } else {
        badgeConnection.innerHTML = '<span class="indicator red"></span> <span class="text">Getrennt</span>';
      }
    }

    // CS Badge
    const badgeCs = document.getElementById('badge-cs');
    if (badgeCs) {
      const csType = wsClient.status.commandStationType;
      let label = 'Simulator';
      if (csType === 'DCC_EX') label = 'DCC-EX';
      if (csType === 'Z21') label = 'Roco Z21';
      badgeCs.innerHTML = `<span class="icon">🔌</span> <span class="text">${label}</span>`;
    }

    // Power Button
    if (btnPower) {
      if (wsClient.status.trackPower) {
        btnPower.className = 'btn btn-power on';
        btnPower.innerHTML = '<span class="icon">⚡</span> <span class="text">Gleisstrom EIN</span>';
      } else {
        btnPower.className = 'btn btn-power';
        btnPower.innerHTML = '<span class="icon">🔌</span> <span class="text">Gleisstrom AUS</span>';
      }
    }

    // Auto Button
    if (btnAuto) {
      if (wsClient.status.automaticMode) {
        btnAuto.className = 'btn btn-auto active';
        btnAuto.innerHTML = '<span class="icon">🔄</span> <span class="text">Automatik: AKTIV</span>';
      } else {
        btnAuto.className = 'btn btn-auto';
        btnAuto.innerHTML = '<span class="icon">🔄</span> <span class="text">Automatik: AUS</span>';
      }
    }

    // E-Stop Button
    if (btnEstop) {
      if (wsClient.status.emergencyStop) {
        btnEstop.className = 'btn btn-estop active';
        btnEstop.innerHTML = '<span class="icon">⚠️</span> <span class="text">NOT-HALT AKTIV! [Space]</span>';
      } else {
        btnEstop.className = 'btn btn-estop';
        btnEstop.innerHTML = '<span class="icon">🛑</span> <span class="text">NOT-HALT [Space]</span>';
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
