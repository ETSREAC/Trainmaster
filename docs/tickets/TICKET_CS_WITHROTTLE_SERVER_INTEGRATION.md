# [Feature] WiThrottle Server Bridge: Drahtlose Smartphone-Handregler & Apps (Engine Driver / WiThrottle)

**Typ:** Core Integration / Throttle Server Bridge  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/services/WiThrottleServer.ts`, `server/src/engine/LocoManager.ts`, `server/src/types.ts`  
**Labels:** `withrottle`, `engine-driver`, `handheld`, `mobile-apps`, `ios`, `android`

---

## 1. Problemstellung & Motivation

TrainMaster hat eine moderne Touch-Web-App für den Browser.  
Dennoch nutzen unzählige Modellbahner auf der ganzen Welt dedizierte **WLAN-Handregler-Apps** oder physische Funkhandregler:
* **Engine Driver** (Android) – Die weltweit populärste kostenlose Modellbahn-App.
* **WiThrottle** (Apple iOS / iPhone / iPad).
* **UWT-50 / UWT-100** (Physische Universal Wireless Throttles mit Drehrad von TCS).

Alle diese Apps und Hardware-Regler sprechen das offene, standardisierte **WiThrottle-Protokoll** (ursprünglich von JMRI entwickelt).  
Wenn TrainMaster einen internen **WiThrottle-Server** bereitstellt, können Freunde und Gäste im Club oder an der Heimanlage sofort ihr eigenes Smartphone zücken und ohne Installation einer Web-App sofort als Mitspieler Loks steuern!

---

## 2. Technisches Protokoll: WiThrottle Specification

* **Verbindung:** **TCP Socket Server** auf Port **`12090`**.
* **Zero-Conf / Discovery:** Optionales **mDNS / Bonjour Broadcasting** (`_withrottle._tcp.local`), sodass die Smartphones TrainMaster automatisch im WLAN finden, ohne dass man IP-Adressen eintippen muss!
* **Format:** Simples, zeilenbasiertes ASCII-Protokoll.

---

## 3. WiThrottle Befehls-Ablauf

### 1. Handshake beim Verbinden:
```text
// Client verbindet sich und sendet seinen Gerätenamen:
NMein iPhone
HU24c8e71b

// TrainMaster antwortet mit Server-Identität:
VN2.0
RL0
```

### 2. Lokomotive anfordern (Acquire):
```text
// App will Lok mit DCC-Adresse 3 steuern:
M1A*<;>L3

// TrainMaster bestätigt und liefert aktuelle Werte (Geschwindigkeit 0, FWD, F0..F28):
M1AL3<;>V0
M1AL3<;>R1
```

### 3. Fahrbefehle & Funktionen:
```text
// App ändert Fahrstufe auf 45:
M1A*<;>V45

// App schaltet Fahrtrichtung um (0=Rev, 1=Fwd):
M1A*<;>R0

// App tippt F2 (Horn) an (1=Ein, 0=Aus):
M1A*<;>F12
M1A*<;>F02

// App drückt Not-Aus:
*
```

---

## 4. Implementierung in TrainMaster (`WiThrottleServer.ts`)

```typescript
import net from 'net';
import { LocoManager } from '../engine/LocoManager.js';

export class WiThrottleServer {
  private server: net.Server;
  private port = 12090;

  constructor(private locoManager: LocoManager) {
    this.server = net.createServer((socket) => {
      this.handleClient(socket);
    });
  }

  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`[WiThrottle] Server aktiv auf Port ${this.port} (Engine Driver / iOS bereit)`);
    });
  }

  private handleClient(socket: net.Socket): void {
    socket.write('VN2.0\nRL0\n'); // Begrüßung

    socket.on('data', (data) => {
      const lines = data.toString('utf-8').split('\n');
      for (const line of lines) {
        this.parseCommand(line.trim(), socket);
      }
    });
  }
}
```

---

## 5. UI-Integration

* Im **Optionen / Einstellungen-Tab**:
  * Checkbox: `[✓] WiThrottle Server aktiv (Port 12090)`
  * Zeigt verbundene Smartphones / Handregler mit Namen live an (z. B. *"Verbunden: Eriks Pixel 8, Peters iPad"*).

---

## 6. Akzeptanzkriterien

- [ ] Engine Driver (Android) und WiThrottle (iOS) finden TrainMaster automatisch im WLAN.
- [ ] Züge lassen sich über das Smartphone beschleunigen, bremsen und umkehren.
- [ ] F-Tasten werden synchronisiert.
- [ ] Änderungen im Web-Stellwerk werden in Millisekunden auf das Smartphone übertragen.
