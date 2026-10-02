/**
 * TrainMaster - Elecrow CrowPanel 1.28" ESP32 Rotary Display
 * =============================================================================
 * STANDALONE DCC-EX HANDREGLER (Direktverbindung zur Zentrale ohne PC!)
 *
 * Hardware:
 *   - Elecrow CrowPanel 1.28-inch HMI ESP32 Rotary Display (240x240 IPS Touch)
 *   - ESP32-S3 Dual-Core
 *   - GC9A01 Runder SPI Display (Pins: SCK=10, MOSI=11, DC=3, CS=9, RST=14, BL=46)
 *   - Rotary Encoder (Pins: A=45, B=42, Button=41)
 *   - CST816D Kapazitiver Touchscreen (I2C: SDA=6, SCL=7, INT=5, RST=13)
 *   - 5x WS2812 RGB LED Ring (Data Pin: 48)
 *
 * Funktionen:
 *   - Verbindet sich per WLAN direkt mit deiner DCC-EX Zentrale (192.168.178.210:2560)
 *   - KEIN PC / TrainMaster Server nötig – läuft völlig autark!
 *   - Drehrad: Fahrstufe stufenlos regeln (0-126) via `<t 1 ADDR SPEED DIR>`
 *   - Klick: Fahrtrichtungsumkehr (Vorwärts <-> Rückwärts)
 *   - Long-Press (>800ms): NOT-AUS (`<!>` / `<1>`)
 *   - Doppelklick / Tap: Umschalten zwischen Tacho und Funktionen (F0..F11) via `<F ADDR FN 1/0>`
 *   - Swipe Links / Rechts: Durch Lokomotiven blättern
 *   - 5x RGB LEDs: Tacho-Farbbalken, Richtungslicht, Not-Aus-Blinken, Sound-Flash
 */

#include <WiFi.h>
#include <Preferences.h>
#include "config.h"
#include "display_ui.h"
#include "cst816_touch.h"
#include "led_effects.h"

// Hardware-Module instanziieren
DisplayUI      ui;
CST816Touch    touch(TOUCH_SDA, TOUCH_SCL, TOUCH_RST, TOUCH_INT, TOUCH_I2C_ADDR);
LedController  leds(LED_PIN, LED_COUNT);
WiFiClient     dccClient;
Preferences    prefs;

// Geräte-Einstellungen (dauerhaft im Flash gespeichert)
DeviceSettings settings;
const uint8_t BRIGHTNESS_VALUES[4] = {0, 15, 35, 80};

void applyLedBrightness() {
  leds.setBrightness(BRIGHTNESS_VALUES[settings.ledBrightnessLevel % 4]);
}

void loadDeviceSettings() {
  prefs.begin("trainmaster", false);
  settings.ledBrightnessLevel = prefs.getUChar("led_lvl", DEFAULT_LED_BRIGHT_MODE);
  settings.speedStepMode      = prefs.getUChar("step_lvl", DEFAULT_SPEED_STEP_MODE);
  prefs.end();

  if (settings.ledBrightnessLevel > 3) settings.ledBrightnessLevel = DEFAULT_LED_BRIGHT_MODE;
  if (settings.speedStepMode > 3) settings.speedStepMode = DEFAULT_SPEED_STEP_MODE;
  applyLedBrightness();
}

void saveDeviceSettings() {
  prefs.begin("trainmaster", false);
  prefs.putUChar("led_lvl", settings.ledBrightnessLevel);
  prefs.putUChar("step_lvl", settings.speedStepMode);
  prefs.end();
}

// Lok-Verwaltung direkt nach DCC-Adressen (1 bis 12)
#define MAX_LOCOS 16
UiLoco locos[MAX_LOCOS] = {
  { "loco-1",  "DCC #1",   1,  0, true, {false}, "LOK" },
  { "loco-2",  "DCC #2",   2,  0, true, {false}, "LOK" },
  { "loco-3",  "DCC #3",   3,  0, true, {false}, "LOK" },
  { "loco-4",  "DCC #4",   4,  0, true, {false}, "LOK" },
  { "loco-5",  "DCC #5",   5,  0, true, {false}, "LOK" },
  { "loco-6",  "DCC #6",   6,  0, true, {false}, "LOK" },
  { "loco-7",  "DCC #7",   7,  0, true, {false}, "LOK" },
  { "loco-8",  "DCC #8",   8,  0, true, {false}, "LOK" },
  { "loco-9",  "DCC #9",   9,  0, true, {false}, "LOK" },
  { "loco-10", "DCC #10", 10,  0, true, {false}, "LOK" },
  { "loco-11", "DCC #11", 11,  0, true, {false}, "LOK" },
  { "loco-12", "DCC #12", 12,  0, true, {false}, "LOK" }
};
uint8_t totalLocos = 12;
int8_t currentLocoIdx = 2; // Startet direkt auf Adresse #3

// Systemstatus
bool trackPower = true;
bool emergencyStop = false;
bool dccConnected = false;

// UI-Zustand
uint8_t selectedFuncIdx = 0;

// Encoder-Zustand (Makerguides-Standard für CrowPanel 1.28)
volatile int encoderDelta = 0;
volatile int lastClkState = HIGH;

unsigned long lastUserTurnTime = 0;
bool speedSendPending = false;
unsigned long lastSpeedSendTime = 0;

// Taster-Verarbeitung (Short Click, Double Click, Long Press)
bool lastBtnState = HIGH;
unsigned long btnPressTime = 0;
unsigned long lastBtnReleaseTime = 0;
uint8_t clickCount = 0;

// =============================================================================
// ENCODER INTERRUPT ROUTINE
// =============================================================================
void IRAM_ATTR isrRotary() {
  int clk = digitalRead(ROTARY_PIN_A);
  int dt  = digitalRead(ROTARY_PIN_B);

  if (clk != lastClkState) {
    lastClkState = clk;
    if (dt != clk) {
      encoderDelta++;
    } else {
      encoderDelta--;
    }
  }
}

// =============================================================================
// DCC-EX NATIVE BEFEHLE SENDEN
// =============================================================================
void sendDccThrottle(uint16_t addr, uint8_t speed, bool isFwd) {
  if (!dccConnected) return;

  // DCC-EX Throttle Befehl: <t REGISTER ADDR SPEED DIR>
  // Register 1, Direction: 1 = FWD, 0 = REV
  char cmd[32];
  snprintf(cmd, sizeof(cmd), "<t 1 %d %d %d>\n", addr, speed, isFwd ? 1 : 0);
  dccClient.print(cmd);
}

void sendDccFunction(uint16_t addr, uint8_t fn, bool active) {
  if (!dccConnected) return;

  // DCC-EX Funktion Ein/Aus: <F ADDR FN 1/0>
  char cmd[32];
  snprintf(cmd, sizeof(cmd), "<F %d %d %d>\n", addr, fn, active ? 1 : 0);
  dccClient.print(cmd);
}

void sendDccPower(bool on) {
  if (!dccConnected) return;

  if (on) {
    dccClient.print("<1>\n"); // Gleisspannung EIN
  } else {
    dccClient.print("<0>\n"); // Gleisspannung AUS
  }
}

void sendDccEmergencyStop(bool stop) {
  if (!dccConnected) return;

  if (stop) {
    dccClient.print("<!>\n"); // DCC-EX NOT-HALT
  } else {
    dccClient.print("<1>\n"); // Gleisspannung wieder EIN
  }
}

// =============================================================================
// UI UND LED AKTUALISIERUNG
// =============================================================================
void updateUiAndLeds(bool forceRedraw) {
  if (currentLocoIdx < 0 || currentLocoIdx >= totalLocos) return;

  UiLoco &cur = locos[currentLocoIdx];

  // LED-Zustand synchronisieren
  leds.updateDriveState(cur.speed, cur.isFwd, trackPower, emergencyStop);

  // Display-Screen zeichnen
  switch (ui.getScreen()) {
    case SCREEN_DRIVE:
      ui.renderDriveScreen(cur, trackPower, emergencyStop);
      break;

    case SCREEN_FUNCTIONS:
      ui.renderFunctionScreen(cur, selectedFuncIdx, settings);
      break;

    case SCREEN_LOCO_SELECT:
      ui.renderLocoSelectScreen(cur, currentLocoIdx, totalLocos);
      break;

    default:
      break;
  }
}

// =============================================================================
// DCC-EX ANTWORTEN PARSEN
// =============================================================================
void parseDccResponses() {
  while (dccClient.available()) {
    String line = dccClient.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    // <p1> = Power ON, <p0> = Power OFF
    if (line.startsWith("<p1>")) {
      trackPower = true;
      emergencyStop = false;
      updateUiAndLeds(false);
    } else if (line.startsWith("<p0>")) {
      trackPower = false;
      updateUiAndLeds(false);
    } else if (line.startsWith("<X>")) { // Not-Halt
      emergencyStop = true;
      updateUiAndLeds(false);
    }
  }
}

// =============================================================================
// SETUP
// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n--- TrainMaster Standalone DCC-EX Controller ---");

  // 1. LEDs & Einstellungen initialisieren
  leds.begin();
  loadDeviceSettings(); // Gespeicherte Helligkeit & Kurbel-Tempo aus Flash laden
  leds.setMode(LED_BOOT_CONNECTING);

  // 2. Display starten
  if (!ui.begin()) {
    Serial.println("Fehler beim Initialisieren des GC9A01 Displays!");
  }
  ui.showBootStatus("Starten...", "Verbinde mit WLAN");

  // 3. Touchscreen starten
  if (!touch.begin()) {
    Serial.println("CST816D Touchscreen nicht erkannt!");
  }

  // 4. Drehregler Pins & Interrupts
  pinMode(ROTARY_PIN_A, INPUT_PULLUP);
  pinMode(ROTARY_PIN_B, INPUT_PULLUP);
  pinMode(ROTARY_PIN_BTN, INPUT_PULLUP);
  lastClkState = digitalRead(ROTARY_PIN_A);
  attachInterrupt(digitalPinToInterrupt(ROTARY_PIN_A), isrRotary, CHANGE);

  // 5. WLAN verbinden
  Serial.printf("Verbinde mit WLAN '%s'...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(250);
    leds.update();
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWLAN verbunden! IP: " + WiFi.localIP().toString());
    ui.showBootStatus("DCC-EX Suche", DCC_EX_HOST);
    leds.setMode(LED_WIFI_SUCCESS);
    delay(500);

    // 6. Direktverbindung zu DCC-EX Zentrale herstellen
    Serial.printf("Verbinde mit DCC-EX an %s:%d...\n", DCC_EX_HOST, DCC_EX_PORT);
    if (dccClient.connect(DCC_EX_HOST, DCC_EX_PORT)) {
      dccConnected = true;
      Serial.println("✅ Erfolgreich direkt mit DCC-EX Zentrale verbunden!");
      ui.showBootStatus("DCC-EX Bereit!", "Gleisspannung EIN");
      
      // Gleisspannung aktivieren
      sendDccPower(true);
      delay(400);

      ui.setScreen(SCREEN_DRIVE);
      updateUiAndLeds(true);
    } else {
      Serial.println("❌ Verbindung zu DCC-EX fehlgeschlagen!");
      ui.showBootStatus("DCC-EX FEHLER", "IP 192.168.178.210 prüfen");
    }
  } else {
    Serial.printf("\nWLAN-Verbindung fehlgeschlagen (Status: %d)!\n", WiFi.status());
    ui.showBootStatus("WLAN FEHLER", "SSID / PW pruefen");
    leds.setMode(LED_EMERGENCY_STOP);
  }
}

// =============================================================================
// MAIN LOOP
// =============================================================================
void loop() {
  unsigned long now = millis();

  // DCC-EX Reconnect prüfen falls getrennt
  static unsigned long lastDccRetry = 0;
  if (WiFi.status() == WL_CONNECTED) {
    if (!dccClient.connected()) {
      if (dccConnected) {
        dccConnected = false;
        Serial.println("[DCC-EX] Verbindung verloren!");
        ui.showBootStatus("DCC-EX getrennt", "Verbinde neu...");
        leds.setMode(LED_BOOT_CONNECTING);
      }
      if (now - lastDccRetry > 4000) {
        lastDccRetry = now;
        Serial.printf("[DCC-EX] Versuche Verbindung zu %s:%d...\n", DCC_EX_HOST, DCC_EX_PORT);
        if (dccClient.connect(DCC_EX_HOST, DCC_EX_PORT)) {
          dccConnected = true;
          Serial.println("[DCC-EX] ✅ Wieder verbunden!");
          sendDccPower(true);
          ui.setScreen(SCREEN_DRIVE);
          updateUiAndLeds(true);
        }
      }
    } else {
      dccConnected = true;
      parseDccResponses();
    }
  } else {
    // WLAN Reconnect
    static unsigned long lastWifiRetry = 0;
    if (now - lastWifiRetry > 6000) {
      lastWifiRetry = now;
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  }

  leds.update();

  // ---------------------------------------------------------------------------
  // 1. DREHREGLER (ROTARY ENCODER) AUSWERTEN
  // ---------------------------------------------------------------------------
  if (encoderDelta != 0) {
    noInterrupts();
    int delta = encoderDelta;
    encoderDelta = 0;
    interrupts();

    static int subStepAccumulator = 0;
    subStepAccumulator += delta;

    // Auf dem Elecrow Rotary Encoder erzeugt 1 mechanischer Klick genau 2 Flanken
    if (abs(subStepAccumulator) >= 2 && currentLocoIdx >= 0 && currentLocoIdx < totalLocos) {
      int steps = subStepAccumulator / 2;
      subStepAccumulator = subStepAccumulator % 2;

      UiLoco &cur = locos[currentLocoIdx];
      lastUserTurnTime = now;

      // A) FAHR-MODUS: Geschwindigkeit anpassen (stufenlos & direkt)
      if (ui.getScreen() == SCREEN_DRIVE) {
        int stepSize = 8;
        if (settings.speedStepMode == 0) {
          stepSize = 2; // Fein (+2)
        } else if (settings.speedStepMode == 1) {
          stepSize = 4; // Normal (+4)
        } else if (settings.speedStepMode == 2) {
          stepSize = 8; // Schnell (+8: ca. 16 Klicks für Vollgas)
        } else if (settings.speedStepMode == 3) {
          // Dynamisch / Auto: schnelles Drehen beschleunigt progressiv
          static unsigned long lastStepTime = 0;
          unsigned long stepInterval = now - lastStepTime;
          lastStepTime = now;
          if (stepInterval < 40) {
            stepSize = 14;
          } else if (stepInterval < 80) {
            stepSize = 7;
          } else {
            stepSize = 2;
          }
        }

        int newSpeed = (int)cur.speed + (steps * stepSize);
        if (newSpeed < 0) newSpeed = 0;
        if (newSpeed > SPEED_MAX) newSpeed = SPEED_MAX;

        if (newSpeed != cur.speed) {
          cur.speed = (uint8_t)newSpeed;
          updateUiAndLeds(false);
          speedSendPending = true;
        }
      }
      // B) FUNKTIONEN- & SETTINGS-MODUS: Durch F0..F11 + Settings scrollen
      else if (ui.getScreen() == SCREEN_FUNCTIONS) {
        int nextFunc = (int)selectedFuncIdx + steps;
        if (nextFunc < 0) nextFunc = 0;
        if (nextFunc > 13) nextFunc = 13;
        if (nextFunc != selectedFuncIdx) {
          selectedFuncIdx = (uint8_t)nextFunc;
          updateUiAndLeds(false);
        }
      }
      // C) LOK-AUSWAHL: Durch Loks im Fuhrpark scrollen
      else if (ui.getScreen() == SCREEN_LOCO_SELECT) {
        currentLocoIdx = (currentLocoIdx + steps + totalLocos) % totalLocos;
        updateUiAndLeds(false);
      }
    }
  }

  // DCC-EX Befehl gebündelt senden (maximal alle 60ms für flüssige Reaktion)
  if (speedSendPending && (now - lastSpeedSendTime > 60) && currentLocoIdx >= 0 && currentLocoIdx < totalLocos) {
    lastSpeedSendTime = now;
    speedSendPending = false;
    UiLoco &cur = locos[currentLocoIdx];
    sendDccThrottle(cur.dccAddress, cur.speed, cur.isFwd);
  }

  // ---------------------------------------------------------------------------
  // 2. DRUCKKNOPF (ROTARY BUTTON) AUSWERTEN
  // ---------------------------------------------------------------------------
  bool btnState = digitalRead(ROTARY_PIN_BTN);

  if (btnState == LOW && lastBtnState == HIGH) {
    btnPressTime = now;
  }
  else if (btnState == LOW && (now - btnPressTime) >= LONG_PRESS_MS && btnPressTime > 0) {
    btnPressTime = 0;
    emergencyStop = !emergencyStop;
    Serial.printf("[BTN] Long Press -> Not-Aus: %s\n", emergencyStop ? "EIN" : "AUS");
    sendDccEmergencyStop(emergencyStop);
    leds.triggerFlash(emergencyStop ? 0xFF0000 : 0x00FF00, 300);
    updateUiAndLeds(true);
  }
  else if (btnState == HIGH && lastBtnState == LOW) {
    if (btnPressTime > 0) {
      clickCount++;
      lastBtnReleaseTime = now;
    }
    btnPressTime = 0;
  }
  lastBtnState = btnState;

  if (clickCount > 0 && (now - lastBtnReleaseTime) > DOUBLE_CLICK_MS) {
    // DOPPELKLICK: Screen umschalten
    if (clickCount >= 2) {
      if (ui.getScreen() == SCREEN_DRIVE) {
        ui.setScreen(SCREEN_FUNCTIONS);
      } else {
        ui.setScreen(SCREEN_DRIVE);
      }
      updateUiAndLeds(true);
    }
    // EINZELKLICK:
    else if (clickCount == 1 && currentLocoIdx >= 0 && currentLocoIdx < totalLocos) {
      UiLoco &cur = locos[currentLocoIdx];

      if (ui.getScreen() == SCREEN_DRIVE) {
        // Fahrtrichtung umkehren!
        cur.isFwd = !cur.isFwd;
        sendDccThrottle(cur.dccAddress, cur.speed, cur.isFwd);
        leds.triggerFlash(cur.isFwd ? 0x00FF88 : 0xFFAA00, 200);
        updateUiAndLeds(false);
      }
      else if (ui.getScreen() == SCREEN_FUNCTIONS) {
        if (selectedFuncIdx < 12) {
          // Gewählte Lok-Funktion (F0..F11) ein-/ausschalten!
          cur.functions[selectedFuncIdx] = !cur.functions[selectedFuncIdx];
          sendDccFunction(cur.dccAddress, selectedFuncIdx, cur.functions[selectedFuncIdx]);

          if (selectedFuncIdx == 1 || selectedFuncIdx == 2) {
            leds.triggerFlash(0x00AAFF, 250);
          }
          updateUiAndLeds(false);
        }
        else if (selectedFuncIdx == 12) {
          // LED Helligkeit durchschalten (Aus -> 15% -> 35% -> 80%)
          settings.ledBrightnessLevel = (settings.ledBrightnessLevel + 1) % 4;
          applyLedBrightness();
          saveDeviceSettings();
          leds.triggerFlash(0xFFFF00, 150);
          updateUiAndLeds(false);
        }
        else if (selectedFuncIdx == 13) {
          // Kurbel Tempo durchschalten (Fein -> Normal -> Schnell -> Auto)
          settings.speedStepMode = (settings.speedStepMode + 1) % 4;
          saveDeviceSettings();
          leds.triggerFlash(0x00FFFF, 150);
          updateUiAndLeds(false);
        }
      }
      else if (ui.getScreen() == SCREEN_LOCO_SELECT) {
        ui.setScreen(SCREEN_DRIVE);
        updateUiAndLeds(true);
      }
    }
    clickCount = 0;
  }

  // ---------------------------------------------------------------------------
  // 3. KAPAZITIVER TOUCHSCREEN (CST816D) AUSWERTEN
  // ---------------------------------------------------------------------------
  TouchData touchData;
  static unsigned long lastGestureTime = 0;
  static bool gestureLocked = false;

  if (touch.read(touchData) && totalLocos > 0) {
    if (!gestureLocked && (now - lastGestureTime > 320)) {
      // Swipe nach Links: Nächste Lok in der Bibliothek
      if (touchData.gesture == GESTURE_SLIDE_LEFT) {
        gestureLocked = true;
        lastGestureTime = now;
        currentLocoIdx = (currentLocoIdx + 1) % totalLocos;
        Serial.printf("[TOUCH] Swipe Left -> Nächste Lok: %s (DCC #%d)\n", 
                      locos[currentLocoIdx].name, locos[currentLocoIdx].dccAddress);
        ui.setScreen(SCREEN_DRIVE);
        ui.resetDriveCache();
        leds.triggerFlash(0x00FFFF, 120);
        updateUiAndLeds(true);
      }
      // Swipe nach Rechts: Vorherige Lok in der Bibliothek
      else if (touchData.gesture == GESTURE_SLIDE_RIGHT) {
        gestureLocked = true;
        lastGestureTime = now;
        currentLocoIdx = (currentLocoIdx - 1 + totalLocos) % totalLocos;
        Serial.printf("[TOUCH] Swipe Right -> Vorherige Lok: %s (DCC #%d)\n", 
                      locos[currentLocoIdx].name, locos[currentLocoIdx].dccAddress);
        ui.setScreen(SCREEN_DRIVE);
        ui.resetDriveCache();
        leds.triggerFlash(0x00FFFF, 120);
        updateUiAndLeds(true);
      }
      // Klick / Tap auf das Display: Modus wechseln
      else if (touchData.gesture == GESTURE_CLICK) {
        gestureLocked = true;
        lastGestureTime = now;
        if (ui.getScreen() == SCREEN_DRIVE) {
          ui.setScreen(SCREEN_FUNCTIONS);
        } else {
          ui.setScreen(SCREEN_DRIVE);
        }
        updateUiAndLeds(true);
      }
    }
  } else {
    gestureLocked = false;
  }
}
