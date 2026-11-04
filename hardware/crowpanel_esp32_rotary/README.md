# TrainMaster - Elecrow CrowPanel 1.28" ESP32-S3 Smart Rotary Display

Kabelloser WLAN-Handregler & Lokomotiv-Tacho für TrainMaster mit dem **Elecrow CrowPanel 1.28-inch HMI ESP32 Rotary Display** (240×240 rundes IPS-Touchdisplay mit integriertem Drehregler und 5× WS2812 RGB-LEDs).

---

## 🌟 Funktionen im Überblick

1. **Drehregler (Rotary Knob):**
   - **Fahr-Modus:** Reaktionsschnelle Geschwindigkeitsregelung (0 bis 128 DCC-Fahrstufen). 
     - Schrittweite einstellbar: *Fein (+2)*, *Normal (+4)*, *Schnell (+8)* oder *Dynamisch/Auto* (schnelles Kurbeln beschleunigt progressiv).
   - **Funktionen- & Einstellungs-Modus:** Schnelles Durchscrollen aller Lokfunktionen (F0 bis F11) sowie Live-Geräteeinstellungen:
     - **LED Helligkeit:** Direkt am Display umschaltbar (*Aus*, *15% Gedimmt*, *35% Normal*, *80% Hell*).
     - **Kurbel-Tempo:** Umschaltbar zwischen *Fein*, *Normal*, *Schnell* und *Auto*.
     - Beide Einstellungen werden dauerhaft im Flash-Speicher (NVS) gesichert!
   - **Lokauswahl-Modus:** Durch den Fuhrpark blättern.

2. **Druckknopf (Knob Button):**
   - **1x Klick (Fahren):** Fahrtrichtungsumkehr (Vorwärts ▶ / Rückwärts ◀).
   - **1x Klick (Funktionen/Settings):** Lokfunktion schalten bzw. LED-Helligkeit / Kurbel-Tempo umschalten.
   - **Doppelklick:** Wechsel zwischen Tacho-Anzeige und Funktionen-/Settings-Menü.
   - **Langer Druck (> 800ms):** **NOT-AUS (Emergency Stop)** für die gesamte Modellbahnanlage!

3. **Touchscreen (CST816D Gesten):**
   - **Swipe nach links (👈):** Nächste Lok aus der TrainMaster-Bibliothek aufrufen.
   - **Swipe nach rechts (👉):** Vorherige Lok aufrufen.
   - **Display-Tap (👆):** Schneller Wechsel zwischen Fahr-Screen und Funktionen-Screen.

4. **5× WS2812 RGB LED Ring:**
   - **Tacho-Leuchtband:** 5-stufiger Farbverlauf von Cyan (Anfahren) ➔ Grün ➔ Gelb ➔ Orange ➔ Rot (VMax).
   - **Stand-Modus:** Dezentes Richtungslicht (Warmweiß bei Vorwärts, Bernstein bei Rückwärts).
   - **Not-Aus / Gleisspannung AUS:** Sanft pulsierendes rotes Warnlicht über alle 5 LEDs.
   - **Sound- & Horn-Effekt:** Kurzer, strahlend blauer Lichtimpuls beim Auslösen von Pfeife/Horn (F1/F2).
   - **WLAN-Suche:** Blau rotierendes Lauflicht beim Booten.

---

## 🛠️ Vorbereitung in der Arduino IDE

### 1. ESP32 Board-Unterstützung installieren
Falls noch nicht geschehen, in der Arduino IDE unter **Datei ➔ Voreinstellungen** bei *Zusätzliche Boardverwalter-URLs* eintragen:
```text
https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
```
Anschließend unter **Werkzeuge ➔ Board ➔ Boardverwalter** nach `esp32` suchen und installieren (Version 2.0.14 oder 3.x).

### 2. Benötigte Bibliotheken installieren
Öffne **Werkzeuge ➔ Bibliotheken verwalten...** und installiere folgende Libraries:
1. **`GFX Library for Arduino`** (von *Moon On Our Nation*)
2. **`WebSockets`** (von *Markus Sattler*)
3. **`ArduinoJson`** (von *Benoit Blanchon*, Version 6 oder 7)
4. **`Adafruit NeoPixel`** (von *Adafruit*)

---

## ⚙️ Board-Einstellungen in der Arduino IDE

Wähle unter **Werkzeuge** folgende Optionen für das Elecrow CrowPanel 1.28":

| Option | Einstellung |
| :--- | :--- |
| **Board** | `ESP32S3 Dev Module` |
| **USB CDC On Boot** | `Enabled` |
| **CPU Frequency** | `240MHz (WiFi)` |
| **Flash Mode** | `QIO 80MHz` |
| **Flash Size** | `4MB` (oder `8MB` / `16MB`, je nach Modul) |
| **Partition Scheme** | `Huge APP (3MB No OTA / 1MB SPIFFS)` |
| **PSRAM** | `OPI PSRAM` (oder `Disabled`, falls kein PSRAM) |
| **Upload Speed** | `921600` |

---

## 📶 Konfiguration anpassen (`config.local.h`)

Der Handregler verbindet sich **direkt** mit der Zentrale, ohne PC. Lege im Sketch-Ordner eine Datei `config.local.h` an. Sie wird nicht ins Git übernommen. Alles, was dort nicht steht, nimmt die Standardwerte aus [config.h](config.h).

**DCC-EX** (Standard):

```cpp
#define WIFI_SSID      "DEIN_WLAN_NAME"
#define WIFI_PASSWORD  "DEIN_WLAN_PASSWORT"
#define DCC_EX_HOST    "192.168.4.1"   // IP der DCC-EX Zentrale
#define DCC_EX_PORT    2560
```

**Roco Z21 / z21 start:**

```cpp
#define WIFI_SSID      "DEIN_WLAN_NAME"      // WLAN, in dem die Z21 haengt
#define WIFI_PASSWORD  "DEIN_WLAN_PASSWORT"
#define CS_PROTOCOL    CS_PROTOCOL_Z21
#define Z21_HOST       "192.168.0.111"       // Werkseinstellung der Z21
```

Im Z21-Betrieb gilt:
- Die Gleisspannung wird beim Start **nicht** automatisch eingeschaltet, weil meist weitere Regler an der Z21 hängen.
- Beim Lokwechsel übernimmt der Knob den echten Zustand der Lok von der Z21 (Fahrstufe, Richtung, Licht).
- Steuert jemand dieselbe Lok mit der Z21-App oder einer multiMAUS, zeigt der Knob das an.
- Antwortet die Z21 8 s lang nicht, zeigt das Display „Z21 getrennt“ und Fahren ist gesperrt. Sobald sie wieder da ist, meldet sich der Knob von selbst neu an.
- Long-Press = Not-Halt aller Loks (`LAN_X_SET_STOP`), nochmal Long-Press = Gleisspannung wieder ein.

### Z21-Test ohne Z21

Auf dem PC den Simulator starten:

```bash
node scripts/z21_simulator.mjs
```

Dann im Knob als `Z21_HOST` die IPv4-Adresse des PCs eintragen (`ipconfig`). Knob und PC müssen im selben WLAN sein, und die Windows-Firewall muss UDP-Port 21105 für Node erlauben. Der Simulator zeigt jeden Befehl des Knobs im Klartext, z. B. `LAN_X_SET_LOCO_DRIVE Lok 3 vorwaerts Stufe 50 (128 FS)`.

Automatische Tests: `npm run test:z21` (braucht einen C++-Compiler: g++, clang++ oder `pip install ziglang`).

---

## 🔌 Hardware-Pinout (CrowPanel 1.28" ESP32-S3)

| Komponente | Signal | ESP32-S3 GPIO |
| :--- | :--- | :--- |
| **GC9A01 Display (SPI)** | SCLK | `GPIO 10` |
| | MOSI | `GPIO 11` |
| | DC | `GPIO 3` |
| | CS | `GPIO 9` |
| | RST | `GPIO 14` |
| | Backlight (BL) | `GPIO 46` |
| **Rotary Encoder** | Phase A | `GPIO 45` |
| | Phase B | `GPIO 42` |
| | Drucktaster | `GPIO 41` (Active LOW) |
| **CST816D Touch (I2C)**| SDA | `GPIO 6` |
| | SCL | `GPIO 7` |
| | Interrupt | `GPIO 5` |
| | Reset | `GPIO 13` |
| **5× WS2812 RGB Ring**| Data In | `GPIO 48` |

---

## 🚀 Flashen & Erstinbetriebnahme

1. Schließe das Elecrow Display per USB-Kabel an deinen PC an.
2. Wähle in der Arduino IDE den entsprechenden **COM-Port** aus.
3. Klicke auf **Hochladen** (Upload).
4. Nach dem Booten:
   - Die LEDs laufen blau im Kreis während der WLAN-Suche.
   - Auf dem Bildschirm erscheint das TrainMaster-Logo mit Statusanzeigen.
   - Nach erfolgreichem Verbinden blitzen die LEDs grün auf und das Display springt direkt in den Tacho-Modus deiner ersten Lokomotive!
