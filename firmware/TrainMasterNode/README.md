# 🚂 TrainMaster Node – ESP32 Firmware Anleitung

Vollständige Schritt-für-Schritt-Anleitung zur Konfiguration, Einrichtung der Arduino IDE und Installation der Firmware auf deinem **ESP32-WROOM-Entwicklerboard** (z. B. Freenove, NodeMCU ESP32, AZ-Delivery).

---

## 📋 1. Was muss im Code ausgefüllt werden?

Öffne die Datei [`firmware/TrainMasterNode/TrainMasterNode.ino`](file:///c:/Users/etswr/Downloads/TrainMaster/firmware/TrainMasterNode/TrainMasterNode.ino).

Ganz oben in den **Zeilen 28 bis 34** findest du den Konfigurationsblock. Passe dort deine WLAN-Daten und die IP-Adresse deines PCs an:

```cpp
// --- Standard-Konfiguration (Hier deine Daten eintragen) ---
#define FIRMWARE_VERSION "2.0.0"
#define DEFAULT_SSID     "DEIN_WLAN_NAME"      // 1. Name deines 2.4 GHz WLANs
#define DEFAULT_PASS     "DEIN_WLAN_PASSWORT"  // 2. Dein WLAN-Passwort
#define DEFAULT_SERVER   "192.168.1.100"      // 3. IP-Adresse des PCs, auf dem TrainMaster läuft
#define DEFAULT_PORT     8051                  // 4. Port des TrainMaster WIO-Servers (Standard: 8051)
#define DEFAULT_UNIT     33                    // 5. Baugruppen-ID (z. B. 33 oder 1 für das 1. Modul)
#define DEFAULT_NODE_NAME "TrainMasterESP1"    // 6. Frei wählbarer Name im Netzwerk
```

### Erklärung der Felder:
| Einstellung | Bedeutung & Beispiel |
| :--- | :--- |
| **`DEFAULT_SSID`** | Der Name deines WLAN-Netzwerks. **Wichtig**: Der ESP32 unterstützt nur **2,4 GHz WLAN** (kein reines 5 GHz). |
| **`DEFAULT_PASS`** | Das Passwort für dein WLAN-Netzwerk. |
| **`DEFAULT_SERVER`** | Die lokale IPv4-Adresse deines Windows-PCs, auf dem der TrainMaster-Server läuft (z. B. `192.168.1.100`). *(Herauszufinden über Windows-Terminal: `ipconfig`)*. |
| **`DEFAULT_PORT`** | Der TCP-Port des TrainMaster-Servers (immer **`8051`**). |
| **`DEFAULT_UNIT`** | Eine eindeutige Baugruppen-Nummer für diesen ESP32 (z. B. `33`). Wenn du später einen zweiten ESP32 für einen anderen Anlagenteil hast, bekommt dieser z. B. `34`. |
| **`DEFAULT_NODE_NAME`** | Ein Name, unter dem das Modul im Netzwerk und im TrainMaster-Dashboard erscheint. |

---

## 📌 2. Pin-Belegung anpassen (Optional)

In den **Zeilen 56 bis 66** der `.ino`-Datei ist festgelegt, welche Pins für Sensoren und welche für Signale genutzt werden:

```cpp
PinConfig configuredPins[] = {
  { 35, PIN_SENSOR_NOPULL, false, false, 0 },   // Belegtmelder 1 (Gleisüberwachung)
  { 34, PIN_SENSOR_NOPULL, false, false, 0 },   // Sensor 2
  { 36, PIN_SENSOR_NOPULL, false, false, 0 },   // Sensor 3 (VP)
  { 39, PIN_SENSOR_NOPULL, false, false, 0 },   // Sensor 4 (VN)
  { 12, PIN_SIGNAL_ACTIVE_LOW, false, false, 0 }, // Signal Rot (Hp0)
  { 13, PIN_SIGNAL_ACTIVE_LOW, false, false, 0 }, // Signal Grün (Hp1)
  { 14, PIN_SIGNAL_ACTIVE_LOW, false, false, 0 }, // Signal Gelb (Hp2)
  { 15, PIN_SIGNAL_ACTIVE_LOW, false, false, 0 }  // Signal Weiß (Sh1)
};
```

### Die Pin-Modi:
* **`PIN_SENSOR_NOPULL`**: Für Pins **GPIO 34, 35, 36, 39**. Diese Pins haben im ESP32 keinen internen Pull-Up-Widerstand. Ideal für Optokoppler-Belegtmelder mit eigenem Schaltausgang.
* **`PIN_SENSOR_PULLUP`**: Für normale Pins (z. B. **GPIO 4, 16, 17, 18, 19, 21, 22, 23, 27, 32, 33**). Aktiviert den internen Pull-Up-Widerstand (Schalter / Reedkontakt schaltet einfach gegen **GND**).
* **`PIN_SIGNAL_ACTIVE_LOW`**: Für Signale mit **gemeinsamem Pluspol `+`** (z. B. Viessmann, Schneider etc.). Der ESP32 schaltet auf GND durch, um die LED leuchten zu lassen.

---

## 🛠️ 3. Vorbereitung: Hardware & USB-Treiber

1. **USB-Kabel**:
   * Verbinde den ESP32 per Micro-USB- bzw. USB-C-Kabel mit deinem PC.
   * **Wichtig**: Verwende ein echtes **Datenkabel**. Reine Ladekabel (wie sie manchen Handys beiliegen) übertragen keine Daten und werden im PC nicht erkannt!
2. **USB-Treiber (CH340)**:
   * Die meisten Entwicklerboards (insbesondere Freenove) verwenden den **CH340** USB-Seriell-Chip.
   * Öffne den Windows-Gerätemanager (`Win + X` -> *Geräte-Manager* -> *Anschlüsse (COM & LPT)*).
   * Dort sollte ein Eintrag wie **`USB-SERIAL CH340 (COM3)`** oder **`Silicon Labs CP210x (COMx)`** stehen.
   * Falls dort ein gelbes Ausrufezeichen steht, installiere kurz den kostenlosen [CH340 Windows-Treiber](https://www.wch-ic.com/downloads/CH341SER_EXE.html).

---

## 💻 4. Arduino IDE einrichten (Schritt-für-Schritt)

Falls noch nicht installiert, lade die aktuelle [Arduino IDE (Version 2.x)](https://www.arduino.cc/en/software) herunter und installiere sie.

### Schritt A: ESP32-Boardverwalter hinzufügen
1. Starte die Arduino IDE.
2. Klicke im Menü auf **Datei** ➔ **Voreinstellungen** (bzw. `Strg + Komma`).
3. Trage im Feld **Zusätzliche Boardverwalter-URLs** folgende Zeile ein:
   ```text
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
   *(Falls dort bereits andere URLs stehen, trenne sie mit einem Komma oder Klick auf das Symbol rechts daneben).*
4. Klicke auf **OK**.

### Schritt B: ESP32-Paket installieren
1. Klicke links in der Seitenleiste auf das **Board-Symbol** (Board Manager) oder wähle im Menü **Werkzeuge** ➔ **Board** ➔ **Boardverwalter...**.
2. Tippe im Suchfeld **`esp32`** ein.
3. Suche den Eintrag **esp32 by Espressif Systems** und klicke auf **Installieren**. *(Der Download dauert ca. 1–2 Minuten).*

---

## 🚀 5. Flashen / Hochladen auf den ESP32

1. **Sketch öffnen**:
   * Klicke in der Arduino IDE auf **Datei** ➔ **Öffnen...** und wähle die Datei:
     `c:\Users\etswr\Downloads\TrainMaster\firmware\TrainMasterNode\TrainMasterNode.ino`
2. **Board & Port auswählen**:
   * Klicke im Menü auf **Werkzeuge** ➔ **Board** ➔ **esp32** ➔ **`ESP32 Dev Module`**.
   * Klicke auf **Werkzeuge** ➔ **Port** und wähle deinen COM-Port (z. B. **`COM3`**).
3. **Empfohlene Einstellungen unter *Werkzeuge*:**
   * **Upload Speed**: `921600` (für schnelles Flashen, bei Fehlern `115200`)
   * **CPU Frequency**: `240MHz (WiFi/BT)`
   * **Flash Frequency**: `80MHz`
   * **Flash Mode**: `QIO`
   * **Partition Scheme**: `Default 4MB with spiffs`
4. **Hochladen starten**:
   * Klicke oben links auf den runden **Pfeil nach rechts** (**Hochladen** / Upload, Tastenkürzel: `Strg + U`).
   * Der Sketch wird kompiliert und auf den ESP32 geschrieben.

> [!TIP]
> **Was tun, wenn in der Konsole `Connecting......_____.....` steht?**  
> Manche ESP32-Boards schalten nicht automatisch in den Bootloader. Halte in diesem Fall einfach die kleine Taste **`BOOT`** (oder `IO0`) auf dem ESP32 für 2 Sekunden gedrückt, sobald die Punkte `Connecting...` erscheinen. Der Upload startet dann sofort!

---

## ✅ 6. Überprüfung & Erstinbetriebnahme

### 1. Seriellen Monitor öffnen
* Klicke in der Arduino IDE oben rechts auf das Lupe-Symbol (**Serieller Monitor**) oder drücke `Strg + Umschalt + M`.
* Stelle unten rechts die Baudrate auf **`115200 Baud`**.
* Du siehst nun die Startmeldungen des ESP32:
  ```text
  ========================================
  🚂 TrainMaster Node v2.0.0
  ========================================
  Verbinde mit WLAN: MeinWLAN...
  WLAN verbunden! IP: 192.168.1.50
  Webserver gestartet auf Port 80
  Verbinde mit TrainMaster Server (192.168.1.100:8051)...
  ✅ Verbunden mit TrainMaster Server!
  ```

### 2. Eigenes Web-Dashboard aufrufen
* Öffne an einem beliebigen Browser im Heimnetzwerk die IP-Adresse des ESP32:  
  👉 **`http://192.168.1.50/`** (oder die in deinem Netzwerk vergebene IP).
* Du siehst ein modernes Live-Dashboard mit:
  * Live-Status aller konfigurierten Eingangs-Pins (grün = frei, rot = belegt).
  * 1-Klick-Testtasten für deine Signallampen (Rot, Grün, Gelb).
  * System-Uptime, RSSI-WLAN-Empfangsstärke und freier RAM.

### 3. In TrainMaster nutzen
* TrainMaster erkennt den Node dank der WIO/TCP-Kompatibilität vollautomatisch.
* Gehe im TrainMaster Web-Interface auf **Signale & Rückmelder**:
  * Deine Unit (z. B. `Unit 33`) taucht direkt in der Node-Übersicht auf.
  * Klicke auf **`➕ Alle 16 Pins anlegen`**, um die Belegtmelder und Signale mit einem Klick in TrainMaster bereitzustellen.

---

## 🔄 7. Zukünftige Updates per OTA (Ohne USB-Kabel!)

Einmal geflasht, musst du den ESP32 nie wieder an den PC anstecken!
1. Wenn du Änderungen am Code machst, klicke in der Arduino IDE auf **Sketch** ➔ **Kompilierte Binärdatei exportieren** (`Strg + Alt + S`).
2. Öffne im Browser das Web-Dashboard deines ESP32: `http://<esp-ip>/`.
3. Scrolle ganz nach unten zur Sektion **„🔄 Firmware Update (OTA)“**.
4. Wähle die exportierte `.bin`-Datei aus und klicke auf **Update starten**.
5. Der ESP32 aktualisiert sich innerhalb von 10 Sekunden kabellos über dein WLAN!

---

## 🚦 Viessmann Signal-Anschlussanleitung
Ausführliche Pläne und Kabelfarben zum Anschluss von 2-begriffigen und Mehrabschnitts-Signalen:  
👉 **[Schritt-für-Schritt-Anleitung: Viessmann Signale am ESP32](../../docs/SIGNALE_ESP32_ANLEITUNG.md)**
