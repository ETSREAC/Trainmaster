export type Language = 'de' | 'en';

export const translations: Record<Language, Record<string, string>> = {
  de: {
    // App & Header
    'app.title': 'TrainMaster - Digitale Modellbahn-Steuerung',
    'brand.version': 'v1.8.0 • Clean Dispatcher Edition',
    'status.connecting': 'Verbinde...',
    'status.connected': 'Verbunden',
    'status.disconnected': 'Getrennt',
    'status.power_on': 'Gleisstrom EIN',
    'status.power_off': 'Gleisstrom AUS',
    'status.auto_on': 'Automatik: EIN',
    'status.auto_off': 'Automatik: AUS',
    'status.estop': 'NOT-HALT [Space]',
    'btn.lang_title': 'Sprache auf Englisch umschalten / Switch to English',
    'btn.power_title': 'Gleisspannung ein/ausschalten',
    'btn.auto_title': 'Aquarium / Automatikmodus starten',
    'btn.estop_title': 'NOT-HALT für alle Züge (Leertaste)',

    // Main Navigation
    'nav.layout': 'Gleisplan & Stellwerk',
    'nav.throttle': 'Handregler',
    'nav.bbt': 'BBT Bremsrechner',
    'nav.sensors': 'Signale & Rückmelder',
    'nav.turnouts': 'Weichen-Matrix',
    'nav.locos': 'Fuhrpark & Decoder',
    'nav.routes': 'Fahrstraßen',
    'nav.logs': 'System-Log',
    'nav.settings': 'Einstellungen',

    // Mobile Navigation
    'mobile.layout': 'Gleisplan',
    'mobile.throttle': 'Regler',
    'mobile.sensors': 'Signale',
    'mobile.bbt': 'BBT',
    'mobile.settings': 'Optionen',

    // Track Canvas Toolbar
    'canvas.mode_label': 'Modus:',
    'canvas.mode_run': 'Fahrbetrieb',
    'canvas.mode_edit': 'Gleisplan-Editor',
    'canvas.inspect': 'Plan prüfen & Blöcke zuordnen',
    'canvas.routes_auto': 'Fahrstraßen-Automatik',
    'canvas.zoom_label': 'Zoom:',
    'canvas.zoom_reset': '100% (Reset)',
    'canvas.save_layout': 'Plan speichern',
    'canvas.clear_layout': 'Plan leeren',
    'canvas.helper_run': 'Click & Drive: Startblock mit Lok antippen, dann Zielblock. Weichen zum Schalten antippen.',
    'canvas.helper_testmode': ' • Testbetrieb aktiv: Rückmelder antippen (oder lang drücken für Dauerbelegung)',

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

    // Throttle / Fuhrpark
    'throttle.title': 'Fuhrpark-Verwaltung:',
    'throttle.btn_add': '➕ Neuen Zug anlegen',
    'throttle.hint': '💡 Hier kannst du deine Lokomotiven steuern, mit ✏️ bearbeiten oder neue Loks mit DCC-Adresse hinzufügen.',
    'throttle.empty_title': 'Noch keine Züge im Fuhrpark vorhanden',
    'throttle.empty_desc': 'Klicke oben auf "Neuen Zug anlegen", um deine erste Lokomotive mit DCC-Adresse anzulegen.',
    'throttle.active': 'AKTIV',
    'throttle.type': 'Typ',
    'throttle.length': 'Länge',
    'throttle.edit_tooltip': 'Lokomotive bearbeiten',
    'throttle.speed_step': 'Fahrstufe (0 - 128)',
    'throttle.speed_label': 'Geschwindigkeit',
    'throttle.stop': 'STOP',
    'throttle.emergency_stop': 'NOT-HALT',
    'throttle.preset_stop': 'Stop',
    'throttle.preset_shunt': 'Rangier',
    'throttle.preset_cruise': 'Reise',
    'throttle.preset_fast': 'Schnell',
    'throttle.preset_vmax': 'Vmax',
    'throttle.direction_fwd': '▲ Vorwärts',
    'throttle.direction_rev': '▼ Rückwärts',

    // BBT Bremsrechner
    'bbt.title': '⏱️ BBT Block Brake Timer:',
    'bbt.filter_block': 'Block:',
    'bbt.filter_block_placeholder': '-- Block wählen --',
    'bbt.filter_loco': 'Fahrzeug:',
    'bbt.filter_loco_placeholder': '-- Fahrzeug wählen --',
    'bbt.filter_dir': 'Richtung:',
    'bbt.filter_dir_fwd': 'Vorwärts (+)',
    'bbt.filter_dir_rev': 'Rückwärts (-)',
    'bbt.hint': '💡 Wähle einen Block und eine Lok aus, um die Einmess-Historie, den Median (Meridian) und die Profilsperre einzusehen.',
    'bbt.profiles_title': '📊 Alle erlernten BBT-Profile',
    'bbt.profiles_subtitle': 'Übersicht aller Bremsrampen. Klicke auf eine Zeile, um die Fahrten-Historie und Einmesskurve oben aufzurufen.',
    'bbt.th_loco': 'Lokomotive',
    'bbt.th_block': 'Block',
    'bbt.th_direction': 'Richtung',
    'bbt.th_steps': 'Stufen',
    'bbt.th_interval': 'Intervall (ms)',
    'bbt.th_vstart': 'V_Start',
    'bbt.th_vmin': 'V_Min',
    'bbt.th_median': 'Median Kriechzeit',
    'bbt.th_last_run': 'Letzter Durchlauf',
    'bbt.th_status': 'Status / Sperre',
    'bbt.no_selection_prompt': '👆 Wähle oben einen Block und ein Fahrzeug aus.',
    'bbt.no_selection_desc': 'Hier werden das aktuelle Bremsintervall, die Median-(Meridian)-Einmesskurve und die Historie angezeigt.',
    'bbt.no_profile_title': 'Kein Eintrag',
    'bbt.no_profile_desc': 'Für diese Kombination existiert noch kein aktives Bremsrampen-Profil. TrainMaster lernt das Profil automatisch bei der ersten Durchfahrt im Automatikmodus, oder du kannst es direkt initialisieren:',
    'bbt.btn_init_profile': '➕ Neues BBT-Profil initialisieren',
    'bbt.no_measurements': 'Noch keine Messungen',
    'bbt.locked_status': '🔒 Profil gesperrt (Haltepunkt fixiert)',
    'bbt.learning_status': '🟢 Lernmodus aktiv (Auto-Korrektur)',
    'bbt.btn_unlock': '🔓 Entsperren & Weiterlernen aktivieren',
    'bbt.btn_lock': '🔒 Profil sperren & Bremsrampe fixieren',
    'bbt.btn_reset': '🔄 Bremswerte zurücksetzen',
    'bbt.table_empty': 'Noch keine BBT-Profile gelernt.',

    // Signale & Rückmelder Tab
    'sensors.title': '📡 Rückmelder & WIO:',
    'sensors.btn_add': '➕ Neuen Rückmelder anlegen',
    'sensors.hint': '💡 Hier siehst du deine aktiven ESP32-WIO-Module, Live-Pins, eingehende Pakete und konfigurierte Melder.',
    'sensors.subnav_sensors': 'Rückmelder & Kontakte',
    'sensors.subnav_signals': 'Signale',
    'sensors.subnav_wio': 'ESP32 Hardware & Pins',
    'sensors.subnav_all': 'Alles anzeigen',
    'sensors.list_title': '🏷️ Konfigurierte Rückmelder & Kontakte',
    'sensors.list_desc': 'Echtzeit-Zustand aller Gleisbelegtmelder und Schaltkontakte. Klicke auf "Test-Impuls", um einen Kontakt manuell zu prüfen.',
    'sensors.filter_all': 'Alle',
    'sensors.filter_active': 'Belegt',
    'sensors.filter_free': 'Frei',
    'sensors.search_placeholder': 'Melder filtern...',
    'sensors.status_free': 'Frei',
    'sensors.status_occupied': 'Belegt',
    'sensors.test_pulse': 'Test-Impuls',
    'sensors.confirm_delete': 'Möchtest du diesen Rückmelder wirklich unwiderruflich löschen?',

    // System-Logs
    'logs.title': '📜 Echtzeit-Systemprotokoll',
    'logs.btn_clear': 'Log leeren',

    // Einstellungen / Settings
    'settings.header_title': '⚙️ System-Einstellungen',
    'settings.header_desc': 'Konfiguration der Digitalzentrale, Verbindungsparameter und Anlagen-Optionen.',
    'settings.language_title': '🌐 Sprache & Lokalisierung',
    'settings.language_desc': 'Wähle die Sprache für die TrainMaster Benutzeroberfläche und das Stellwerk.',
    'settings.language_label': 'Benutzeroberflächen-Sprache:',
    'settings.language_hint': 'Wird sofort wirksam und lokal im Browser gespeichert.',
    'settings.cs_title': '🔌 Digitalzentrale (Hardware / Simulator)',
    'settings.cs_type_label': 'Zentralen-Typ:',
    'settings.cs_type_virtual': '🟢 Virtueller Simulator (Offline-Betrieb)',
    'settings.cs_type_dccex': '🚂 DCC-EX CommandStation (USB / WiFi)',
    'settings.cs_type_z21': '🔵 Roco Z21 / z21 start (LAN / WLAN)',
    'settings.interface_label': 'Schnittstelle:',
    'settings.interface_serial': 'USB / Seriell (COM)',
    'settings.interface_tcp': 'WiFi / Netzwerk (TCP)',
    'settings.com_port_label': 'COM-Port:',
    'settings.com_port_placeholder': 'z. B. COM3, COM4 oder /dev/ttyUSB0',
    'settings.btn_scan': '🔄 Suchen',
    'settings.btn_scanning': '🔄 Scanne...',
    'settings.com_hint': 'Frei editierbar (z. B. COM1–COM99 oder /dev/ttyUSB0) oder über "Suchen" vorschlagen lassen.',
    'settings.baud_label': 'Baudrate:',
    'settings.baud_default': '115200 (Standard für DCC-EX)',
    'settings.ip_label': 'IP-Adresse:',
    'settings.port_label': 'Port:',
    'settings.z21_ip_label': 'Z21 IP-Adresse:',
    'settings.z21_port_label': 'UDP Port:',
    'settings.btn_save': '💾 Zentrale verbinden & Einstellungen speichern',
    'settings.saved_alert': 'Einstellungen gespeichert! Die Zentrale wird jetzt verbunden...',
    'settings.layout_params_title': '📐 Anlagen-Parameter & Zugsicherung',
    'settings.scale_label': 'Modellbahn-Nenngröße (Maßstab):',
    'settings.creep_time_label': 'BBT Soll-Kriechzeit vor Halt (ms):',
    'settings.creep_time_hint': 'Gewünschte Zeitspanne, die der Zug vor dem IN-Sensor im Kriechgang ausrollt.',
    'settings.ghost_active_label': 'Geisterzug-Notabschaltung aktiv',
    'settings.ghost_active_desc': '(Sofortiger Not-Halt bei ungemeldeten Belegungen)',
    'settings.manual_sensor_label': '⚡ Rückmelder im Fahrbetrieb manuell auslösbar',
    'settings.manual_sensor_sub': '(Testbetrieb / Simulation)',
    'settings.manual_sensor_hint': 'Ermöglicht es, Rückmelder direkt durch Anklicken im Gleisplan auszulösen, um Zugüberfahrten, Blockbelegungen und Automatik-Abläufe auch ohne reale Züge zu testen.',
    'settings.wio_title': '📡 ESP32 WIO (Wireless I/O) Rückmeldesystem',
    'settings.wio_desc': 'Empfängt Rückmeldesignale drahtlos von ESP32-Modulen über UDP-Datagramme (Rocrail WIO / RocNet-kompatibel) oder HTTP REST.',
    'settings.wio_enabled_label': 'WIO UDP-Empfänger aktiv',
    'settings.wio_port_label': 'WIO UDP-Port:',
    'settings.wio_port_hint': 'Standardport 8051 für Rocrail WIO-Firmware oder eigene ESP32-Skripte.',
    'settings.wio_webhook_title': '💡 HTTP REST Webhook für ESP32:',
    'settings.support_title': '☕ TrainMaster unterstützen',
    'settings.support_desc': 'TrainMaster ist ein freies Open-Source-Projekt (MIT-Lizenz). Unterstütze die Weiterentwicklung und neue Hardware-Features mit einem Kaffee!',
    'header.support_btn': 'Support ☕',
    'supporter.modal_title': 'TrainMaster unterstützen',
    'supporter.modal_intro': 'TrainMaster ist ein freies, offenes Hobby-Projekt. Mit einem Kaffee unterstützt du neue Features, Bugfixes und Hardware-Entwicklungen.',
    'supporter.tier_title': 'Clean-Version ab 25 €',
    'supporter.tier_desc': 'Unterstütze das Projekt mit mindestens 25 € auf Buy Me a Coffee und du erhältst deinen persönlichen Freischaltcode, mit dem alle Support-Buttons dauerhaft entfernt werden!',
    'supporter.btn_bmc': '☕ Auf Buy Me a Coffee unterstützen ↗',
    'supporter.code_label': 'Bereits gespendet? Freischaltcode eingeben:',
    'supporter.btn_unlock': '✨ Freischalten',
    'supporter.success': '🎉 Clean-Version erfolgreich aktiviert! Vielen Dank für deine Unterstützung, {name}!',
    'supporter.unlocked_badge': '🌟 Clean Supporter Edition aktiv',
    'supporter.licensed_to': 'Lizenziert für:',
    'supporter.btn_remove': 'Code entfernen',
    'supporter.btn_enter_code': '🔑 Freischaltcode eingeben',

    // Modals
    'modal.save': '💾 Speichern',
    'modal.cancel': 'Abbrechen',
    'modal.delete': '🗑️ Löschen',
    'modal.close': 'Schließen',
    'modal.address': 'Adresse',
    'modal.name': 'Bezeichnung',
    'modal.direction': 'Richtung',

    // Loco Modal
    'modal.loco_title_new': '🚂 Neue Lokomotive anlegen',
    'modal.loco_title_edit': '🚂 Lokomotive bearbeiten',
    'modal.loco_name_label': 'Lok-Name / Baureihe: *',
    'modal.loco_name_placeholder': 'z. B. DB BR 101 oder Taurus',
    'modal.loco_address_label': 'DCC-Adresse (1 - 9999): *',
    'modal.loco_type_label': 'Zuggattung / Typ:',
    'modal.loco_profile_label': 'Geschwindigkeitsprofil (Fahrstufen 0 - 128):',
    'modal.loco_vmin_label': 'V_Min (Kriechen):',
    'modal.loco_vmid_label': 'V_Mid (Reise):',
    'modal.loco_vmax_label': 'V_Max (Höchst):',
    'modal.loco_length_label': 'Zuglänge in cm (für Blockprüfung):',
    'modal.loco_btn_delete': '🗑️ Lok löschen',

    // Sensor Modal
    'modal.sensor_title_new': '📡 Rückmelder anlegen',
    'modal.sensor_title_edit': '📡 Rückmelder bearbeiten',
    'modal.sensor_name_label': 'Bezeichnung / Name: *',
    'modal.sensor_name_placeholder': 'z. B. Bf Gl 1 ENTER oder WIO Melder 1',
    'modal.sensor_type_label': 'Sensor-Typ / Anbindung: *',
    'modal.sensor_wio_title': '📡 WIO (ESP32) Parameter:',
    'modal.sensor_wio_unit_label': 'Unit / Node-ID (ESP32):',
    'modal.sensor_wio_pin_label': 'WIO Pin / Port:',
    'modal.sensor_wio_hint': 'Entspricht der Baugruppe und dem Eingangs-Pin des ESP32 WIO Moduls.',
    'modal.sensor_address_label': 'Hardware- / DCC-Adresse (1 - 2048): *',
    'modal.sensor_address_hint': 'Eindeutige Adresse für Zentrale oder automatische Zuordnung.',
    'modal.sensor_inverted_label': 'Signal invertieren',
    'modal.sensor_inverted_desc': '(Öffnerkontakt statt Schließer / Active-Low)',
    'modal.sensor_btn_delete': '🗑️ Sensor löschen',
    'modal.sensor_btn_save': '💾 Sensor speichern',

    // Block Modal
    'modal.block_title': '⬛ Block konfigurieren',
    'modal.block_name_label': 'Block-Name: *',
    'modal.block_name_placeholder': 'z. B. Bahnhof Gleis 1',
    'modal.block_length_label': 'Länge (cm): *',
    'modal.block_type_label': 'Block-Typ & Automatik: *',
    'modal.block_dir_label': 'Standard-Richtung:',
    'modal.block_dir_fwd': '+ (Vorwärts / Von Links nach Rechts)',
    'modal.block_dir_rev': '- (Rückwärts / Von Rechts nach Links)',
    'modal.block_loco_label': 'Zug / Lok im Block:',
    'modal.block_loco_none': '(Kein Zug im Block)',
    'modal.block_wait_title': '⏱️ Automatik-Wartezeiten & Sound:',
    'modal.block_min_wait_label': 'Min. Wartezeit (Sek.):',
    'modal.block_max_wait_label': 'Max. Wartezeit (Sek.):',
    'modal.block_sound_fkey_label': 'Abfahrts-Sound (Lok F-Taste):',
    'modal.block_sound_fkey_placeholder': 'z. B. 3 für Pfiff (0 = Aus)',
    'modal.block_sound_lead_label': 'Vorlaufzeit vor Abfahrt (Sek.):',
    'modal.block_plus_title': '🚦 Rückmelder Fahrtrichtung [+] :',
    'modal.block_minus_title': '🚦 Rückmelder Gegenrichtung [-] :',
    'modal.block_enter_label': 'ENTER-Melder (Bremsbeginn):',
    'modal.block_in_label': 'IN-Melder (Haltepunkt):',
    'modal.block_no_sensor': '(Kein Melder)',
    'modal.block_btn_save': '💾 Block speichern',
    'modal.block_split_label': '50/50-Gleisaufteilung (zwei Belegtmelder)',
    'modal.block_split_hint': 'Ohne Häkchen: Punktmelder (ENTER = Bremsbeginn, IN = Halt). Mit Häkchen: ENTER = Melder A (erste Hälfte), IN = Melder B (ab Teilungsmarke); der Haltepunkt richtet sich nach der Zuglänge.',
    'modal.block_stop_policy_label': 'Haltestrategie:',
    'modal.block_stop_policy_auto': 'Automatisch nach Zuglänge',
    'modal.block_stop_policy_center': 'Immer Bahnsteigmitte',
    'modal.block_stop_policy_signal': 'Immer am Signal',
    'modal.block_split_ratio_label': 'Teilung bei (%):',
    'modal.block_center_margin_label': 'Zugmitte hinter Teilung (cm):',
    'modal.block_signal_margin_label': 'Abstand zum Signal (cm):',

    // Turnout Modal
    'modal.turnout_title': '⎇ Weiche konfigurieren',
    'modal.turnout_name_label': 'Weichen-Bezeichnung: *',
    'modal.turnout_name_placeholder': 'z. B. Weiche W1 Ost',
    'modal.turnout_address_label': 'DCC Magnetartikel-Adresse (1 - 2048): *',
    'modal.turnout_inverted_label': 'Polarität umkehren',
    'modal.turnout_inverted_desc': '(Gerade ↔ Abzweig vertauschen)',
    'modal.turnout_btn_save': '💾 Weiche speichern',

    // Signal Modal
    'modal.signal_title': '🚦 Signal konfigurieren',
    'modal.signal_btn_save': '💾 Signal speichern',

    // Inspector Modal
    'modal.inspector_title': '🔍 Gleisplan & Block-Diagnose',
    'modal.inspector_tab_diag': 'Plan-Prüfung & Zuordnung',
    'modal.inspector_tab_routes': 'Fahrstraßen-Automatik',
    'modal.inspector_btn_refresh': '🔄 Neu prüfen',
    'modal.inspector_btn_close': 'Schließen',

    // Block Types
    'block.type.station': '🏢 Hauptbahnhof / Bahnhof (Halt mit Wartezeit & Sounds)',
    'block.type.local_station': '🚏 Regionalbahnhof (Halt für Regios, Durchfahrt für ICE/Güter)',
    'block.type.shadow_station': '🚇 Schattenbahnhof (Zugspeicher / Parken)',
    'block.type.mainline': '🛤️ Freie Strecke (Durchfahrtsgleis)',
    'block.type.siding': '🏗️ Abstell- / Rangiergleis',

    // Train Types
    'train.type.high_speed': 'ICE / Hochgeschwindigkeit (ICE, TGV)',
    'train.type.passenger': 'Personenzug / InterCity',
    'train.type.commuter': 'Wendezug / Nahverkehr / Regional',
    'train.type.freight': 'Güterzug',
    'train.type.shunter': 'Rangierlok'
  },
  en: {
    // App & Header
    'app.title': 'TrainMaster - Digital Model Railroad Control',
    'brand.version': 'v1.8.0 • Clean Dispatcher Edition',
    'status.connecting': 'Connecting...',
    'status.connected': 'Connected',
    'status.disconnected': 'Disconnected',
    'status.power_on': 'Track Power ON',
    'status.power_off': 'Track Power OFF',
    'status.auto_on': 'Auto Mode: ON',
    'status.auto_off': 'Auto Mode: OFF',
    'status.estop': 'E-STOP [Space]',
    'btn.lang_title': 'Auf Deutsch umschalten / Switch to German',
    'btn.power_title': 'Toggle track power on/off',
    'btn.auto_title': 'Start Aquarium / Auto Mode',
    'btn.estop_title': 'Emergency Stop all trains (Spacebar)',

    // Main Navigation
    'nav.layout': 'Track Plan & Dispatcher',
    'nav.throttle': 'Throttles',
    'nav.bbt': 'BBT Brake Manager',
    'nav.sensors': 'Signals & Feedback',
    'nav.turnouts': 'Turnout Matrix',
    'nav.locos': 'Locomotives & Fleet',
    'nav.routes': 'Routes',
    'nav.logs': 'System Logs',
    'nav.settings': 'Settings',

    // Mobile Navigation
    'mobile.layout': 'Track Plan',
    'mobile.throttle': 'Throttle',
    'mobile.sensors': 'Signals',
    'mobile.bbt': 'BBT',
    'mobile.settings': 'Settings',

    // Track Canvas Toolbar
    'canvas.mode_label': 'Mode:',
    'canvas.mode_run': 'Run Mode',
    'canvas.mode_edit': 'Track Editor',
    'canvas.inspect': 'Inspect Plan & Assign Blocks',
    'canvas.routes_auto': 'Auto Route Generator',
    'canvas.zoom_label': 'Zoom:',
    'canvas.zoom_reset': '100% (Reset)',
    'canvas.save_layout': 'Save Layout',
    'canvas.clear_layout': 'Clear Layout',
    'canvas.helper_run': 'Click & Drive: Tap source block with train, then target block. Tap turnouts to toggle.',
    'canvas.helper_testmode': ' • Test Mode Active: Tap feedback sensor (or long-press to latch occupied)',

    // Editor Palette Tools
    'tool.straight': 'Straight',
    'tool.curve': 'Curve 90°',
    'tool.turnout_left': 'Turnout Left',
    'tool.turnout_right': 'Turnout Right',
    'tool.block': 'Block Section',
    'tool.signal': 'Signal',
    'tool.buffer': 'Buffer Stop',
    'tool.sensor': 'Sensor',
    'tool.inspect': 'Properties',
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

    // Throttle / Fuhrpark
    'throttle.title': 'Fleet Management:',
    'throttle.btn_add': '➕ Add New Train',
    'throttle.hint': '💡 Control your locomotives here, edit them with ✏️ or create new locomotives with DCC addresses.',
    'throttle.empty_title': 'No locomotives in fleet yet',
    'throttle.empty_desc': 'Click "Add New Train" above to create your first locomotive with a DCC address.',
    'throttle.active': 'ACTIVE',
    'throttle.type': 'Type',
    'throttle.length': 'Length',
    'throttle.edit_tooltip': 'Edit locomotive',
    'throttle.speed_step': 'Speed Step (0 - 128)',
    'throttle.speed_label': 'Speed',
    'throttle.stop': 'STOP',
    'throttle.emergency_stop': 'EMERGENCY STOP',
    'throttle.preset_stop': 'Stop',
    'throttle.preset_shunt': 'Shunt',
    'throttle.preset_cruise': 'Cruise',
    'throttle.preset_fast': 'Fast',
    'throttle.preset_vmax': 'Max',
    'throttle.direction_fwd': '▲ Forward',
    'throttle.direction_rev': '▼ Reverse',

    // BBT Bremsrechner
    'bbt.title': '⏱️ BBT Block Brake Timer:',
    'bbt.filter_block': 'Block:',
    'bbt.filter_block_placeholder': '-- Select Block --',
    'bbt.filter_loco': 'Locomotive:',
    'bbt.filter_loco_placeholder': '-- Select Locomotive --',
    'bbt.filter_dir': 'Direction:',
    'bbt.filter_dir_fwd': 'Forward (+)',
    'bbt.filter_dir_rev': 'Reverse (-)',
    'bbt.hint': '💡 Select a block and locomotive to inspect calibration history, median (meridian) curve, and profile lock.',
    'bbt.profiles_title': '📊 All Learned BBT Profiles',
    'bbt.profiles_subtitle': 'Overview of all brake ramps. Click a row to view calibration history and deceleration curve above.',
    'bbt.th_loco': 'Locomotive',
    'bbt.th_block': 'Block',
    'bbt.th_direction': 'Direction',
    'bbt.th_steps': 'Steps',
    'bbt.th_interval': 'Interval (ms)',
    'bbt.th_vstart': 'V_Start',
    'bbt.th_vmin': 'V_Min',
    'bbt.th_median': 'Median Creep Time',
    'bbt.th_last_run': 'Last Run',
    'bbt.th_status': 'Status / Lock',
    'bbt.no_selection_prompt': '👆 Select a block and locomotive above.',
    'bbt.no_selection_desc': 'The active brake interval, median runtime curve, and run history will be displayed here.',
    'bbt.no_profile_title': 'No Entry',
    'bbt.no_profile_desc': 'No active braking profile exists for this combination yet. TrainMaster learns it automatically on the first pass in auto mode, or you can initialize it now:',
    'bbt.btn_init_profile': '➕ Initialize New BBT Profile',
    'bbt.no_measurements': 'No measurements yet',
    'bbt.locked_status': '🔒 Profile Locked (Stopping point fixed)',
    'bbt.learning_status': '🟢 Learning Active (Auto-correcting)',
    'bbt.btn_unlock': '🔓 Unlock & Resume Learning',
    'bbt.btn_lock': '🔒 Lock Profile & Fix Brake Ramp',
    'bbt.btn_reset': '🔄 Reset Brake Values',
    'bbt.table_empty': 'No BBT profiles learned yet.',

    // Signale & Rückmelder Tab
    'sensors.title': '📡 Sensors & WIO:',
    'sensors.btn_add': '➕ Add New Sensor',
    'sensors.hint': '💡 View active ESP32 WIO modules, live pins, incoming packets, and configured sensors.',
    'sensors.subnav_sensors': 'Sensors & Contacts',
    'sensors.subnav_signals': 'Signals',
    'sensors.subnav_wio': 'ESP32 Hardware & Pins',
    'sensors.subnav_all': 'Show All',
    'sensors.list_title': '🏷️ Configured Feedback Sensors & Contacts',
    'sensors.list_desc': 'Real-time state of all track occupancy sensors and contacts. Click "Test Pulse" to manually test a contact.',
    'sensors.filter_all': 'All',
    'sensors.filter_active': 'Occupied',
    'sensors.filter_free': 'Free',
    'sensors.search_placeholder': 'Filter sensors...',
    'sensors.status_free': 'Free',
    'sensors.status_occupied': 'Occupied',
    'sensors.test_pulse': 'Test Pulse',
    'sensors.confirm_delete': 'Are you sure you want to permanently delete this sensor?',

    // System-Logs
    'logs.title': '📜 Real-Time System Log',
    'logs.btn_clear': 'Clear Log',

    // Einstellungen / Settings
    'settings.header_title': '⚙️ System Settings',
    'settings.header_desc': 'Configuration for command station, connection parameters, and layout options.',
    'settings.language_title': '🌐 Language & Localization',
    'settings.language_desc': 'Select the user interface language for TrainMaster and the dispatcher.',
    'settings.language_label': 'Interface Language:',
    'settings.language_hint': 'Takes effect immediately and is saved locally in your browser.',
    'settings.cs_title': '🔌 Command Station (Hardware / Simulator)',
    'settings.cs_type_label': 'Command Station Type:',
    'settings.cs_type_virtual': '🟢 Virtual Simulator (Offline Mode)',
    'settings.cs_type_dccex': '🚂 DCC-EX CommandStation (USB / WiFi)',
    'settings.cs_type_z21': '🔵 Roco Z21 / z21 start (LAN / WiFi)',
    'settings.interface_label': 'Interface:',
    'settings.interface_serial': 'USB / Serial (COM)',
    'settings.interface_tcp': 'WiFi / Network (TCP)',
    'settings.com_port_label': 'COM Port:',
    'settings.com_port_placeholder': 'e.g. COM3, COM4 or /dev/ttyUSB0',
    'settings.btn_scan': '🔄 Scan',
    'settings.btn_scanning': '🔄 Scanning...',
    'settings.com_hint': 'Freely editable (e.g. COM1–COM99 or /dev/ttyUSB0) or click "Scan" to auto-detect.',
    'settings.baud_label': 'Baud Rate:',
    'settings.baud_default': '115200 (Default for DCC-EX)',
    'settings.ip_label': 'IP Address:',
    'settings.port_label': 'Port:',
    'settings.z21_ip_label': 'Z21 IP Address:',
    'settings.z21_port_label': 'UDP Port:',
    'settings.btn_save': '💾 Connect Station & Save Settings',
    'settings.saved_alert': 'Settings saved! The command station is now connecting...',
    'settings.layout_params_title': '📐 Layout Parameters & Train Safety',
    'settings.scale_label': 'Model Railroad Scale:',
    'settings.creep_time_label': 'BBT Target Creep Time before Stop (ms):',
    'settings.creep_time_hint': 'Desired duration the train rolls at crawl speed before reaching the IN sensor.',
    'settings.ghost_active_label': 'Ghost Train Emergency Shutdown Active',
    'settings.ghost_active_desc': '(Immediate E-Stop on unexpected track occupancy)',
    'settings.manual_sensor_label': '⚡ Feedback sensors manually triggerable in Run Mode',
    'settings.manual_sensor_sub': '(Test Mode / Simulation)',
    'settings.manual_sensor_hint': 'Allows triggering sensors directly by clicking them in the track layout to test trains, block occupancy, and automatic routes without physical locos.',
    'settings.wio_title': '📡 ESP32 WIO (Wireless I/O) Feedback System',
    'settings.wio_desc': 'Receives feedback signals wirelessly from ESP32 modules via UDP datagrams (Rocrail WIO / RocNet compatible) or HTTP REST.',
    'settings.wio_enabled_label': 'WIO UDP Receiver Active',
    'settings.wio_port_label': 'WIO UDP Port:',
    'settings.wio_port_hint': 'Default port 8051 for Rocrail WIO firmware or custom ESP32 scripts.',
    'settings.wio_webhook_title': '💡 HTTP REST Webhook for ESP32:',
    'settings.support_title': '☕ Support TrainMaster',
    'settings.support_desc': 'TrainMaster is a free open-source project (MIT License). Support its ongoing development and new hardware integrations with a coffee!',
    'header.support_btn': 'Support ☕',
    'supporter.modal_title': 'Support TrainMaster',
    'supporter.modal_intro': 'TrainMaster is a free, open-source hobby project. With a coffee you support new features, bugfixes, and hardware development.',
    'supporter.tier_title': 'Clean Edition for 25 €+',
    'supporter.tier_desc': 'Support the project with at least 25 € on Buy Me a Coffee and receive your personal unlock code to permanently remove all support buttons!',
    'supporter.btn_bmc': '☕ Support on Buy Me a Coffee ↗',
    'supporter.code_label': 'Already donated? Enter unlock code:',
    'supporter.btn_unlock': '✨ Unlock',
    'supporter.success': '🎉 Clean Edition successfully activated! Thank you for your support, {name}!',
    'supporter.unlocked_badge': '🌟 Clean Supporter Edition Active',
    'supporter.licensed_to': 'Licensed to:',
    'supporter.btn_remove': 'Remove code',
    'supporter.btn_enter_code': '🔑 Enter Unlock Code',

    // Modals
    'modal.save': '💾 Save',
    'modal.cancel': 'Cancel',
    'modal.delete': '🗑️ Delete',
    'modal.close': 'Close',
    'modal.address': 'Address',
    'modal.name': 'Name',
    'modal.direction': 'Direction',

    // Loco Modal
    'modal.loco_title_new': '🚂 Add New Locomotive',
    'modal.loco_title_edit': '🚂 Edit Locomotive',
    'modal.loco_name_label': 'Locomotive Name / Class: *',
    'modal.loco_name_placeholder': 'e.g. DB Class 101 or Taurus',
    'modal.loco_address_label': 'DCC Address (1 - 9999): *',
    'modal.loco_type_label': 'Train Type / Category:',
    'modal.loco_profile_label': 'Speed Profile (Speed Steps 0 - 128):',
    'modal.loco_vmin_label': 'V_Min (Creep):',
    'modal.loco_vmid_label': 'V_Mid (Cruise):',
    'modal.loco_vmax_label': 'V_Max (Top):',
    'modal.loco_length_label': 'Train Length in cm (for block clearance):',
    'modal.loco_btn_delete': '🗑️ Delete Locomotive',

    // Sensor Modal
    'modal.sensor_title_new': '📡 Add Feedback Sensor',
    'modal.sensor_title_edit': '📡 Edit Feedback Sensor',
    'modal.sensor_name_label': 'Label / Name: *',
    'modal.sensor_name_placeholder': 'e.g. Station Tr 1 ENTER or WIO Sensor 1',
    'modal.sensor_type_label': 'Sensor Type / Interface: *',
    'modal.sensor_wio_title': '📡 WIO (ESP32) Parameters:',
    'modal.sensor_wio_unit_label': 'Unit / Node-ID (ESP32):',
    'modal.sensor_wio_pin_label': 'WIO Pin / Port:',
    'modal.sensor_wio_hint': 'Corresponds to the module unit number and input pin on the ESP32 WIO device.',
    'modal.sensor_address_label': 'Hardware / DCC Address (1 - 2048): *',
    'modal.sensor_address_hint': 'Unique address for the command station or auto-assignment.',
    'modal.sensor_inverted_label': 'Invert Signal',
    'modal.sensor_inverted_desc': '(Normally closed instead of normally open / Active-Low)',
    'modal.sensor_btn_delete': '🗑️ Delete Sensor',
    'modal.sensor_btn_save': '💾 Save Sensor',

    // Block Modal
    'modal.block_title': '⬛ Configure Block Section',
    'modal.block_name_label': 'Block Name: *',
    'modal.block_name_placeholder': 'e.g. Main Station Track 1',
    'modal.block_length_label': 'Length (cm): *',
    'modal.block_type_label': 'Block Type & Automation: *',
    'modal.block_dir_label': 'Default Direction:',
    'modal.block_dir_fwd': '+ (Forward / Left to Right)',
    'modal.block_dir_rev': '- (Reverse / Right to Left)',
    'modal.block_loco_label': 'Train / Loco in Block:',
    'modal.block_loco_none': '(No train in block)',
    'modal.block_wait_title': '⏱️ Automation Wait Times & Sound:',
    'modal.block_min_wait_label': 'Min. Wait Time (sec):',
    'modal.block_max_wait_label': 'Max. Wait Time (sec):',
    'modal.block_sound_fkey_label': 'Departure Sound (Loco F-Key):',
    'modal.block_sound_fkey_placeholder': 'e.g. 3 for whistle (0 = Off)',
    'modal.block_sound_lead_label': 'Lead Time before Departure (sec):',
    'modal.block_plus_title': '🚦 Sensors Forward Direction [+] :',
    'modal.block_minus_title': '🚦 Sensors Reverse Direction [-] :',
    'modal.block_enter_label': 'ENTER Sensor (Start Braking):',
    'modal.block_in_label': 'IN Sensor (Stopping Point):',
    'modal.block_no_sensor': '(No sensor)',
    'modal.block_btn_save': '💾 Save Block',
    'modal.block_split_label': '50/50 track split (two occupancy detectors)',
    'modal.block_split_hint': 'Unchecked: point detectors (ENTER = start braking, IN = stop). Checked: ENTER = detector A (first half), IN = detector B (from split mark); the stopping point depends on train length.',
    'modal.block_stop_policy_label': 'Stopping strategy:',
    'modal.block_stop_policy_auto': 'Automatic by train length',
    'modal.block_stop_policy_center': 'Always platform center',
    'modal.block_stop_policy_signal': 'Always at signal',
    'modal.block_split_ratio_label': 'Split at (%):',
    'modal.block_center_margin_label': 'Train center past split (cm):',
    'modal.block_signal_margin_label': 'Distance to signal (cm):',

    // Turnout Modal
    'modal.turnout_title': '⎇ Configure Turnout',
    'modal.turnout_name_label': 'Turnout Name: *',
    'modal.turnout_name_placeholder': 'e.g. Turnout W1 East',
    'modal.turnout_address_label': 'DCC Accessory Address (1 - 2048): *',
    'modal.turnout_inverted_label': 'Invert Polarity',
    'modal.turnout_inverted_desc': '(Swap Straight ↔ Thrown)',
    'modal.turnout_btn_save': '💾 Save Turnout',

    // Signal Modal
    'modal.signal_title': '🚦 Configure Signal',
    'modal.signal_btn_save': '💾 Save Signal',

    // Inspector Modal
    'modal.inspector_title': '🔍 Track Layout & Block Diagnostics',
    'modal.inspector_tab_diag': 'Layout Check & Block Assignment',
    'modal.inspector_tab_routes': 'Auto Route Generator',
    'modal.inspector_btn_refresh': '🔄 Re-scan',
    'modal.inspector_btn_close': 'Close',

    // Block Types
    'block.type.station': '🏢 Main Station (Halt with wait time & sounds)',
    'block.type.local_station': '🚏 Regional Halt (Halt for regional, pass-through for ICE/freight)',
    'block.type.shadow_station': '🚇 Staging Yard (Train storage & parking)',
    'block.type.mainline': '🛤️ Mainline (Passing track)',
    'block.type.siding': '🏗️ Siding / Shunting Track',

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

  // Update window title if available
  const titleText = t('app.title');
  if (titleText && titleText !== 'app.title') {
    document.title = titleText;
  }

  // Update elements with data-i18n attribute
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const translated = t(key);
      const icon = el.querySelector('.icon, .tab-icon, svg.svg-icon');
      if (icon) {
        el.innerHTML = `${icon.outerHTML} ${translated}`;
      } else if (el.children.length === 0) {
        el.textContent = translated;
      } else {
        el.textContent = translated;
      }
    }
  });

  // Update elements with data-i18n-html attribute
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (key) {
      el.innerHTML = t(key);
    }
  });

  // Update elements with data-i18n-title
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      el.title = t(key);
    }
  });

  // Update elements with data-i18n-placeholder
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.placeholder = t(key);
    }
  });

  // Synchronize language dropdown in Settings
  const settingLangSelect = document.getElementById('setting-language') as HTMLSelectElement | null;
  if (settingLangSelect && settingLangSelect.value !== currentLang) {
    settingLangSelect.value = currentLang;
  }

  // Update language toggle button in header
  const langBtn = document.getElementById('btn-lang-toggle');
  if (langBtn) {
    const isDe = currentLang === 'de';
    langBtn.innerHTML = isDe
      ? `<span class="lang-flag">🇬🇧</span> <span class="lang-text" style="font-weight:700;letter-spacing:0.5px;">EN</span>`
      : `<span class="lang-flag">🇩🇪</span> <span class="lang-text" style="font-weight:700;letter-spacing:0.5px;">DE</span>`;
    langBtn.title = t('btn.lang_title');
  }

  // Update helper text in track canvas if available
  const trackCanvas = (window as any).trackCanvas;
  if (trackCanvas && typeof trackCanvas.updateHelperText === 'function') {
    trackCanvas.updateHelperText();
  }
}
