/**
 * TrainMaster Custom SVG Vector Icons
 * Exakt abgestimmt auf das Cyber-Neon-Design des neuen TrainMaster Logos:
 * 2px Stroke, abgerundete Linien (round), Skalierbarkeit via currentColor.
 */

export interface IconOptions {
  size?: number;
  className?: string;
  color?: string;
}

function svg(paths: string, size = 18, className = '', color = ''): string {
  const colorAttr = color ? ` style="color:${color};"` : '';
  return `<svg class="svg-icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${colorAttr}>${paths}</svg>`;
}

// ⚡ Gleisstrom / Power
export function iconPower(active = true, size = 18): string {
  const col = active ? '#38bdf8' : '#8b949e';
  return svg(
    `<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`,
    size,
    active ? 'icon-power active' : 'icon-power',
    col
  );
}

// 🛑 Not-Aus / E-Stop (Achteckiges Nothalt-Symbol)
export function iconEstop(active = false, size = 18): string {
  const col = active ? '#ffffff' : '#f85149';
  return svg(
    `<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
     <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/>`,
    size,
    active ? 'icon-estop active' : 'icon-estop',
    col
  );
}

// 🔄 Automatik-Modus / Loop (Pfeile im Stil des Logos)
export function iconAuto(active = false, size = 18): string {
  const col = active ? '#4ade80' : '#8b949e';
  return svg(
    `<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
     <path d="M3 3v5h5"/>
     <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
     <path d="M16 21h5v-5"/>`,
    size,
    active ? 'icon-auto active' : 'icon-auto',
    col
  );
}

// 🔌 Zentrale / Hardware (DCC-EX, Z21, WIO)
export function iconCommandStation(size = 18, color = '#38bdf8'): string {
  return svg(
    `<rect x="4" y="4" width="16" height="16" rx="3"/>
     <path d="M9 9h6"/>
     <path d="M9 13h6"/>
     <path d="M9 17h3"/>
     <circle cx="9" cy="4" r="1" fill="currentColor"/>
     <circle cx="15" cy="4" r="1" fill="currentColor"/>
     <circle cx="9" cy="20" r="1" fill="currentColor"/>
     <circle cx="15" cy="20" r="1" fill="currentColor"/>`,
    size,
    'icon-cs',
    color
  );
}

// 🗺️ Gleisplan & Stellwerk (Verzweigende Weichengleise im Stil des Logos)
export function iconLayout(size = 18): string {
  return svg(
    `<path d="M3 19h18"/>
     <path d="M3 5h6a6 6 0 0 1 6 6v8"/>
     <circle cx="6" cy="19" r="1.5" fill="currentColor"/>
     <circle cx="15" cy="19" r="1.5" fill="currentColor"/>
     <circle cx="6" cy="5" r="1.5" fill="currentColor"/>`,
    size,
    'icon-nav-layout'
  );
}

// 🎛️ Handregler / Throttle (Tacho & Schieberegler)
export function iconThrottle(size = 18): string {
  return svg(
    `<path d="M12 2v4"/>
     <path d="M12 18v4"/>
     <path d="M4.93 4.93l2.83 2.83"/>
     <path d="M16.24 16.24l2.83 2.83"/>
     <path d="M2 12h4"/>
     <path d="M18 12h4"/>
     <circle cx="12" cy="12" r="4"/>`,
    size,
    'icon-nav-throttle'
  );
}

// ⏱️ BBT Bremsrechner (Präzisions-Timer)
export function iconBbt(size = 18): string {
  return svg(
    `<circle cx="12" cy="14" r="8"/>
     <path d="M12 10v4l3 2"/>
     <path d="M10 2h4"/>
     <path d="M12 2v4"/>`,
    size,
    'icon-nav-bbt'
  );
}

// 🚦 Signale (Signalmast mit zwei Linsen)
export function iconSignal(size = 18): string {
  return svg(
    `<rect x="8" y="2" width="8" height="15" rx="4"/>
     <circle cx="12" cy="6.5" r="1.75" fill="currentColor"/>
     <circle cx="12" cy="12.5" r="1.75" fill="currentColor"/>
     <line x1="12" y1="17" x2="12" y2="22"/>
     <line x1="8" y1="22" x2="16" y2="22"/>`,
    size,
    'icon-nav-signal'
  );
}

// ⚡ Rückmelder & Sensoren (Gleis-Sensor / Kontakt)
export function iconSensor(size = 18): string {
  return svg(
    `<path d="M4 19h16"/>
     <path d="M4 15h16"/>
     <circle cx="12" cy="8" r="4"/>
     <line x1="12" y1="12" x2="12" y2="15"/>`,
    size,
    'icon-nav-sensor'
  );
}

// 🔀 Weichen-Matrix (Abzweigende Pfeile wie im Logo)
export function iconTurnouts(size = 18): string {
  return svg(
    `<path d="M3 18h6a4 4 0 0 0 4-4V6"/>
     <path d="M3 6h6a4 4 0 0 1 4 4v8"/>
     <path d="M18 9l3-3-3-3"/>
     <path d="M18 21l3-3-3-3"/>
     <path d="M13 6h8"/>
     <path d="M13 18h8"/>`,
    size,
    'icon-nav-turnouts'
  );
}

// 🚂 Fuhrpark & Loks (Aerodynamische Lokfront aus dem Logo)
export function iconLocos(size = 18): string {
  return svg(
    `<path d="M4 15c0-4.5 3-9 10-9h4a2 2 0 0 1 2 2v7H4z"/>
     <path d="M14 9h4v3h-4z"/>
     <circle cx="7" cy="18" r="2"/>
     <circle cx="17" cy="18" r="2"/>
     <line x1="2" y1="18" x2="5" y2="18"/>
     <line x1="9" y1="18" x2="15" y2="18"/>
     <line x1="19" y1="18" x2="22" y2="18"/>`,
    size,
    'icon-nav-locos'
  );
}

// 🧭 Fahrstraßen / Routen
export function iconRoutes(size = 18): string {
  return svg(
    `<circle cx="5" cy="19" r="2"/>
     <circle cx="19" cy="5" r="2"/>
     <path d="M5 17V9a4 4 0 0 1 4-4h8"/>
     <path d="M15 2l3 3-3 3"/>`,
    size,
    'icon-nav-routes'
  );
}

// ⚙️ Einstellungen / Settings
export function iconSettings(size = 18): string {
  return svg(
    `<circle cx="12" cy="12" r="3"/>
     <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
    size,
    'icon-nav-settings'
  );
}

// 📜 System-Logs / Console
export function iconLogs(size = 18): string {
  return svg(
    `<rect x="3" y="4" width="18" height="16" rx="3"/>
     <path d="M7 9l3 3-3 3"/>
     <path d="M13 15h4"/>`,
    size,
    'icon-nav-logs'
  );
}

// ✏️ Editieren / Stift
export function iconEdit(size = 16): string {
  return svg(
    `<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>`,
    size,
    'icon-edit'
  );
}

// 🗑️ Löschen / Trash
export function iconTrash(size = 16): string {
  return svg(
    `<polyline points="3 6 5 6 21 6"/>
     <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
     <line x1="10" y1="11" x2="10" y2="17"/>
     <line x1="14" y1="11" x2="14" y2="17"/>`,
    size,
    'icon-trash'
  );
}

// ➕ Plus / Hinzufügen
export function iconPlus(size = 16): string {
  return svg(`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`, size, 'icon-plus');
}

// ➖ Minus / Verkleinern
export function iconMinus(size = 16): string {
  return svg(`<line x1="5" y1="12" x2="19" y2="12"/>`, size, 'icon-minus');
}

// 🔍 Zoom In
export function iconZoomIn(size = 16): string {
  return svg(
    `<circle cx="11" cy="11" r="8"/>
     <line x1="21" y1="21" x2="16.65" y2="16.65"/>
     <line x1="11" y1="8" x2="11" y2="14"/>
     <line x1="8" y1="11" x2="14" y2="11"/>`,
    size,
    'icon-zoom-in'
  );
}

// 🔍 Zoom Out
export function iconZoomOut(size = 16): string {
  return svg(
    `<circle cx="11" cy="11" r="8"/>
     <line x1="21" y1="21" x2="16.65" y2="16.65"/>
     <line x1="8" y1="11" x2="14" y2="11"/>`,
    size,
    'icon-zoom-out'
  );
}

// 🎯 Zoom Reset
export function iconZoomReset(size = 16): string {
  return svg(
    `<circle cx="12" cy="12" r="9"/>
     <circle cx="12" cy="12" r="3"/>
     <line x1="12" y1="3" x2="12" y2="6"/>
     <line x1="12" y1="18" x2="12" y2="21"/>
     <line x1="3" y1="12" x2="6" y2="12"/>
     <line x1="18" y1="12" x2="21" y2="12"/>`,
    size,
    'icon-zoom-reset'
  );
}

// 🕹️ Fahrbetrieb (Controller)
export function iconModeRun(size = 16): string {
  return svg(
    `<line x1="6" y1="12" x2="10" y2="12"/>
     <line x1="8" y1="10" x2="8" y2="14"/>
     <line x1="15" y1="13" x2="15.01" y2="13"/>
     <line x1="18" y1="11" x2="18.01" y2="11"/>
     <rect x="2" y="6" width="20" height="12" rx="6"/>`,
    size,
    'icon-mode-run'
  );
}

// ✏️ Editor Modus
export function iconModeEdit(size = 16): string {
  return svg(
    `<path d="M12 20h9"/>
     <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>`,
    size,
    'icon-mode-edit'
  );
}

// 💾 Speichern
export function iconSave(size = 16): string {
  return svg(
    `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
     <polyline points="17 21 17 13 7 13 7 21"/>
     <polyline points="7 3 7 8 15 8"/>`,
    size,
    'icon-save'
  );
}

// 🔄 Drehen 90°
export function iconRotate(size = 16): string {
  return svg(
    `<path d="M21.5 2v6h-6"/>
     <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l6.23-6.19"/>`,
    size,
    'icon-rotate'
  );
}

// ⚡ Diagnose & Prüfung
export function iconInspect(size = 16): string {
  return svg(
    `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
     <polyline points="9 12 11 14 15 10"/>`,
    size,
    'icon-inspect'
  );
}

// 💡 Lampe / Tipp
export function iconLightbulb(size = 16): string {
  return svg(
    `<line x1="9" y1="18" x2="15" y2="18"/>
     <line x1="10" y1="22" x2="14" y2="22"/>
     <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5h6.18z"/>`,
    size,
    'icon-bulb'
  );
}

// 🌐 Globus / Sprache
export function iconGlobe(size = 16): string {
  return svg(
    `<circle cx="12" cy="12" r="10"/>
     <line x1="2" y1="12" x2="22" y2="12"/>
     <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`,
    size,
    'icon-globe'
  );
}

// 📡 WIO / Funk / Radio / ESP
export function iconRadio(size = 16): string {
  return svg(
    `<path d="M4.93 19.07A10 10 0 0 1 12 16a10 10 0 0 1 7.07 3.07"/>
     <path d="M7.76 16.24A6 6 0 0 1 12 15a6 6 0 0 1 4.24 1.24"/>
     <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
     <path d="M12 2v10"/>
     <path d="M8 5l4-3 4 3"/>`,
    size,
    'icon-radio'
  );
}

// 🔍 Search / Scan
export function iconSearch(size = 16): string {
  return svg(
    `<circle cx="11" cy="11" r="8"/>
     <line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
    size,
    'icon-search'
  );
}

// 🔒 Lock / Block-Verriegelung
export function iconLock(size = 14): string {
  return svg(
    `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
     <path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
    size,
    'icon-lock'
  );
}

// ⚠️ Warning / Alert
export function iconAlert(size = 16, color = '#e3b341'): string {
  return svg(
    `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
     <line x1="12" y1="9" x2="12" y2="13"/>
     <line x1="12" y1="17" x2="12.01" y2="17"/>`,
    size,
    'icon-alert',
    color
  );
}

// 🎯 Target / Platzieren
export function iconTarget(size = 16): string {
  return svg(
    `<circle cx="12" cy="12" r="10"/>
     <circle cx="12" cy="12" r="6"/>
     <circle cx="12" cy="12" r="2" fill="currentColor"/>`,
    size,
    'icon-target'
  );
}

// 📍 Pin / Standort
export function iconPin(size = 14): string {
  return svg(
    `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
     <circle cx="12" cy="10" r="3"/>`,
    size,
    'icon-pin'
  );
}

// 🚅 Highspeed Zug (Aerodynamischer Zug)
export function iconTrainHighspeed(size = 16): string {
  return svg(
    `<path d="M4 17l1.5-7C6 6.5 9 5 16 5h4a2 2 0 0 1 2 2v10H4z"/>
     <line x1="2" y1="19" x2="22" y2="19"/>
     <circle cx="8" cy="16" r="1.5" fill="currentColor"/>
     <circle cx="17" cy="16" r="1.5" fill="currentColor"/>
     <path d="M12 9h6v3h-6z"/>`,
    size,
    'icon-train-hs'
  );
}

// 🚆 Reisezug / Regional
export function iconTrainPassenger(size = 16): string {
  return svg(
    `<rect x="4" y="4" width="16" height="14" rx="3"/>
     <path d="M4 11h16"/>
     <circle cx="8" cy="15" r="1" fill="currentColor"/>
     <circle cx="16" cy="15" r="1" fill="currentColor"/>
     <path d="M6 18l-2 2"/>
     <path d="M18 18l2 2"/>`,
    size,
    'icon-train-passenger'
  );
}

// 🚂 Dampflok / Güterzug
export function iconTrainFreight(size = 16): string {
  return svg(
    `<path d="M3 15h18v3H3z"/>
     <path d="M6 15V8h7v7"/>
     <path d="M13 15V5h6v10"/>
     <circle cx="7" cy="18" r="2"/>
     <circle cx="12" cy="18" r="2"/>
     <circle cx="17" cy="18" r="2"/>`,
    size,
    'icon-train-freight'
  );
}

// 🏢 Bahnhof
export function iconStation(size = 16): string {
  return svg(
    `<rect x="3" y="10" width="18" height="11" rx="1"/>
     <path d="M12 2l9 8H3l9-8z"/>
     <circle cx="12" cy="7" r="1" fill="currentColor"/>
     <line x1="12" y1="14" x2="12" y2="21"/>`,
    size,
    'icon-station'
  );
}

// 📦 Box / Paket
export function iconBox(size = 14): string {
  return svg(
    `<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
     <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
     <line x1="12" y1="22.08" x2="12" y2="12"/>`,
    size,
    'icon-box'
  );
}

// 🚜 Rangierlok / Shunter
export function iconTrainShunter(size = 16): string {
  return svg(
    `<rect x="3" y="11" width="18" height="6" rx="2"/>
     <path d="M7 11V6h6v5"/>
     <circle cx="7" cy="17" r="2" fill="currentColor"/>
     <circle cx="17" cy="17" r="2" fill="currentColor"/>`,
    size,
    'icon-train-shunter'
  );
}

// 🔴 Status Dot / Linse
export function iconDot(color = '#3fb950', size = 8): string {
  return `<span class="icon-dot" style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background-color:${color};box-shadow:0 0 6px ${color};vertical-align:middle;"></span>`;
}

// 🔊 Lautsprecher / Sound
export function iconSpeaker(size = 16): string {
  return svg(
    `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
     <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>`,
    size,
    'icon-speaker'
  );
}


