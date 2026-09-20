# 🚂 TrainMaster

> **Modern, hardware-accelerated model railway automation & digital dispatcher.**  
> Built with Node.js, TypeScript, reactive SVG canvas, and dedicated ESP32 firmware (WIO / UDP).

[🇬🇧 **English Version**](README.md) • [🇩🇪 **Deutsche Version**](README_de.md)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF.svg)](https://vitejs.dev/)
[![ESP32](https://img.shields.io/badge/ESP32-PlatformIO-red.svg)](https://platformio.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Highlights & Features

### 🌐 Dual-Language Support (English & German)
- Fully localized Web UI: switch seamlessly between **English** and **German** with the **`🇬🇧 EN / 🇩🇪 DE`** toggle in the top header.
- Automatic persistence of language preference in the browser (`localStorage`).
- Dual-language documentation (`README.md` in English, `README_de.md` in German).

### 🖥️ Hardware-Accelerated Track Plan & Dispatcher
- **Dynamic 80x80 Grid**: Smooth zooming (40%–250%), 1-finger drag-to-pan, and 2-finger pinch-to-zoom.
- **Multi-Layer Z-Order**: Block badges, train labels, and status badges are rendered on a dedicated top SVG layer (`layer-blocks`), strictly above all rails, ballast, sleepers, and turnouts.
- **Opaque Base Plate**: Solid backing plate (`#0d1117`) guarantees track lines never cut through train labels or block status badges.
- **Click & Drive**: Tap a train's source block, then tap a destination block — TrainMaster automatically aligns and locks all turnouts and sets signals.
- **Realistic Signals**: Prototype signal aspects (Hp0, Hp1, Hp2, Sh0, Sh1) with DB mast shields and 180° rotation support (labels always stay right-side up).

### 📱 Touchscreen & Tablet Optimization
- **Gesture Navigation**: 1-finger panning with directional lock, smooth 2-finger pinch-to-zoom.
- **Long-Press Actions**: 
  - **500 ms** on track blocks opens the block context menu (right-click replacement on iPads & phones) with tactile haptic vibration.
  - **450 ms** on feedback sensors toggles latched occupied state (Shift+Click replacement).
- **Train Depot Drawer**: Easily place trains using *Tap-to-Place* or touch-drag with floating ghost miniature (`touch-drag-ghost`).
- **Ergonomic Throttle**: 36px speed slider thumb with `touch-action: none` to prevent accidental page scrolling.

### 🧭 Intelligent Interlocking & Route Automation
- **Graph-Theoretic Topology Model (`TrackTopology.ts`)**: Detects port connections, turnout branches, and open track ends.
- **Route Generator (`RouteGenerator.ts`)**: Automatic pathfinding (BFS/DFS) with flank protection, turnout interlocking, and signal aspect selection (Hp2 for divergent branches, Hp1 for straight tracks).
- **Precision Braking with BBT (Block Brake Timer)**: Calculates and adapts dynamic deceleration curves between `enter` and `in` feedback sensors.
- **Ghost Train Detection**: Detects unauthorized occupancy on unreserved blocks and triggers an immediate emergency stop.

### 🔌 Multi-Command Station & ESP32 TrainMasterNode Firmware
- **Z21 / DR5000 / YD9001**: High-speed UDP communication with Roco Z21-compatible command stations.
- **DCC-EX**: Serial communication over USB/COM port.
- **ESP32 TrainMasterNode**: Open-source firmware for decentralized nodes:
  - Turnout control via PCA9685 16-channel servo drivers with smooth easing curves.
  - Track occupancy detection via MCP23017 I2C port expanders.
  - Prototype-accurate control of WS2812B NeoPixel signal LEDs.
  - Integrated WiFiManager with web dashboard and mDNS discovery (`trainmasternode.local`).

---

## 🏗️ Project Architecture

```text
TrainMaster/
├── client/                     # Web UI (Vite, TypeScript, SVG Canvas, Responsive CSS)
│   ├── src/
│   │   ├── components/         # Dispatcher, Throttle, Depot, Monitors, Inspector
│   │   ├── i18n.ts             # Bilingual i18n translation system (DE/EN)
│   │   ├── main.ts             # Application bootstrap & lifecycle
│   │   └── style.css           # Modern dark-mode & touchscreen theme
│   └── index.html
├── server/                     # Dispatcher backend (Node.js, WebSocket, REST)
│   ├── src/
│   │   ├── engine/             # Topology, Routes, BBT, Blocks, Turnouts
│   │   ├── hal/                # Z21, DCC-EX, WIO/UDP, Virtual Simulator
│   │   └── storage/            # JSON persistence for track plans, locos & routes
│   └── data/                   # Track plan & fleet database
├── firmware/                   # ESP32 TrainMasterNode firmware
│   └── TrainMasterNode/        # PlatformIO / Arduino IDE source & docs
├── docs/                       # In-depth wiring & hardware guides
├── STEERING.md                 # Project release & versioning policy
├── CHANGELOG.md                # Chronological change log
└── SPECIFICATION.md            # Technical specification
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (Version 18 or newer)
- npm (bundled with Node.js)

### 1. Clone the repository
```bash
git clone https://github.com/ETSREAC/Trainmaster.git
cd Trainmaster
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start server & client

**1-Click Starters (Desktop):**
- 🪟 **Windows**: Double-click **`start.bat`** (or `TrainMaster_Windows.bat`)
- 🍏 **macOS**: Double-click **`TrainMaster_macOS.command`** (or `./start.sh`)

**Or via Terminal (Any OS):**
```bash
# Starts backend (port 3001) and web client (port 5173) in parallel:
npm run dev
```

The browser will open automatically at:
👉 **`http://localhost:5173`** *(or on your tablet: `http://<PC-IP>:5173`)*

---

## 🎮 Hardware & 3D Printing

TrainMaster includes complete open-source designs for dedicated wireless hardware:
- **[TrainMaster ThrottleOne Concept](docs/TRAINMASTER_HANDREGLER_KONZEPT.md)**: ESP32-S3 handheld controller with 1.54" IPS display, mechanical switches, and LED status halo.
- **[Bill of Materials (BOM)](docs/BAUTEILE_HANDREGLER_BOM.md)**: Complete part list with exact AliExpress search terms (~27 € total).
- **[3D Print & Enclosure Guide](docs/3D_DRUCK_GEHAEUSE_ANLEITUNG.md)**: FDM printing tolerances, Bambu Studio settings, and assembly guide.
- **[3D Printable Models (STL)](hardware/enclosure/stl/)**: Ready-to-slice STL models (`throttle_top.stl`, `throttle_bottom.stl`, `keycap_stop.stl`, `keycap_function.stl`) and [parametric OpenSCAD file](hardware/enclosure/TrainMaster_ThrottleOne.scad).
- **[SpotWIO Wireless Feedback](docs/RUECKMELDE_KONZEPT_KABELLOS.md)**: Zero-cable optical / Hall track occupancy sensors over ESP-NOW.

---

## 📝 Version History

For release details and changes, see [**CHANGELOG.md**](CHANGELOG.md).
Release classification and steering rules are defined in [**STEERING.md**](STEERING.md).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
