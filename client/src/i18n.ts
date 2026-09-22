export type Language = 'de' | 'en';

export const translations: Record<Language, Record<string, string>> = {
  de: {
    // Header & Brand
    'brand.version': 'v1.1.0 • Modern Dispatcher',
    'status.connecting': 'Verbinde...',
    'status.connected': 'Verbunden',
    'status.disconnected': 'Getrennt',
    'status.power_on': 'Gleisstrom EIN',
    'status.power_off': 'Gleisstrom AUS',
    'status.auto_on': 'Automatik: EIN',
    'status.auto_off': 'Automatik: AUS',
    'status.estop': 'NOT-HALT [Space]',
    'btn.lang_title': 'Sprache auf Englisch umschalten / Switch to English',

    // Navigation Tabs
    'nav.layout': 'Gleisplan & Stellwerk',
    'nav.throttle': 'Handregler',
    'nav.bbt': 'BBT Bremsrechner',
    'nav.sensors': 'Signale & Rückmelder',
    'nav.turnouts': 'Weichen-Matrix',
    'nav.locos': 'Fuhrpark & Decoder',
    'nav.routes': 'Fahrstraßen',
    'nav.settings': 'Einstellungen',
    'nav.logs': 'System-Logs',

    // Track Canvas Toolbar
    'canvas.mode_run': 'Fahrbetrieb',
    'canvas.mode_edit': 'Gleisplan-Editor',
    'canvas.inspect': 'Plan prüfen & Blöcke zuordnen',
    'canvas.routes_auto': 'Fahrstraßen-Automatik',
    'canvas.save_layout': 'Plan speichern',
    'canvas.clear_layout': 'Plan leeren',
    'canvas.helper_run': 'Click & Drive: Startblock mit Lok antippen, dann Zielblock. Weichen zum Schalten antippen.',
    'canvas.helper_testmode': ' • Testbetrieb aktiv: Rückmelder antippen (oder lang drücken für Dauerbelegung)',
    'canvas.zoom_reset': '100% (Reset)',

    // Editor Palette Tools
    'tool.straight': 'Gerade',
    'tool.curve': 'Kurve 90°',
    'tool.turnout_left': 'Weiche Links',
    'tool.turnout_right': 'Weiche Rechts',
    'tool.block': 'Block / Gleisabschnitt',
    'tool.signal': 'Signal',
    'tool.buffer': 'Prellbock',
    'tool.sensor': 'Rückmelder',
    'tool.inspect': 'Eigenschaften',
    'tool.rotate': 'Drehen 90°',
    'tool.delete': 'Löschen',

    // Train Depot Drawer
    'depot.title': 'Zugdepot',
    'depot.empty': 'Keine Loks angelegt.',
    'depot.instruction_default': 'Lok antippen zum Aufgleisen oder per Drag & Drop ziehen',
    'depot.instruction_selected': 'Lok gewählt! Tippe jetzt auf ein Block-Gleis',
    'depot.unassign_title': 'Zug hierher ziehen',
    'depot.unassign_subtitle': 'zum Abstellen & Block freigeben',
    'depot.btn_cancel': 'Abbrechen',
    'depot.collapsed_label': 'Züge',

    // Throttle / Locos
    'throttle.empty_title': 'Noch keine Züge im Fuhrpark vorhanden',
    'throttle.empty_desc': 'Klicke oben auf "Neuen Zug anlegen", um deine erste Lokomotive mit DCC-Adresse anzulegen.',
    'throttle.btn_add': 'Neuen Zug anlegen',
    'throttle.stop': 'STOP',
    'throttle.emergency_stop': 'NOT-HALT',
    'throttle.direction_fwd': 'VORWÄRTS',
    'throttle.direction_rev': 'RÜCKWÄRTS',

    // Modals
    'modal.save': 'Speichern',
    'modal.cancel': 'Abbrechen',
    'modal.delete': 'Löschen',
    'modal.close': 'Schließen',
    'modal.address': 'Adresse',
    'modal.name': 'Bezeichnung',
    'modal.direction': 'Richtung',

    // Block-Typen
    'block.type.station': 'Hauptbahnhof / Bahnhof (Halt & Sounds)',
    'block.type.local_station': 'Regionalbahnhof (Durchfahrt für ICE/Güter)',
    'block.type.shadow_station': 'Schattenbahnhof (Zugspeicher / Parken)',
    'block.type.mainline': 'Freie Strecke (Durchfahrtsgleis)',
    'block.type.siding': 'Abstell- / Rangiergleis',

    // Zug-Typen
    'train.type.high_speed': 'Hochgeschwindigkeit (ICE, TGV)',
    'train.type.passenger': 'Reisezug / InterCity',
    'train.type.commuter': 'Nahverkehr / Regional / Tram',
    'train.type.freight': 'Güterzug',
    'train.type.shunter': 'Rangierlok'
  },
  en: {
    // Header & Brand
    'brand.version': 'v1.2.0 • Modern Dispatcher',
    'status.connecting': 'Connecting...',
    'status.connected': 'Connected',
    'status.disconnected': 'Disconnected',
    'status.power_on': 'Track Power ON',
    'status.power_off': 'Track Power OFF',
    'status.auto_on': 'Auto Mode: ON',
    'status.auto_off': 'Auto Mode: OFF',
    'status.estop': 'E-STOP [Space]',
    'btn.lang_title': 'Auf Deutsch umschalten / Switch to German',

    // Navigation Tabs
    'nav.layout': 'Track Plan & Dispatcher',
    'nav.throttle': 'Throttles',
    'nav.bbt': 'BBT Brake Manager',
    'nav.sensors': 'Signals & Feedback',
    'nav.turnouts': 'Turnout Matrix',
    'nav.locos': 'Locomotives & Fleet',
    'nav.routes': 'Routes',
    'nav.settings': 'Settings',
    'nav.logs': 'System Logs',

    // Track Canvas Toolbar
    'canvas.mode_run': 'Run Mode',
    'canvas.mode_edit': 'Track Editor',
    'canvas.inspect': 'Inspect Plan & Assign Blocks',
    'canvas.routes_auto': 'Route Generator',
    'canvas.save_layout': 'Save Layout',
    'canvas.clear_layout': 'Clear Layout',
    'canvas.helper_run': 'Click & Drive: Tap source block with train, then tap target block. Tap turnouts to toggle.',
    'canvas.helper_testmode': ' • Test Mode Active: Tap feedback sensors (or long-press to latch occupied)',
    'canvas.zoom_reset': '100% (Reset)',

    // Editor Palette Tools
    'tool.straight': 'Straight',
    'tool.curve': 'Curve 90°',
    'tool.turnout_left': 'Turnout Left',
    'tool.turnout_right': 'Turnout Right',
    'tool.block': 'Block Section',
    'tool.signal': 'Signal',
    'tool.buffer': 'Buffer Stop',
    'tool.sensor': 'Sensor',
    'tool.inspect': 'Inspect',
    'tool.rotate': 'Rotate 90°',
    'tool.delete': 'Delete',

    // Train Depot Drawer
    'depot.title': 'Train Depot',
    'depot.empty': 'No locomotives configured.',
    'depot.instruction_default': 'Tap a train to place on track, or drag & drop',
    'depot.instruction_selected': 'Train selected! Tap any block track to place',
    'depot.unassign_title': 'Drag train here',
    'depot.unassign_subtitle': 'to send to depot & clear block',
    'depot.btn_cancel': 'Cancel',
    'depot.collapsed_label': 'Trains',

    // Throttle / Locos
    'throttle.empty_title': 'No locomotives in fleet yet',
    'throttle.empty_desc': 'Click "Add New Loco" above to create your first locomotive with a DCC address.',
    'throttle.btn_add': 'Add New Loco',
    'throttle.stop': 'STOP',
    'throttle.emergency_stop': 'EMERGENCY STOP',
    'throttle.direction_fwd': 'FORWARD',
    'throttle.direction_rev': 'REVERSE',

    // Modals
    'modal.save': 'Save',
    'modal.cancel': 'Cancel',
    'modal.delete': 'Delete',
    'modal.close': 'Close',
    'modal.address': 'Address',
    'modal.name': 'Name',
    'modal.direction': 'Direction',

    // Block Types
    'block.type.station': 'Main Station (Halt & Sounds)',
    'block.type.local_station': 'Regional Halt (Pass-through for ICE/Freight)',
    'block.type.shadow_station': 'Staging Yard (Storage & Park)',
    'block.type.mainline': 'Mainline (Passing Track)',
    'block.type.siding': 'Siding / Shunting',

    // Train Types
    'train.type.high_speed': 'High-Speed (ICE, TGV)',
    'train.type.passenger': 'Passenger / InterCity',
    'train.type.commuter': 'Regional / Commuter / Tram',
    'train.type.freight': 'Freight Train',
    'train.type.shunter': 'Shunter / Switcher'
  }
};

let currentLang: Language = (localStorage.getItem('trainmaster_lang') as Language) || 'de';
const listeners: Array<(lang: Language) => void> = [];

export function getLanguage(): Language {
  return currentLang;
}

export function t(key: string, fallback?: string): string {
  const dict = translations[currentLang];
  return dict?.[key] || fallback || key;
}

export function setLanguage(lang: Language): void {
  currentLang = lang;
  localStorage.setItem('trainmaster_lang', lang);
  applyTranslationsToDOM();
  listeners.forEach((fn) => fn(lang));
}

export function toggleLanguage(): Language {
  const next = currentLang === 'de' ? 'en' : 'de';
  setLanguage(next);
  return next;
}

export function onLanguageChange(fn: (lang: Language) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function applyTranslationsToDOM(): void {
  // Update HTML lang attribute
  document.documentElement.lang = currentLang;

  // Update elements with data-i18n attribute
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const translated = t(key);
      // Preserve child elements if any, or update text content
      if (el.children.length === 0) {
        el.textContent = translated;
      } else {
        // If there's an icon element, update only the text node
        const icon = el.querySelector('.icon, .tab-icon');
        if (icon) {
          el.innerHTML = `${icon.outerHTML} ${translated}`;
        } else {
          el.textContent = translated;
        }
      }
    }
  });

  // Update elements with data-i18n-title
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.title = t(key);
    }
  });

  // Update language toggle button in header
  const langBtn = document.getElementById('btn-lang-toggle');
  if (langBtn) {
    const isDe = currentLang === 'de';
    langBtn.innerHTML = isDe
      ? `<span class="lang-text" style="font-weight:700;letter-spacing:0.5px;">EN</span>`
      : `<span class="lang-text" style="font-weight:700;letter-spacing:0.5px;">DE</span>`;
    langBtn.title = t('btn.lang_title');
  }

  // Update helper text if available
  const trackCanvas = (window as any).trackCanvas;
  if (trackCanvas && typeof trackCanvas.updateHelperText === 'function') {
    trackCanvas.updateHelperText();
  }
}
