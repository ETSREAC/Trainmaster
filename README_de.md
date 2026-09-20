# 🚂 TrainMaster

> **Moderne, hardwarebeschleunigte Modellbahnsteuerung & digitales Gleisbildstellwerk.**  
> Entwickelt mit Node.js, TypeScript, modernem SVG-Canvas und maßgeschneiderter ESP32-Firmware (WIO / UDP).

[🇩🇪 **Deutsche Version**](README_de.md) • [🇬🇧 **English Version**](README.md)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF.svg)](https://vitejs.dev/)
[![ESP32](https://img.shields.io/badge/ESP32-PlatformIO-red.svg)](https://platformio.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Highlights & Features

### 🌐 Zweisprachige Oberfläche (Deutsch & Englisch)
- Vollständige Mehrsprachigkeit direkt in der Web-Oberfläche über den **`🇩🇪 DE / 🇬🇧 EN`**-Schalter im Kopfbereich.
- Automatische Speicherung der bevorzugten Sprache im Browser (`localStorage`).
- Zweisprachige Dokumentation (`README.md` auf Englisch, `README_de.md` auf Deutsch).

### 🖥️ Hardwarebeschleunigter Gleisplan & Stellwerk
- **Dynamisches 80x80 Raster**: Stufenloses Zoomen (40%–250%), 1-Finger Drag-to-Pan und 2-Finger Pinch-to-Zoom.
- **Multi-Layer Z-Order**: Block-Badges, Zuginformationen und Statusanzeigen liegen garantiert immer auf einer obersten SVG-Ebene über Gleisen, Schotterbetten und Weichenzungen.
- **Blickdichte Trägerplatte**: Schienenstränge schneiden niemals durch Belegtanzeigen oder Lokomotivbezeichnungen.
- **Click & Drive**: Lok auf Startblock wählen, Zielblock antippen – TrainMaster stellt und verriegelt alle Weichen und Signale vollautomatisch.
- **Signal-Visualisierung**: Reale Signalbilder (Hp0, Hp1, Hp2, Sh0, Sh1) inklusive rot-weißer und weiß-blau-weißer DB-Mastschilder mit 180°-Gegenrichtungsdrehung.

### 📱 Touchscreen- & Tablet-Optimierung
- **Gestensteuerung**: 1-Finger Panning mit intelligenter Richtungssperre, stufenloses 2-Finger Pinch-to-Zoom.
- **Long-Press-Aktionen**: 
  - **500 ms** auf Blöcke öffnet das Kontextmenü (Rechtsklick-Ersatz auf iPads/Smartphones) mit haptischem Feedback.
  - **450 ms** auf Rückmelder schaltet Dauerbelegung um (Shift-Klick-Ersatz).
- **Zugdepot-Drawer**: Bequemes Aufgleisen via *Tap-to-Place* oder Touch-Drag mit Schwebeminiatur (`touch-drag-ghost`).
- **Ergonomischer Handregler**: Großer 36px Fahrstufen-Slider mit `touch-action: none` gegen unbeabsichtigtes Scrollen.

### 🧭 Intelligente Stellwerkslogik & Fahrstraßen-Automatik
- **Graphentheoretisches Topologie-Modell (`TrackTopology.ts`)**: Erkennt Anschlusstore, Weichenverzweigungen und offene Gleisenden.
- **Fahrstraßen-Automatik (`RouteGenerator.ts`)**: Automatische Pfadsuche (BFS/DFS) mit Weichenflankenschutz, Weichenverriegelung und automatischer Signalstellung (Hp2 bei Abzweigen, Hp1 bei gerader Fahrt).
- **Millimetergenaues Anhalten mit BBT (Block Brake Timer)**: Berechnet und adaptiert dynamische Bremsrampen zwischen `enter`- und `in`-Meldern.
- **Geisterzug-Erkennung**: Erkennt unangekündigte Belegungen und löst sofortigen Nothalt aus.

### 🔌 Multi-Zentralen & ESP32 TrainMasterNode Firmware
- **Z21 / DR5000 / YD9001**: Schnelle UDP-Kommunikation mit Roco Z21-kompatiblen Zentralen.
- **DCC-EX**: Serielle Steuerung über USB/COM-Port.
- **ESP32 TrainMasterNode**: Eigene Open-Source Firmware für dezentrale Knoten:
  - Steuerung von Weichen über PCA9685 16-Kanal Servotreiber mit sanfter Stellkurve.
  - Einlesen von Gleisbelegtmeldern über MCP23017 I2C Porterweiterung.
  - Vorbildgetreue Ansteuerung von WS2812B NeoPixel Signal-LEDs.
  - Integrierter WiFiManager mit Web-Dashboard und mDNS-Erkennung (`trainmasternode.local`).

---

## 🏗️ Projektstruktur

```text
TrainMaster/
├── client/                     # WebUI (Vite, TypeScript, SVG Canvas, Responsive CSS)
│   ├── src/
│   │   ├── components/         # Stellwerk, Handregler, Depot, Monitore, Inspektor
│   │   ├── i18n.ts             # Zweisprachiges Übersetzungssystem (DE/EN)
│   │   ├── main.ts             # Anwendungs-Initialisierung
│   │   └── style.css           # Modernes Dark-Mode & Touchscreen Theme
│   └── index.html
├── server/                     # Stellwerks-Backend (Node.js, WebSocket, REST)
│   ├── src/
│   │   ├── engine/             # Topologie, Fahrstraßen, BBT, Blöcke, Weichen
│   │   ├── hal/                # Z21, DCC-EX, WIO/UDP, Virtual Simulator
│   │   └── storage/            # JSON-Persistenz für Gleispläne, Loks & Routen
│   └── data/                   # Gleisplan- und Fahrzeug-Datenbank
├── firmware/                   # ESP32 TrainMasterNode Firmware
│   └── TrainMasterNode/        # PlatformIO / Arduino IDE Quellcode & Doku
├── docs/                       # Vertiefende Anleitungen & Hardware-Verdrahtung
├── STEERING.md                 # Verbindliche Release- und Versionierungs-Richtlinie
├── CHANGELOG.md                # Chronologische Versionshistorie
└── SPECIFICATION.md            # Architektur-Spezifikation
```

---

## 🚀 Schnellstart

### Voraussetzungen
- [Node.js](https://nodejs.org/) (Version 18 oder neuer)
- npm (im Node.js-Installer enthalten)

### 1. Repository klonen
```bash
git clone https://github.com/ETSREAC/Trainmaster.git
cd Trainmaster
```

### 2. Abhängigkeiten installieren
```bash
npm install
```

### 3. Server & WebUI starten

**1-Klick Starter (Desktop):**
- 🪟 **Windows**: Doppelklick auf **`start.bat`** (oder `TrainMaster_Windows.bat`)
- 🍏 **macOS**: Doppelklick auf **`TrainMaster_macOS.command`** (oder `./start.sh`)

**Oder über das Terminal (jedes OS):**
```bash
# Startet Backend (Port 3001) und Client (Port 5173) parallel:
npm run dev
```

Der Browser öffnet sich automatisch unter:
👉 **`http://localhost:5173`** *(oder auf deinem Tablet: `http://<PC-IP>:5173`)*

---

## 🎮 Hardware & 3D-Druck

TrainMaster enthält vollständige Open-Source-Hardware-Designs für kabellose Komponenten:
- **[Stream Deck XL & Drehregler-Stellpult](docs/STREAMDECK_STELLPULT_KONZEPT.md)**: Verwandle dein Elgato Stream Deck XL + kabellosen Drehregler-Puck in ein High-End-Stellpult mit Live-Tacho, Lok-Auswahl, Sound-Funktionen & Weichenstellung (Natives Plugin in `integrations/streamdeck/` + 3D-Druck-Konsole in `hardware/enclosure/streamdeck_xl_dock/`).
- **[TrainMaster ThrottleOne Konzept](docs/TRAINMASTER_HANDREGLER_KONZEPT.md)**: ESP32-S3 Handregler mit 1.54" IPS-Farbdisplay, mechanischen Switches und LED-Status-Halo.
- **[CAD Blueprint & Maßzeichnung](docs/BLUEPRINT_THROTTLEONE_CAD.md)**: Exakte technische Orthogonalzeichnungen, 14° Keilkopfwinkel und Schritt-für-Schritt CAD-Anleitung zum Nachbau des Mockups.
- **[Einkaufsliste / Stückliste (BOM)](docs/BAUTEILE_HANDREGLER_BOM.md)**: Komplette Teileliste mit exakten AliExpress-Suchbegriffen (~27 € Gesamtpreis).
- **[3D-Druck & Gehäuse-Leitfaden](docs/3D_DRUCK_GEHAEUSE_ANLEITUNG.md)**: FDM-Drucktoleranzen, Bambu Studio Einstellungen und 5-Minuten-Montageanleitung.
- **[Druckfertige 3D-Modelle (STL)](hardware/enclosure/stl/)**: Sofort druckbare STL-Dateien (`throttle_top.stl`, `throttle_bottom.stl`, `keycap_stop.stl`, `keycap_function.stl`) sowie [parametrisches OpenSCAD-Modell](hardware/enclosure/TrainMaster_ThrottleOne.scad).
- **[SpotWIO Kabellose Rückmelder](docs/RUECKMELDE_KONZEPT_KABELLOS.md)**: Null-Kabel-Gleisbesetztmelder mit Hall-/Opto-Sensoren via ESP-NOW.

---

## 📝 Versionsverlauf

Details zu allen Releases und Neuerungen findest du in der [**CHANGELOG.md**](CHANGELOG.md).
Richtlinien für Versionsentscheidungen sind in der [**STEERING.md**](STEERING.md) definiert.

---

## 📄 Lizenz

Dieses Projekt ist unter der [MIT-Lizenz](LICENSE) lizenziert.
