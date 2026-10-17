# Changelog - TrainMaster

Alle wesentlichen Änderungen, neuen Features und Fehlerbehebungen an TrainMaster werden in dieser Datei chronologisch festgehalten.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/) und folgt [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [1.9.0] - 2026-10-16

Minor-Release: Lokbilder (Ticket `TICKET_LOCO_IMAGES_THROTTLE_AND_BLOCKS`).

### Added
- Lokbild im Lok-Dialog wählen oder entfernen. Fotos werden im Browser auf max. 640 × 360 px verkleinert und als WebP (Fallback JPEG) hochgeladen.
- Anzeige im Fahrregler, in belegten Blöcken (reserviert: halbtransparent), im Block-Kontextmenü, im Depot und im Touch-Drag. Ohne Bild erscheint ein Platzhalter passend zur Zugart.
- Server-Endpunkte `POST/DELETE /api/locos/:id/image` und `GET /api/loco-images/:file`. Bilder liegen als Dateien in `server/data/loco-images/`, nicht im Layout-JSON, damit Fahrstufen-Updates klein bleiben.
- Tests: `npm run test:images` (Formaterkennung, Validierung, HTTP-Ende-zu-Ende).

### Security
- Nur JPEG, PNG und WebP (geprüft an der Dateisignatur, kein SVG), max. 1 MB, Dateinamen ausschließlich serverseitig erzeugt. Das Bildfeld kann über `CREATE_LOCO`/`UPDATE_LOCO` nicht gesetzt werden.
- Hinweis: Wie die übrige API sind die Endpunkte im LAN ohne Anmeldung erreichbar.

---

## [1.8.1] - 2026-10-16

### Fixed
- DCC-EX: Fahrstufe wird auf 0–127 begrenzt. Vorher konnte 128 gesendet werden, was außerhalb des gültigen Bereichs liegt.

### Added
- Tickets: Lokbilder im Fahrregler/Blöcken, DCC-EX-Verbindungssicherheit & Lok-Broadcasts.

---

## [1.8.0] - 2026-10-15

Minor-Release: neues, rückwärtskompatibles Automatik-Feature.

### Added
- **50/50-Gleisaufteilung mit dynamischem Haltepunkt** (Ticket `TICKET_50_50_BLOCK_HALTEPUNKT`):
  - Pro Block per Checkbox aktivierbar; ohne Häkchen bleibt der Punktmelder-Modus (Standard) unverändert.
  - Haltestrategie `Automatisch nach Zuglänge` / `Immer Bahnsteigmitte` / `Immer am Signal`, Teilung (20–80 %), Margen für Mitte und Signal.
  - Kurzzug hält mit der Zugmitte in Bahnsteigmitte, Langzug fährt ohne Vorbremsung bis Melder B und hält kurz vor dem Signal.
  - Geschwindigkeitsmessung ohne Einmessen: Aus der ersten Gleishälfte und den gesendeten Fahrstufen wird die Bremsrampe zum Haltepunkt berechnet, Abschluss per virtuellem IN.
  - Zweirichtungsbetrieb spiegelverkehrt, Not-Halt bricht Haltepläne ab, Prellschutz für Belegtmelder.
- Tests: `npm run test:split` (Node-Testrunner, 20 Fälle inkl. Fahrsimulation), Teil von `npm test`.

### Fixed
- DCC-EX: Kein `<s>`-Polling mehr alle 10 s. TCP nutzt nur den Socket-Keepalive, seriell gibt es alle 30 s ein schlankes `<#>` mit Timeout-Erkennung (75 s). `<s>` wird nur noch beim Verbinden gesendet.
- DCC-EX: Wiederholte Spannungsmeldungen (je Gleisausgang) lösen kein erneutes Senden aller Lokfunktionen mehr aus. Funktionen werden nur beim Wechsel AUS → EIN und nach einem Wiederverbinden synchronisiert.
- Automatische Melderzuordnung: Bei Gleisschleifen ohne Weiche werden keine Melder des Nachbarblocks mehr übernommen (verursachte vertauschte Melder und Geisterzug-Not-Halt).
- BBT: Eine stehende Lok wird bei erneutem ENTER-Ereignis (z. B. prellender Belegtmelder unter dem Zugende) nicht mehr per Bremsrampe angefahren.

---

## [1.7.9] - 2026-10-15

Patch-Release: Behebt die 22 funktionalen Befunde CR-01 bis CR-22 aus dem Code Review vom 15.10.2026. ESP32-Firmware `TrainMasterNode.ino` auf v2.1.1.

### Fixed
- **Not-Halt**
  - CR-01: Leertaste löst nur noch Not-Halt aus (Tastenwiederholung ignoriert, keine versehentliche Freigabe).
  - CR-02: Laufende BBT-Bremsrampen werden beim Not-Halt abgebrochen und können keine alten Fahrstufen mehr setzen.
  - CR-08: DCC-EX sendet für den globalen Not-Halt `<!>` statt `<->`.
- **Fahrstraßen**
  - CR-03: Verzögerter Abfahrtsbefehl wird bei Auflösung abgebrochen und prüft vor der Fahrt Route, Reservierung, Weichen und Not-Halt erneut.
  - CR-04: Automatik aus stoppt nur neue Abfahrten; laufende Fahrstraßen bleiben bis zur Ankunft verriegelt. `resetActiveRoutes` hebt Zielreservierungen auf und stellt Signale auf HP0.
  - CR-05: Überfahrene Kreuzungen werden als `crossingIds` in generierten Routen gespeichert und gegenseitig ausgeschlossen (Fahrstraßen neu generieren!).
  - CR-06: Pro Lok/Startblock ist nur eine aktive Fahrt möglich.
  - CR-07: Ein-Sensor-Blöcke: Sensor wird als IN (sofortiger Halt) behandelt; Auto-Zuordnung setzt nur IN.
  - CR-22: Automatik fordert die konkret ausgewählte Routenvariante per ID an.
- **Gerätekommunikation**
  - CR-09: DCC-EX-Sensormeldungen `<Q id>`/`<q id>` werden korrekt ausgewertet.
  - CR-10: Z21-Weichenbefehl setzt das Aktivierungsbit (`0x88|P` / `0x80|P`).
  - CR-11: WIO-Signalbefehle gehen nur an den Node mit passender Unit; die Firmware ignoriert Befehle für fremde Units.
  - CR-12: WIO-TCP-Empfang mit Zeilenpuffer pro Socket (Server und Firmware).
  - CR-13: ESP32 sendet nach jeder Verbindung einen Sensor-Snapshot; der Server übernimmt nur Abweichungen.
  - CR-14: Z21-Lokfunktionen F0–F31 über `LAN_X_SET_LOCO_FUNCTION` (E4 F8).
- **Zustand & Bedienung**
  - CR-15: Speichern der allgemeinen Einstellungen behält die Raumlicht-Konfiguration.
  - CR-16: Geschwindigkeits-Presets verwenden die aktuelle Kalibrierung der Lok.
  - CR-17: Block-/Weichenlöschung wirkt dauerhaft und entfernt abhängige Fahrstraßen.
  - CR-18: Lok löschen ist während der Fahrt gesperrt und bereinigt Blöcke, Reservierungen und Timer.
  - CR-19: Gespeicherte BBT-Kriechzeit wird beim Start übernommen; BBT-Anzeige nutzt den eingestellten Sollwert.
  - CR-20: Stream-Deck-Plugin übernimmt den `LAYOUT_UPDATED`-Array-Payload.
  - CR-21: Live-Protokoll aktualisiert sich auch nach 200 Einträgen.

---

## [1.7.8] - 2026-10-12

### 📡 ESP32 WIO-Firmware: Asymmetrisches Pulse-Stretching & Haltezeit für gepufferte Wagen
- **Asymmetrische Stromfühler-Erkennung (`TrainMasterNode.ino` v2.1.0)**:
  - Behebt das Problem mit gepufferten LED-Personen- und Steuerwagen, die bei geladenem Kondensator nur noch minimale oder kurzzeitige Nachladeimpulse ziehen.
  - **Sofortiger Trigger (`triggerDelayMs = 5 ms`)**: Reagiert blitzschnell auf kleinste Nachladeströme und Schienenkontakte und meldet den Block sofort als `🔴 BELEGT`.
  - **Haltezeit / Abfallverzögerung (`holdDelayMs = 400 ms`)**: Hält das Belegtsignal für mindestens 400 ms stabil aufrecht. Jeder neue Nachladeimpuls oder Radkontakt setzt den Timer zurück – kein Flattern oder fälschliches Freimelden bei gepufferten Fahrzeugen mehr.
- **Konfigurierbar im ESP32 Web-Dashboard**:
  - Haltezeit und Triggerzeit können direkt auf der internen HTML-Konfigurationsseite des ESP32 (`http://<esp-ip>/`) angepasst und dauerhaft im NVS-Flash gespeichert werden.
- **OTA-Unterstützung (Over-The-Air)**:
  - Integration von `ArduinoOTA` für komfortables Flashen direkt über das lokale Netzwerk neben dem integrierten Web-OTA.

---

## [1.7.7] - 2026-10-11

### ⏱️ BBT Profilauswahl, Fahrten-Historie, Median-Lernen & Profil-Sperre
- **Interaktive Block- & Fahrzeug-Auswahl im BBT-Menü**:
  - Im Reiter **BBT** kann jetzt direkt über Dropdowns zunächst der gewünschte **Block** (z. B. Gleis 1, Gleis 2) und anschließend das **Fahrzeug / die Lokomotive** (z. B. BR 218, Amori701) sowie die **Fahrtrichtung** (`+` Vorwärts / `-` Rückwärts) ausgewählt werden.
  - Zeigt eine fokussierte Detail- und Analysekachel für das ausgewählte Profil an.
  - Per Mausklick auf eine beliebige Zeile in der Gesamt-Matrix wird das entsprechende Profil sofort oben in die Dropdowns geladen und im Detail geöffnet.
- **Fahrten-Historie (Run History) & Messwerte pro Profil**:
  - Jede Einmessung und jede Bremsung im Automatikmodus speichert nun die gemessenen Laufdaten in einer chronologischen Historie (`entry.history`, bis zu 25 Fahrten pro Profil).
  - Übersicht mit Zeitstempel, Kriechzeit (ms), Soll-Kriechzeit (1.200 ms), Abweichung (Δ ms), Vorher/Nachher-Intervall und Status-Badges (🟢 Optimal, 🟡 Lernschritt, 🔴 IN überfahren, 🔒 Fixiert).
  - Möglichkeit zum Leeren der Historie (`🗑️ Historie leeren`), um nach Gleisreinigungen sauber neu einzumessen.
- **Ausreißer-resistente Meridian-/Median-Korrektur**:
  - `BBTEngine` berechnet den statistischen Median aller validen Kriechzeiten aus der Historie, um punktuelle Messschwankungen (Schlupf, Kontaktprellen) auszugleichen.
  - Adaptiver Lernschritt kombiniert 60% Median-Abweichung mit 40% aktuellem Einzellauf für sanfte, stabile Konvergenz gegen die 1.200 ms Zielkriechzeit.
- **Einfahr- & Profil-Sperre (Locking)**:
  - Prominenter Umschalt-Button (`🔒 Profil jetzt sperren` / `🔓 Entsperren & Weiterlernen`): Sobald der Haltepunkt und das Bremsverhalten perfekt eingefahren sind, kann das Profil fixiert werden.
  - Im gesperrten Zustand (`locked: true`) wird das Intervall nicht mehr automatisch verändert, während Fahrten zur Qualitätskontrolle weiterhin protokolliert werden.
  - Manuelle Feinjustierung: Schnelle `[-5 ms]` / `[+5 ms]`-Buttons und Zahleneingabefelder für Bremsintervall und Stufen mit sofortiger Speicherung.
- **Dauerhafte Persistenz in `layout.json`**:
  - Alle Profilaktualisierungen (`locked`, `intervalMs`, `history`) synchronisieren automatisch `data.bbt` und schreiben den aktuellen Zustand dauerhaft in `layout.json`.

---

## [1.7.6] - 2026-10-11

### 🔓 Block-Management: Automatische Freigabe des Vorblocks bei Ankunft (IN) & State-Sync
- **Automatische Freigabe des Vorblocks bei Zielankunft (`IN`)**:
  - Sobald eine Lokomotive an ihrem Haltepunkt (`IN`) im Zielblock ankommt, gibt der `BlockManager` jeden anderen Block, der noch mit dieser Lokomotive verknüpft war (z. B. der Startblock `Gleis 1`), automatisch und restlos frei (`state: 'FREE'`, `currentLocoId: null`).
  - Verhindert, dass Startblöcke nach einer erfolgreichen Zugfahrt auf dem Stellpult fälschlicherweise dauerhaft rot/belegt bleiben.
- **Konsistente Block-Synchronisation & Persistenz (`onBlockUpdated`)**:
  - Jede Block-Statusänderung (Reservierung, Belegung, Freigabe) synchronisiert nun unmittelbar die Server-Datenstruktur `data.blocks = blockManager.getAllBlocks()` und persistiert den Zustand auf Festplatte (`layout.json`).
  - Löst das Problem, dass freigegebene Blöcke durch nachgelagerte Signal-Speicherungen oder Server-Neustarts wieder mit alten Belegungsdaten überschrieben wurden.
- **Reihenfolge bei `releaseRoute`**:
  - Die Freigabe des Startblocks (`freeBlock(r.fromBlockId)`) erfolgt nun vor dem Rückstellen der Signale, sodass Signal-Events stets den bereits freigegebenen Gleisplan sichern.
  - Bereinigung von Gleis 1 in `layout.json` auf den sauberen Zustand `FREE`.

---

## [1.7.5] - 2026-10-11

### 💡 Automatik & DCC: Automatisches Spitzenlicht (F0) & Funktions-Synchronisation
- **Automatisches Spitzenlicht (F0) im Automatikbetrieb**:
  - Sobald der Automatikmodus aktiviert wird (`toggleAutomaticMode(true)`), wird für alle aktuell auf der Anlage in Blöcken aufgestellten Lokomotiven automatisch das Spitzenlicht (F0) eingeschaltet.
  - Bei jeder Zugabfahrt über eine Fahrstraße (`RouteEngine.requestRoute()`) stellt das System sicher, dass das Spitzenlicht (F0) aktiv ist (`setFunction(loco.id, 0, true)`), sendet den DCC-Befehl an die Zentrale und aktualisiert die Benutzeroberfläche.
  - Bei Richtungswechseln an Kopfbahnhöfen und Stumpfgleisen (Wendezug) wird das Spitzenlicht (F0) für die neue Fahrtrichtung unmittelbar bestätigt und aufgefrischt.
- **Hardware-Synchronisation bei Gleisspannung & Verbindung**:
  - Beim Einschalten der Gleisspannung (`SET_POWER` / DCC-EX `<1>`) sowie beim Verbindungsaufbau zur Zentrale (`applyCommandStation`) werden alle in der Datenbank hinterlegten aktiven Lok-Funktionen (Licht F0, Sound F1 etc.) vollautomatisch per DCC an die Decoder gesendet (`syncAllLocoFunctionsToHardware()`).
  - Verhindert, dass Loks nach einem Neustart der Zentrale oder nach Gleisspannungs-Aktivierung im Dunkeln anfahren.
- **Persistierung von Funktions-Zuständen**:
  - Lok-Funktionsänderungen werden in `onLocoUpdated` direkt in `data.locos` übernommen und im Anlagen-Layout dauerhaft gespeichert.

---

## [1.7.4] - 2026-10-11

### 🛡️ Automatik-Schutz bei Nothalt & Phantom-Block-Filter
- **Automatik-Schutz bei Nothalt (Emergency Stop Lockout)**:
  - Behebt die kritische Rennbedingung (Race Condition), bei der ein Zug nach einem Not-Halt oder Geisterzug-Alarm (`speed: 0`) 2 Sekunden später durch die Automatik-Schleife (`checkAndDispatchAll`) sofort wieder mit Reisegeschwindigkeit (`vMid = 45`) gestartet wurde.
  - `triggerEmergencyStop()` schaltet den Automatikbetrieb nun sofort und unwiderruflich ab (`toggleAutomaticMode(false)`), entriegelt alle Fahrstraßen und synchronisiert den Status (`automaticMode: false`) an alle verbundenen Web-Clients.
  - `RouteEngine.checkAndDispatchAll()`, `tryDispatchNext()` und `requestRoute()` prüfen vor jeder Fahrstraßen- und Abfertigungsentscheidung, ob ein Not-Halt aktiv ist (`isEmergencyStop()`), und brechen sofort ab.
  - Zusätzliche Sicherheitsprüfung im HAL/LocoManager: Fahrbefehle mit `speed > 0` werden bei aktivem Nothalt strikt blockiert und geloggt.
- **Geister- & Phantom-Block-Filter für reale Anlagen**:
  - `checkAndDispatchAll()` prüft jetzt strikt, ob die Lokomotive sich noch physisch in dem jeweiligen Block befindet (`loco.currentBlockId === block.id`). Abgefahrene Züge oder Geisterzüge können nicht mehr versehentlich aus alten Blöcken neu gestartet werden.
  - `tryDispatchNext()` validiert Zielblöcke vor der Routenauswahl: Blöcke ohne echte, im System konfigurierte Rückmeldesensoren werden verworfen.
- **Bereinigung der Anlagenkonfiguration (`layout.json`)**:
  - Vollständige Bereinigung verwaister Dummy-Blöcke (`block-strecke`, `block-bf-gl3`, `block-1789034861385-503`) und deren Phantom-Fahrstraßen.
  - Die Anlage ist nun exakt auf das 2-Gleis-Layout (Bahnhof Gleis 1 & Gleis 2, Weiche W1, 4 WIO-Rückmelder) ausgerichtet.
  - Alle aktiven Fahrstraßen und Blockreservierungen wurden neutralisiert und entriegelt.

---

## [1.7.3] - 2026-10-11

### 🔄 Automatik & Wendezugbetrieb: Automatischer Richtungswechsel & Kopfbahnhof-Steuerung
- **Automatischer Richtungswechsel (Wendezug / Kopfbahnhof / Stumpfgleis)**:
  - Bei Ankunft eines Zuges in einem Kopfbahnhof oder Stumpfgleis (alle möglichen Ausfahrten führen in Gegenrichtung zur Einfahrt) wird **sofort am Bahnsteig / Haltepunkt** der Richtungswechsel (`FWD` ↔ `REV`) durchgeführt.
  - Das Spitzen- und Schlusssignal (DCC F0) schaltet bereits während der planmäßigen Haltezeit am Bahnsteig auf die neue Fahrtrichtung um, und der Geschwindigkeitsregler (Throttle) im Web-Frontend spiegelt die neue Abfahrbereitschaft wider.
- **Entfernung der fest codierten Vorwärtsfahrt (`'FWD'`) in `RouteEngine`**:
  - `RouteEngine.requestRoute()` erzwingt nun **niemals** mehr pauschal `'FWD'`, sondern berechnet und respektiert die tatsächliche Fahrtrichtung der Lokomotive (`loco.direction` / `targetDirection`).
  - Züge, die rückwärts (`REV`) aus einem Stumpfgleis oder Kopfbahnhof ausfahren müssen, beschleunigen sauber in Fahrtrichtung `REV` weg vom Prellbock.
- **Dynamische Richtungssynchronisation bei Abfahrt & Block-Reservierung**:
  - `RouteEngine` führt Richtungsspeicher (`locoArrivalDirection`) und vergleicht die Ausfahr-Fahrstraße mit der vorherigen Einfahrt. Verläuft die Ausfahrt in Gegenrichtung, wechselt die Lok automatisch ihre DCC-Richtung.
  - `blockManager.reserveBlock()` synchronisiert die logische Fahrtrichtung des Zielblocks (`block.direction`) direkt mit der gestellten Fahrstraße, sodass `sensorsPlus` und `sensorsMinus` stets exakt zugeordnet werden.
- **Automatisches Entriegeln blockierter Weichen bei Nothalt & Modus-Stopp**:
  - Beim Stoppen des Automatikmodus oder Auslösen des Nothalts werden nun sämtliche aktiven Fahrstraßen und Weichenverriegelungen sauber zurückgesetzt, sodass keine Weichen im Zustand `lockedByRouteId` blockiert bleiben.
  - Bereinigung der Rückmelder-Zuordnung in `layout.json` für Gleis 1 (Gegenrichtung West = Prellbock).

---

## [1.7.2] - 2026-10-11

### 🛑 Präzisions-Halt: Sofort-Stopp bei IN-Sensor & Entprellung
- **Sofortiger BBT-Halt beim kleinsten ersten Kontakt am `IN`-Sensor**:
  - Behebt den Fehler, bei dem ein mit Kriechgeschwindigkeit einfahrender Zug (`speed > 0`) am Ziel-Endsensor fälschlicherweise durch die Ausfahrmaske maskiert wurde, anstatt sofort auf Fahrstufe 0 anzuhalten.
  - Die Ausfahrmaske gilt nun **ausschließlich** für den echten Startblock einer aktiven Abfahrt (`isBlockDeparting`), niemals für den ankommenden Zielblock.
  - Beim ersten Berühren des `IN`-Sensors wird der DCC-Fahrstufenbefehl 0 unverzüglich gesendet und die Lok hält am Haltepunkt an.
- **Entprellung nachfolgender Achskontakte im Stillstand**:
  - Löst der Endsensor durch nachfolgende Achsen oder Wagen im Stillstand 5–6 Mal aus, wird der planmäßige Halte-Countdown nicht mehr neu gestartet.
  - Fahrstraßen und Weichenverriegelungen werden sofort beim `IN`-Ereignis aufgelöst.

---

## [1.7.1] - 2026-10-11

### 🚦 Automatik & Fahrstraßen: Intelligente Ausfahrmaske & Geisterzug-Schutz
- **Ausfahrmaske (Departure Masking)**:
  - Wenn ein Zug in einem Block steht und abfährt (aktive Fahrstraße oder Lok bereits in Fahrt), wird das erneute Überrollen der Block-Kontakte (insbesondere des Ausfahrkontakts / `IN`-Rückmelders) durch Lokräder, Zwischenwagen oder Achskontakte maskiert und quittiert.
  - Verhindert, dass abfahrende Züge durch ihren eigenen Haltekontakt fälschlicherweise auf Fahrstufe 0 gestoppt oder fälschlich als Neuankunft verbucht werden (`bbtEngine.handleInEvent` bleibt bei der Ausfahrt geschützt).
- **Geisterzug-Toleranz bei Ausfahr-Nachlauf & aktiven Fahrstraßen**:
  - Kontakte von kürzlich freigegebenen Blöcken (Freigabe-Toleranz bis 12 Sekunden) werden als regulärer Nachlauf von Wagen oder Achsen erkannt und lösen keinen Fehlalarm mehr aus.
  - Rückmelder, die zu einer aktiven Zugfahrt gehören, lösen keinen Geisterzug-Alarm und keinen General-Nothalt mehr aus.
- **Topologische Bereinigung der Gleis- und Block-Rückmelder**:
  - Gleis 1 (`block-bf-gl1`) und Gleis 2 (`block-bf-gl2`) wurden sauber entflechtet:
    - **Bahnhof Gleis 1**: Anfang = Pin 17 (`sensor_1791733853240`), Ende/Ausfahrt = Pin 16 (`sensor_1791733679017`).
    - **Bahnhof Gleis 2**: Anfang = Pin 19 (`sensor_1791733919791`), Ende/Ausfahrt = Pin 18 (`sensor_1791733911129`).
  - Blockierte Weichen und abgebrochene Fahrstraßen wurden zurückgestellt und entriegelt.

---

## [1.7.0] - 2026-10-11

### 🛠️ Gleisplan-Editor: Automatisches Speichern & Ausfallsicherheit
- **Debounced Auto-Save**: Jede Gleisplatzierung, Drehung und Löschung im Gleisplan-Editor wird nun automatisch nach 600 ms im Hintergrund auf dem Server gespeichert – kein versehentlicher Datenverlust mehr beim Neuladen oder Tab-Wechsel.
- **Sofort-Speichern beim Beenden des Editier-Modus**: Beim Schließen des Editors (`setEditMode(false)`) wird der Gleisplan sofort garantiert auf die Festplatte geschrieben.
- **Lokales Backup-Sicherheitsnetz**: Der aktuelle Gleisplan wird parallel im `localStorage` des Browsers gepuffert, um selbst bei Verbindungsabbrüchen maximale Datensicherheit zu garantieren.

### 🐛 Bugfix: Lokomotiv-Verwaltung & Geschwindigkeitsstufen
- **Formular-IDs synchronisiert (`Throttle.ts` <-> `index.html`)**:
  - Behebt den kritischen Bug, bei dem beim Anpassen von `V_Min`, `V_Mid`, `V_Max` oder Zuglänge eine neue Dummy-Lokomotive (*„Neue Lok“*) angelegt wurde, anstatt die bestehende Lokomotive zu aktualisieren.
  - Formular-IDs (`loco-edit-id`, `loco-form-vmid`, `loco-form-vmin`, `loco-form-name` etc.) sind nun vollständig gemappt.
  - Schließen-, Abbrechen- und Löschen-Buttons im Lok-Modal repariert.

### 📡 Rückmelder & WIO: Dynamisches ESP32 Pin-Raster & Stromfühler
- **Vollständige ESP32-Pinleiste in TrainMaster**:
  - Die bisherige 16-Pin-Beschränkung der WIO-Kachel (`SensorMonitor.ts`) wurde aufgehoben. Ab sofort werden alle ESP32-GPIOs (bis GPIO 39, einschließlich P17, P18, P19, P21, P22, P23 etc.) dynamisch dargestellt und per 1-Klick-Zuweisung ansprechbar gemacht.
  - Server-seitiges `AUTO_CREATE_WIO_SENSORS` und `WioDriver.ts` unterstützen nun die vollständige GPIO-Palette des ESP32.
- **Hardware-Integration: JT Digital 03002 Stromfühler (8x3A)**:
  - Vollständige Einbindung und Dokumentation für Open-Collector-Stromfühler (Massebezug über ESP-GND, Signale auf GPIO 16, 17, 18, 19 mit internem Pull-Up).
  - ESP32-Firmware `firmware/TrainMasterNode` wieder als Kernbestandteil im Repository hinterlegt.

---

## [1.6.1] - 2026-10-02

### 🎮 Hardware & Firmware: CrowPanel 1.28" Rotary Display Tweaks
- **Blendfreie LED-Helligkeit & Live-Regelung**:
  - Standardhelligkeit der 5x WS2812 LEDs von blendenden 180 auf angenehme, augenschonende 35 (~14%) reduziert.
  - Neue Live-Einstellung im Funktionsmenü (`⚙ LED Helligkeit`): Per Klick umschaltbar zwischen *Aus*, *15% (Gedimmt)*, *35% (Normal)* und *80% (Hell)* mit sofortiger visueller Vorschau.
- **Schnellere & anpassbare Kurbel-Geschwindigkeit (Rotary Step Sizing)**:
  - Neue Kurbel-Modi im Menü (`⚙ Kurbel-Tempo`):
    - *Fein (+2 Fahrstufen)*: Präzises Rangieren
    - *Normal (+4 Fahrstufen)*: Ausgewogen (~32 Klicks von 0 auf 128)
    - *Schnell (+8 Fahrstufen)*: Zügiges Beschleunigen (~16 Klicks von 0 auf 128)
    - *Auto / Dynamisch*: Passt die Schrittweite automatisch an das Drehtempo an (langsam drehen = feinfühlig, schneller Sweep = bis zu +14 Stufen pro Raste).
- **Dauerhafte Konfigurations-Persistenz (ESP32 Preferences / NVS)**:
  - Gewählte LED-Helligkeit und Kurbel-Schrittweite werden dauerhaft im Flash-Speicher des ESP32-S3 hinterlegt und bleiben auch nach dem Aus- und Einschalten erhalten.

### 🎮 Hardware & Firmware: CrowPanel 1.28" ESP32-S3 Rotary Display Handregler
- **Standalone Handregler für DCC-EX & TrainMaster**:
  - Vollwertige kabellose Handregler-Firmware für das runde **Elecrow CrowPanel 1.28" ESP32-S3 Rotary Display** (240x240 IPS Touchscreen, Drehregler & 5x WS2812 RGB-LED-Ring) unter `hardware/crowpanel_esp32_rotary/`.
  - **Direkter Standalone-Modus**: Verbindet sich per WLAN direkt via TCP mit der DCC-EX Zentrale (Port 2560) – die Modellbahn kann sofort ohne laufenden PC oder Server gefahren werden.
  - **DCC 128 Fahrstufen-Steuerung**: Butterweiche Geschwindigkeitsregelung über den physischen Drehknopf mit debounctem Makerguides-Encoder-Algorithmus (1 Raste = 1 definierte Fahrstufe, kein Nachlaufen oder Springen).
  - **Fahrtrichtung & Not-Aus (Knob-Button)**:
    - Kurzer Klick toggelt Fahrtrichtung (FWD / REV) mit visueller Bestätigung.
    - Langer Druck (>800 ms) löst einen sofortigen Not-Aus (`<!>` Broadcast Emergency Stop) für die gesamte Anlage aus; erneuter Klick stellt die Gleisspannung (`<1>`) sauber wieder her.
  - **Kapazitive Touch-Gesten (CST816D)**:
    - Wischgesten (Swipe Left/Right) wechseln direkt zwischen den DCC-Adressen (#1 bis #12) mit Gesture-Lock gegen versehentliches Überspringen.
    - Doppelklick auf den Drehknopf oder Touch öffnet das Funktionsmenü (F0 bis F11) zum Schalten von Licht, Sound und Sonderfunktionen.
  - **Flimmerfreie Delta-Grafik (Differential Rendering)**:
    - Zero-Flicker Benutzeroberfläche auf dem runden GC9A01 IPS-Display: Nur tatsächlich geänderte Werte (Tachobogen, Geschwindigkeitswert, DCC-Adresse, Status) werden selektiv neu gezeichnet.
  - **Dynamischer 5x WS2812 RGB LED-Ring**:
    - LED-Tachometer mit farbkodiertem Füllstand proportional zur Geschwindigkeit.
    - Sanftes Status-Glühen im Stillstand je nach Fahrtrichtung (Grün/Blau).
    - Weißer Blitz bei Funktionsschaltung (z. B. Pfeife).
    - Roter Stroboskop-Alarm bei Not-Aus / unterbrochenem Gleisstrom.
- **Server WebSocket Optimierung für Handregler**:
  - `server/src/index.ts`: Filtert unnötigen Datenballast (Gleisplan, Sensoren, Signale, Weichen, Routen) bei dedizierten Throttle-Verbindungen heraus, um RAM und Bandbreite auf Mikrocontrollern drastisch zu schonen.

### 🎨 Design, Brand & UI/UX (Cyber-Neon Edition)
- **Neues Cyber-Neon Markenlogo**:
  - Hochauflösendes, aerodynamisches Logo mit cyan- und neongrün-leuchtender Zugschnauze und verzweigenden Gleisen (`client/public/logo.png`, `client/public/favicon.png`, `docs/assets/logo.png`).
  - Integriert in Header-Branding mit dezentem Neon-Glow und sanfter Hover-Skalierung.
  - Übernommen in das Elgato Stream Deck Plugin (`pluginIcon.png`, `pluginIcon@2x.png`, `categoryIcon.png`, `categoryIcon@2x.png`).
- **Komplette Emoji-Ablösung durch Custom SVG Vector Icon Library (`client/src/icons.ts`)**:
  - Vollständiges Set maßgeschneiderter Vektor-Icons im exakten Stil des Logos (2px Stroke, runde Kappen, 100% skalierbar, Farbübernahme via `currentColor`):
    - **Header & Navigation**: Gleisstrom (`iconPower`), Not-Aus (`iconEstop`), Automatik-Modus (`iconAuto`), Zentrale (`iconCommandStation`), Gleisplan (`iconLayout`), Handregler (`iconThrottle`), BBT (`iconBbt`), Signale (`iconSignal`), Sensoren (`iconSensor`), Weichen (`iconTurnouts`), Fuhrpark (`iconLocos`), Fahrstraßen (`iconRoutes`), Einstellungen (`iconSettings`), Logs (`iconLogs`).
    - **Aktionen & Werkzeuge**: Editieren (`iconEdit`), Löschen (`iconTrash`), Hinzufügen/Entfernen (`iconPlus`/`iconMinus`), Zoom-Controls (`iconZoomIn`, `iconZoomOut`, `iconZoomReset`), Drehen (`iconRotate`), Prüfen/Diagnose (`iconInspect`), Speichern (`iconSave`).
    - **Hardware & Status**: WIO/Funk (`iconRadio`), Suche/Scan (`iconSearch`), Verriegelung (`iconLock`), Warnung (`iconAlert`), Standort/Pin (`iconPin`), Ziel (`iconTarget`), Status-Linsen (`iconDot`), Lautsprecher/Sound (`iconSpeaker`).
    - **Zug-Typen**: Highspeed (`iconTrainHighspeed`), Reisezug/Regional (`iconTrainPassenger`), Güterzug (`iconTrainFreight`), Rangierlok (`iconTrainShunter`).
- **Signal-Monitor Layout & Badge Optimierung**:
  - Getrennte Header-Strukturierung (Titel + Status-Badge oben, Signalbauart-Badge darunter), um Textumbruch-Kollisionen bei längeren Signalnamen zu verhindern.
  - Schärfere Signalbegriffs-Buttons (Hp0, Hp1, Hp2, Sh0, Sh1) mit ausgewogener Beschriftung und leuchtenden Neon-Zuständen (`.active-hp0`, `.active-hp1`, etc.).
- **Bereinigte Sprach- & Lokalisierungs-Strings (`i18n.ts`)**:
  - Beseitigung von hartkodierten Emojis aus Übersetzungs-Wörterbüchern; nahtlose Beibehaltung der dynamischen SVG-Icons bei Sprachwechsel zwischen Deutsch und Englisch.

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
