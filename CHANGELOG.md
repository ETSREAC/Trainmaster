# Changelog - TrainMaster

Alle wesentlichen Änderungen, neuen Features und Fehlerbehebungen an TrainMaster werden in dieser Datei chronologisch festgehalten.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/) und folgt [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [1.4.0] - 2026-09-22

### 🎮 Hardware & Bedienelemente (Stream Deck XL & USB-Macropads)
- **Globale Tastatur- & Macropad-Steuerung (USB Rotary Knobs & Keypads)**:
  - Volle Unterstützung für handelsübliche programmierbare USB-Macropads mit Drehknopf (z. B. 3-Key / 6-Key / 9-Key Keypads) und Standard-PC-Tastaturen.
  - **Fahrstufen-Regelung**: `BildAuf` / `PfeilHoch` / `W` (+5 Fahrstufen) und `BildAb` / `PfeilRunter` / `S` (-5 Fahrstufen); `Pos1` / `X` für Soforthalt (0).
  - **Funktionen & Richtung**: `L` / `0` für Licht (F0), `1`–`9` für Sonderfunktionen F1–F9, `R` für Fahrtrichtungsumkehr (FWD/REV), `P` für Gleisstrom ein/aus.
  - **Lok-Auswahl & Not-Aus**: `Tab` zum schnellen Durchwechseln der Lokomotiven, `Leertaste` für sofortigen Not-Aus.
  - Eingabefelder (`<input>`, `<textarea>`) sind geschützt, sodass beim Tippen von Namen oder IPs keine Hotkeys versehentlich auslösen.
- **Natives Elgato Stream Deck Plugin (`com.etsreac.trainmaster.sdPlugin`)**:
  - Volle Zwei-Wege-WebSocket-Integration mit TrainMaster (`ws://localhost:3001`).
  - **9 Aktionen**: Gleisstrom (Power mit Live-Status ⚡), Not-Aus (🛑), Automatik-Modus (🤖), Lokomotive auswählen (mit Live-Geschwindigkeit & Richtung 🚂), Lok-Funktionen (F0–F28 mit Statusrückmeldung 💡/🔊), Fahrtrichtungsumkehr (🔄), Weichen stellen (🔀), **Gleisplan D-Pad Kamera-Steuerung (🧭)** und **Interaktive Gleisplan-Kachel (🗺️)**.
  - **Interaktives Gleisbildstellpult (7x4 Viewport + D-Pad)**:
    - **D-Pad-Steuerung (`tracknav`)**: Linke Spalte auf Stream Deck XL fungiert als Richtungssteuerung (⬆️ Hoch, ⬇️ Runter, ⬅️ Links, ➡️ Rechts) zum dynamischen Verschieben des Kartenausschnitts mit Live-Koordinatenanzeige.
    - **Dynamische Vektor-Kacheln (`tracktile`)**: Die verbleibenden 28 Tasten (7x4) rendern den Gleisplan in Echtzeit als hochauflösende Vektor-SVGs (Gleise, Kurven, Kreuzungen, Prellböcke, Signale, Weichen und Belegtmelder).
    - **Direkte Touch-Interaktion**: Weichen schalten beim Tastendruck direkt um (Gerade/Abzweig) und Signale wechseln das Signalbild per Knopfdruck.
    - **Live-Zustandsanzeige**: Belegte Blöcke leuchten rot auf und zeigen die Zugbezeichnung/DCC-Adresse.
  - Automatische 1-Klick-Installation via `install_streamdeck_plugin.bat` direkt in `%APPDATA%\Elgato\StreamDeck\Plugins\`.
  - **3D-Druck-Konsole für Stream Deck XL + Brimford Drehregler**: Angewinkelte Pult-Halterung (`sd_xl_puck_console.stl` in `hardware/enclosure/streamdeck_xl_dock/`) mit integrierter Kabelführung.
- **Flüssige Touch- & Maus-Bedienung des Handregler-Sliders**:
  - **In-Place DOM-Updates statt Re-Render**: Die Throttle-Cards werden bei WebSocket-Updates nicht mehr abgerissen und neu erzeugt (`innerHTML = ''`), sondern gezielt im DOM aktualisiert. Dadurch bricht der Dragging-Vorgang nie wieder mittendrin ab.
  - **Pointer-Capture**: `setPointerCapture` stellt sicher, dass der Finger oder Mauszeiger auch bei schnellen Wischbewegungen außerhalb des Slider-Bereichs fest mit dem Regler gekoppelt bleibt.
  - **Eingabe-Schutz vor Server-Echo**: Solange ein Slider aktiv gezogen wird, überschreiben eingehende Server-Telemetriedaten die Reglerposition nicht.
  - **Event-Drosselung (25 Hz)**: Schnelle Drag-Events werden auf 25 Updates/s gedrosselt, um den WebSocket-Kanal nicht zu überlasten; der Endwert wird beim Loslassen (`pointerup`/`change`) garantiert sofort übertragen.

### 🧹 Bereinigung & Out of Scope (OOS)
- **TrainMaster ThrottleOne (ESP32-Handregler) [OOS]**: Der DIY-Hardware-Handregler wurde verworfen und aus dem Projektumfang gestrichen. Vollständig entfernt wurden:
  - Technische CAD-Konstruktionspläne & Maßzeichnungen (`docs/BLUEPRINT_THROTTLEONE_CAD.md`).
  - Einkaufsliste & Stückliste (`docs/BAUTEILE_HANDREGLER_BOM.md`).
  - Hardware- und Gehäuse-Konzeptdokumente (`docs/TRAINMASTER_HANDREGLER_KONZEPT.md`, `docs/3D_DRUCK_GEHAEUSE_ANLEITUNG.md`, `docs/assets/throttle_mockup.jpg`).
  - Parametrisches 3D-Gehäusemodell (`hardware/enclosure/TrainMaster_ThrottleOne.scad`), Generierungsskript (`scripts/generate_enclosure.py`) und alle Handregler-STL-Dateien (`hardware/enclosure/stl/`).
- **ESP32 Firmware & Flashing-Werkzeuge [OOS]**: Sämtliche Flashing-Bestandteile und Firmware-Dateien wurden als Out of Scope verworfen und entfernt (`firmware/TrainMasterNode/` inkl. `TrainMasterNode.ino`, `README.md`, `platformio.ini` sowie `docs/SIGNALE_ESP32_ANLEITUNG.md`).
- **Kabelloses Rückmeldekonzept "SpotWIO" [OOS]**: Die Konzeptionsdokumentation zur funkbasierten Rückmeldung (`docs/RUECKMELDE_KONZEPT_KABELLOS.md`) wurde verworfen und entfernt.
- **CrowPanel 1.28" Rotary Display Konzept [OOS]**: Das experimentelle Display-Konzept (`docs/CROWPANEL_ROTARY_KONZEPT.md`) wurde als Out of Scope entfernt.
- **Fokus-Ausrichtung**: Physische Steuerung konzentriert sich gezielt auf etablierte Standard-Hardware (Elgato Stream Deck XL und USB-Macropads / Tastaturen) sowie die native Web-Applikation.

---

## [1.3.1] - 2026-09-18

### 🛠️ Highlights (Patch / Bugfix)
- **Freie Port-Eingabe & Stabilität im DCC-EX Einstellungsdialog**:
  - **Freie COM-Port-Eingabe**: Das COM-Port-Feld unter *Einstellungen > Zentrale (DCC-EX)* ist nun ein flexibles Eingabefeld mit Autovervollständigungs-Datalist statt eines starren `<select>`-Dropdowns. Beliebige Ports (z. B. `COM1`–`COM99` oder Linux/macOS-Gerätepfade wie `/dev/ttyUSB0`) können frei von Hand eingetragen oder über den Button `🔄 Suchen` automatisch erkannt und vorgeschlagen werden.
  - **Eingabeschutz vor Hintergrund-Überschreibungen**: Hintergrund-Telemetrie und Log-Nachrichten (z. B. periodische Reconnect-Meldungen bei noch nicht verbundener Zentrale) überschreiben nun nicht mehr aktiv fokussierte oder editierte Eingabefelder (`dcc-port`, `dcc-ip`, `dcc-serial-port`, etc.). Das Zurücksetzen und Flackern während des Tippens wurde vollständig behoben.
  - **Robustes Einstellungs-Handling**: Sichere Port-Konvertierung mit Fallbacks gegen `NaN` und automatische Whitespace-Bereinigung beim Speichern.

### Added
- `start.bat` & `TrainMaster_Windows.bat`: 1-Klick-Starter für Windows mit Node/npm-Prüfung und automatischem Start von Backend, Frontend und Browser.
- `TrainMaster_macOS.command` & `start.sh`: Doppelklickbarer 1-Klick-Starter für macOS (Finder-kompatibel) und Linux (`chmod +x`).
- `scripts/start.mjs`: Vereinheitlichter, farbcodierter Multi-Process-Runner (`npm run dev`) mit automatischem Browser-Launch und sauberem Prozess-Shutdown.

### Fixed
- `client/index.html`: `dcc-serial-port` von `<select>` zu `<input type="text" list="dcc-serial-port-list">` umgebaut inklusive informativer Hilfebeschreibung.
- `client/src/components/SettingsTab.ts`: Dirty-Tracking und Fokus-Prüfung (`isElementFocused`) implementiert; Initial-Befüllung von `s.commandStation.serialPort` korrigiert; `updateSerialPortsDatalist` ergänzt.

---

## [1.3.0] - 2026-09-10

### 🚀 Highlights (Minor / Sub-Version)
- **Live Wartezeit-Timer & Telemetrie im Gleisplan**:
  - **Echtzeit-Countdown auf dem Gleis**: Steht ein Zug in einem Block (z. B. Bahnhof oder Schattenbahnhof), wird die verbleibende Wartezeit direkt auf dem Block-Badge im Gleisplan sekündlich heruntergezählt (`⏳ Abfahrt in 14s`).
  - **Ausfahrts-Blockierungserkennung (`🚦 Warten auf freies Gleis`)**: Ist die geplante Wartezeit abgelaufen, aber das Ausfahrsignal rot oder die Weichenstraße durch einen anderen Zug belegt, schaltet der Block visuell auf Rot/Warnung mit Klartextanzeige um. Der Fahrdienstleiter sieht sofort, warum der Zug nicht abfährt.
  - **Sofort-Abfahrts-Taste (`⚡ Sofort abfahren lassen`)**: Im Block-Rechtsklick-Menü kann die verbleibende Wartezeit per Klick sofort übersprungen werden, um den Zug auf Wunsch unmittelbar abfahren zu lassen.
  - **Kontextmenü-Statusbox**: Detaillierte Anzeige der Soll- und Restwartezeit im Block-Menü mit synchronem Live-Countdown.

### Added
- `server/src/types.ts` & `client/src/types.ts`: `BlockWaitTimer` Interface mit `departureTimestamp`, `totalWaitSec` und `status` (`WAITING` / `DISPATCH_BLOCKED`). Neuer WS-Befehl `DISPATCH_BLOCK_NOW`.
- `server/src/engine/RouteEngine.ts`: Wartezeit-Tracking in `scheduleDeparture`, `clearBlockTimer` und Methode `dispatchBlockNow(blockId)`.
- `server/src/index.ts`: WebSocket-Handler für `DISPATCH_BLOCK_NOW` und `onBlockUpdated` Callback-Verknüpfung.
- `client/src/components/TrackCanvas.ts`: Dynamische Badge-Höhe (48px) bei aktivem Timer, Live-Text-Ticker ohne Re-Render-Overhead (`tickWaitTimers()`) und Kontextmenü-Timer-Box mit Sofort-Start-Button.
- `client/src/style.css`: Farbcodierte Stile für `.ctx-timer-box` (Gold für Halt / Rot für Ausfahrtsblockierung) und `.ctx-menu-item.primary`.

---

## [1.2.1] - 2026-09-10

### 🛠️ Highlights (Patch / Bugfix)
- **Sensor-Zuordnung & Geisterzug-Schutz im Handbetrieb**:
  - Rückmelder-Events auf unreservierten Blöcken lösen im Handbetrieb / Einrichtbetrieb keinen Geisterzug-Nothalt mehr aus. Stattdessen wird der Block als belegt (`OCCUPIED`) markiert, sodass Züge ungestört manuell rangiert und Sensoren getestet werden können.
  - Echte Geisterzug-Erkennung (`GHOST` mit Nothalt) greift nun zielgerichtet bei aktiviertem Automatikmodus, wenn ein Zug unerwartet in ein nicht reserviertes Gleis einfährt.
- **Schnelle Zugzuweisung im Gleis-Kontextmenü**:
  - Die "Zug aus Depot aufsetzen" Schnellwahltasten stehen nun für alle Block-Zustände (`FREE`, `OCCUPIED`, `GHOST`) zur Verfügung. Loks können mit einem Klick belegten Blöcken zugeordnet oder getauscht werden.
- **Sensor-Multimapping für Zweirichtungs-Gleise**:
  - `BlockManager` unterstützt mehrere Block-/Rollen-Zuordnungen pro Rückmelder (`sensorToBlockMap`), wodurch Überschreibungen bei gemeinsam genutzten ENTER/IN-Meldern in Gegenrichtung verhindert werden.
- **Automatik Dispatcher & Lok-Synchronisation**:
  - Beim Erreichen eines Blocks (`ENTER` und `IN`) wird `currentBlockId` der Lokomotive sofort im `LocoManager` synchronisiert und persistiert.
  - Der Automatikmodus prüft nun direkt beim Einschalten auf abfahrbereite Züge und gibt eine informative Rückmeldung, falls noch keine Züge aufgestellt sind.
  - Automatische Rücksetz-Impulse (`autoReset: true`) für simulierte Sensoren verhindern dauerhaft hängende Besetztmelder.

### Fixed
- `server/src/engine/BlockManager.ts`: Array-basiertes Sensor-Mapping zur Auflösung von Richtungskonflikten und differenzierte Geisterzug-Prüfung (`isAutomaticMode`).
- `server/src/engine/RouteEngine.ts`: Sofortige Routenprüfung (`checkAndDispatchAll()`) beim Aktivieren des Automatikmodus.
- `server/src/index.ts`: Lok-Block-Synchronisation bei `onEnterTriggered` und `onInTriggered` sowie Entprellung und Auto-Reset für virtuelle Sensor-Simulation.
- `client/src/components/TrackCanvas.ts`: Schnelle Zugzuweisung und Lok-Tausch im Kontextmenü auch für belegte und gestörte Blöcke verfügbar gemacht.

---

## [1.2.0] - 2026-09-10

### 🚀 Highlights (Minor / Sub-Version)
- **Automatikmodus 2.0 ("Intelligenter Dispatcher")**:
  - **Block-Typen**: Jeder Block kann nun als Hauptbahnhof (`STATION`), Regionalbahnhof / Haltepunkt (`LOCAL_STATION`), Schattenbahnhof (`SHADOW_STATION`), Freie Strecke (`MAINLINE`) oder Abstellgleis (`SIDING`) konfiguriert werden.
  - **Zug-Klassifizierung & Durchfahrtslogik**: Regionalbahnhöfe unterscheiden Züge nach ihrem Typ: Regional- und Nahverkehrszüge (`COMMUTER`, `PASSENGER`) halten planmäßig am Bahnsteig, während Hochgeschwindigkeitszüge (`HIGH_SPEED` wie ICE/TGV) und Güterzüge (`FREIGHT`) **ohne Halt durchfahren**!
  - **Konfigurierbare Wartezeiten**: Einstellbarer Zufallsbereich (Min–Max Sekunden) für lebendigen, unvorhersehbaren Modellbahnbetrieb.
  - **Zuglängen-Prüfung**: Der Automatikmodus prüft die Länge von Lok und Zugverband gegen die Blocklänge, um Überlängen zu verhindern.
- **Sound-Choreografie & Akustik**:
  - **DCC-Funktionstasten-Trigger**: Automatischer Schaffnerpfiff / Signalhorn (z. B. F3) vor der Abfahrt mit einstellbarer Vorlaufzeit (z. B. 3s vor Grün/Fahrt).
  - **Web Audio Synthesizer**: Soundausgabe direkt im Browser ohne Zusatzhardware (synthetisierter Schaffnerpfiff & Bahnhofsgong über HTML5 Web Audio API).
  - **Dauerhafte Ideen-Sammlung**: Neues Referenzdokument `docs/SOUND_IDEAS.md` für alle zukünftigen Soundideen (WIO DFPlayer-Module, Bahnübergang-Bimmeln, Lautsprecher am Bahnsteig).

### Added
- `server/src/types.ts` & `client/src/types.ts`: `BlockType`, `BlockSoundConfig` und WebSocket-Event `PLAY_SOUND` hinzugefügt.
- `server/src/engine/RouteEngine.ts`: `notifyTrainArrival()`, `scheduleDeparture()`, `clearBlockTimer()` und Durchfahrtsentscheidung implementiert.
- `client/index.html`: Block-Modal um Block-Typ-Auswahl, Wartezeiten-Felder und Sound-Konfiguration erweitert.
- `client/src/components/TrackCanvas.ts`: Block-Badges zeigen ihren Typ mit Icons auf dem Gleisplan an (🏢, 🚏, 🚇, 🛤️, 🏗️).
- `client/src/components/TrainDepotDrawer.ts`: Farbcodierte Typ-Badges für alle 5 Zugtypen (`HIGH_SPEED`, `PASSENGER`, `COMMUTER`, `FREIGHT`, `SHUNTER`).
- `client/src/wsClient.ts`: Web Audio Synthesizer für automatische Soundeffekte integriert.
- `docs/SOUND_IDEAS.md`: Umfassendes Ideen- und Hardware-Handbuch für Modellbahn-Sound.

---

## [1.1.1] - 2026-09-10

### 🛠️ Highlights (Patch / Bugfix)
- **Zuverlässige Block-Freigabe**: Behebung eines Fehlers, bei dem Blöcke im Zustand `RESERVED` (Fahrstraße aktiv/abgebrochen) oder mit abweichender Lok-Zuordnung nicht direkt freigegeben werden konnten.
- **Kontextmenü-Aktionen**: Das Rechtsklick- bzw. Long-Press-Menü auf Blöcken bietet nun für alle Zustände (`RESERVED`, `OCCUPIED`, `GHOST`) einen direkten Freigabe- und Quittierungs-Button.
- **Server-Datenkonsistenz**: Synchronisation von `currentBlockId` direkt im `LocoManager` sichergestellt, sodass Lok- und Block-Status beim Speichern in `layout.json` und beim Seiten-Reload stets synchron bleiben.
- **Nothalt-Rekursionsschutz**: Schutz vor Stack-Overflow-Schleifen zwischen HAL-Simulator und System-Events in `triggerEmergencyStop`.

### Fixed
- `server/src/engine/LocoManager.ts`: Methode `setLocoBlock(id, blockId)` hinzugefügt, um Lok- und Block-Zustände im internen Map-Speicher synchron zu halten.
- `server/src/index.ts`: In `ASSIGN_LOCO_TO_BLOCK` und `FREE_BLOCK` werden Lok-Referenzen jetzt über den `LocoManager` aufgelöst und konsistent an alle Clients gestreamt.
- `server/src/index.ts`: Rekursions-Guard in `triggerEmergencyStop()` und `resumeStop()` verhindert doppelte Kaskaden bei HAL-Callbacks.
- `client/src/components/TrackCanvas.ts`: Block-Kontextmenü zeigt jetzt für `RESERVED`, `OCCUPIED` (ohne Lok) und `GHOST` eindeutige Statusmeldungen und den "Block freigeben"-Button an.

---

## [1.1.0] - 2026-09-10

### 🌐 Highlights
- **Dual-Language System (DE / EN)**: Vollständige Zweisprachigkeit in der gesamten Benutzeroberfläche mit 1-Klick-Sprachumschalter (`🇩🇪 DE` / `🇬🇧 EN`) im Header.
- **Zweisprachige Dokumentation**: Vollständiges englisches `README.md` und deutsches `README_de.md` mit Schnellwechsel-Links.
- **Steering-Richtlinie für Versionierung**: Verbindliches Regelwerk (`STEERING.md` & `.agents/rules/versioning.md`) zur semantischen Einstufung jeder Änderung in Major (`X.0.0`), Minor/Sub (`1.X.0`) oder Patch/Sub-Sub (`1.0.X`).

### Added
- **i18n Sprachmodul (`client/src/i18n.ts`)**:
  - Dynamische Übersetzung für Tabs, Toolbar-Buttons, Header-Stati, Handregler und Zugdepot.
  - Speicherung der bevorzugten Sprache im Browser (`localStorage`).
  - Reaktive Aktualisierung aller DOM-Elemente mit `data-i18n` und `data-i18n-title`.
- **Zweisprachige Dokumentation**:
  - `README.md`: Vollständige englische Dokumentation für internationale Community auf GitHub.
  - `README_de.md`: Vollständige deutsche Original-Dokumentation.
- **Release- & Versionierungs-Steering**:
  - `STEERING.md`: Detaillierter Entscheidungsbaum und Workflow für Major-, Minor- und Patch-Releases.
  - `.agents/rules/versioning.md`: System-Regel für KI-Assistenten zur automatischen Durchsetzung der Richtlinie.

### Changed
- `wsClient.notify()` ist nun öffentlich zugänglich, um UI-Re-Rendering bei Sprachwechseln sofort auszulösen.
- Versions-Tag im Web-Header auf `v1.1.0 • Modern Dispatcher` aktualisiert.

---

## [1.0.0] - 2026-09-10

### 🚀 Highlights
- **TrainMaster Stellwerk & Gleisplan-Editor**: Modernes, hardwarebeschleunigtes SVG-Stellpult mit dynamischem 80x80 Raster, stufenlosem Zoom und Click & Drive Routing.
- **Topologie-Inspektor & Fahrstraßen-Automatik**: Graphentheoretische Pfadsuche mit Flankenschutz, Weichenverriegelung und automatischer Signalbegriffs-Ermittlung (Hp1/Hp2).
- **ESP32 TrainMasterNode Firmware**: Dedizierte Firmware für dezentrale Steuerknoten mit UDP-Kommunikation, mDNS-Discovery, Servo-Weichenantrieben und Rückmelde-Erfassung (WIO-kompatibel).
- **Vollwertige Touchscreen-Bedienung**: Optimiert für iPads, Tablets und Touchmonitore (Gestensteuerung, Haptik, Tap-to-Place).

### 🖥️ Frontend & Gleisplan (Client)
- **Multi-Layer Z-Order Rendering**:
  - Trennung in `#layer-tracks` (Gleise, Schotter, Weichen, Signale, Sensoren) und `#layer-blocks` (Block-Badges, Zuginformationen).
  - Blöcke und Zugbeschriftungen liegen garantiert immer über allen Gleisen und Nachbarkacheln.
  - Blickdichte Trägerplatte (`#0d1117`) unter Blöcken verhindert das Durchscheinen von Schienensträngen durch Lok- und Blocktexte.
  - Dynamische Breiten- und Schriftgrößenskalierung für lange Block- und Zugnamen.
- **Touch- & Gestensteuerung**:
  - 1-Finger Drag-to-Pan und 2-Finger Pinch-to-Zoom auf dem Gleisplan mit Richtungssperre.
  - 500ms Long-Press auf Gleisblöcke (Rechtsklick-Ersatz auf Touchscreens) zum Öffnen des Kontextmenüs mit Vibrations-Feedback.
  - 450ms Long-Press auf Rückmelder zum Umschalten der Dauerbelegung (Shift-Klick-Ersatz).
  - Zugdepot-Drawer: Tap-to-Place (Lok auswählen -> Zielblock antippen) sowie Touch-Drag mit Schwebeminiatur (`touch-drag-ghost`).
  - Handregler: 36px Fahrstufen-Slider mit `touch-action: none` und taktilen Tasten.
- **Signal-System**:
  - Unterstützung für 2-begriffige Blocksignale (Hp0/Hp1), 3-begriffige Ein-/Ausfahrsignale (Hp0/Hp1/Hp2), Rangiersignale (Sh0/Sh1) und Mehrabschnittssignale.
  - Vorbildgetreue Mastschilder (rot-weiß bzw. weiß-blau-weiß) und 180°-Gegenrichtungsunterstützung (Beschriftungen stehen nie auf dem Kopf).
- **Testbetrieb & Simulation**:
  - Im Einstellungs-Tab konfigurierbarer Testbetrieb: Rückmelder können im Fahrbetrieb direkt per Klick oder Fingertipp ausgelöst werden (Überfahrt simulieren oder Dauerbelegung).

### 🧭 Backend & Stellwerkslogik (Server)
- **Topologie-Analyse (`TrackTopology.ts`)**:
  - Automatische Erkennung offener Gleisenden, fehlender Prellböcke und fehlerhafter Weichenverbindungen.
  - Fahrtrichtungsabhängige Zuordnung von `enter`- und `in`-Meldern für Plus- und Minus-Richtung.
- **Fahrstraßen-Automatik (`RouteGenerator.ts`)**:
  - Vollautomatische Pfadsuche über beliebig komplexe Weichenstraßen.
  - Automatischer Signalschutz (Hp2 bei abzweigenden Weichen im Fahrweg, Hp1 bei rein gerader Strecke).
- **BBT (Block Brake Timer)**:
  - Intelligentes millimetergenaues Abbremsen von Zügen zwischen `enter` und `in` basierend auf Fahrstufen und Zugcharakteristik.
- **Geisterzug-Erkennung (Ghost Train Detection)**:
  - Sofortiger Nothalt bei unautorisierter Belegung nicht reservierter Blöcke.

### 🔌 Firmware (`TrainMasterNode`)
- **ESP32 Firmware mit PlatformIO / Arduino IDE Support**:
  - Schnelle UDP-Paketverarbeitung mit Ringpuffern und Sequenznummern.
  - WiFiManager für einfachen Hotspot-Verbindungsaufbau im Heimnetzwerk.
  - Unterstützung für PCA9685 16-Kanal PWM-Servotreiber, MCP23017 I2C Port-Expander und WS2812B NeoPixel.
