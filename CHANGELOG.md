# Changelog - TrainMaster

Alle wesentlichen Änderungen, neuen Features und Fehlerbehebungen an TrainMaster werden in dieser Datei chronologisch festgehalten.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/) und folgt [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- **Git-Repository-Initialisierung**: `.gitignore` und `CHANGELOG.md` für strukturierte Versionsverwaltung und Nachverfolgbarkeit hinzugefügt.

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
