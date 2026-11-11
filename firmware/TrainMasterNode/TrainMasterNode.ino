/*
 * ============================================================================
 * 🚂 TrainMaster Node - ESP32 Firmware für Modellbahn-Signale & Belegtmelder
 * ============================================================================
 * Entwickelt für TrainMaster Modellbahn-Steuerung.
 * 
 * Features:
 * - ⚡ Blitzschnelle Übertragung via TCP Socket (Port 8051) in Echtzeit
 * - 🔍 Automatische Wiederverbindung zum TrainMaster Server
 * - 🚦 Signalsteuerung mit sanftem Glühlampen-Überblenden (Soft-Fading per PWM)
 * - 📡 Belegtmelder- & Sensor-Eingänge mit konfigurierbarer Entprellung (Debounce)
 * - 🌐 Moderne Web-Oberfläche auf Port 80 (Live-Pin-Monitor & Einstellungen)
 * - 📶 Integrierter WiFi-Manager (spannt bei Bedarf Konfigurations-Hotspot auf)
 * - 🔄 OTA (Over-The-Air) Firmware-Update direkt im Webbrowser
 * 
 * Kompatibel mit: Arduino IDE (ab 2.x) und PlatformIO (VS Code).
 * Keine externen Bibliotheken erforderlich (nur Standard ESP32 Board-Treiber).
 * ============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClient.h>
#include <Preferences.h>
#include <Update.h>
#include <ArduinoOTA.h>

// --- Standard-Konfiguration (kann im Web-Interface geändert werden) ---
#define FIRMWARE_VERSION "2.2.0"

#if __has_include("credentials.h")
  #include "credentials.h"
#endif

#ifndef DEFAULT_SSID
  #define DEFAULT_SSID     "DEIN_WLAN_NAME"
#endif
#ifndef DEFAULT_PASS
  #define DEFAULT_PASS     "DEIN_WLAN_PASSWORT"
#endif
#ifndef DEFAULT_SERVER
  #define DEFAULT_SERVER   "192.168.1.100"
#endif
#define DEFAULT_PORT     8051
#define DEFAULT_UNIT     33
#define DEFAULT_NODE_NAME "TrainMasterESP1"
#define DEFAULT_ADMIN_PIN "1234"          // Werkseinstellung, in der Web-Oberfläche ändern!
#define OTA_UNLOCK_WINDOW_MS 180000UL     // Firmware-Upload nach PIN-Eingabe 3 Minuten möglich
#define PIN_MAX_FAILURES 5                // danach Sperre gegen Durchprobieren
#define PIN_LOCKOUT_MS 60000UL

// --- Pin-Rollen & Pin-Definitionen ---
enum PinModeType {
  PIN_UNUSED = 0,
  PIN_SENSOR_PULLUP = 1,   // Eingang mit internem Pull-Up (GND-Schalter)
  PIN_SENSOR_NOPULL = 2,   // Eingang ohne Pull-Up (z.B. Pin 34-39, Analog/GND-Schaltung)
  PIN_SIGNAL_ACTIVE_LOW = 3,  // Signal-Lampe (Active Low / Common Anode +)
  PIN_SIGNAL_ACTIVE_HIGH = 4  // Signal-Lampe (Active High / Common Cathode -)
};

struct PinConfig {
  uint8_t pin;
  PinModeType mode;
  bool state;                     // Letzter gelesener Rohwert (true = aktiv)
  bool isOccupied;                // Stabiler Zustand (true = BELEGT, false = FREI)
  unsigned long lastActiveTime;   // Zeitstempel des letzten Signals für Haltezeit
  unsigned long triggerStartTime; // Zeitstempel für schnelle Einschaltverzögerung
};

// Vorkonfigurierte Pins (können erweitert oder im Code angepasst werden)
// Pin 35 ist der Belegtmelder des Nutzers!
// Pins 12, 13, 14, 15 sind für das Ausfahrsignal N1 (Rot, Grün, Gelb, Weiß)
PinConfig configuredPins[] = {
  { 35, PIN_SENSOR_NOPULL, false, false, 0, 0 },   // Belegtmelder-Eingang (GPIO 35)
  { 34, PIN_SENSOR_NOPULL, false, false, 0, 0 },   // Eingang (GPIO 34)
  { 36, PIN_SENSOR_NOPULL, false, false, 0, 0 },   // Eingang (GPIO 36 / VP)
  { 39, PIN_SENSOR_NOPULL, false, false, 0, 0 },   // Eingang (GPIO 39 / VN)
  { 4,  PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 4)
  { 16, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 16)
  { 17, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 17)
  { 18, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 18)
  { 19, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 19)
  { 21, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 21)
  { 22, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 22)
  { 23, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 23)
  { 25, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 25)
  { 26, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 26)
  { 27, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 27)
  { 32, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 32)
  { 33, PIN_SENSOR_PULLUP, false, false, 0, 0 },   // Eingang mit Pull-Up (GPIO 33)
  // Signallampen (Ausgänge)
  { 12, PIN_SIGNAL_ACTIVE_LOW, false, false, 0, 0 }, // Signal Rot
  { 13, PIN_SIGNAL_ACTIVE_LOW, false, false, 0, 0 }, // Signal Grün
  { 14, PIN_SIGNAL_ACTIVE_LOW, false, false, 0, 0 }, // Signal Gelb
  { 15, PIN_SIGNAL_ACTIVE_LOW, false, false, 0, 0 }  // Signal Weiß
};

const int NUM_PINS = sizeof(configuredPins) / sizeof(configuredPins[0]);

// Asymmetrisches Debouncing / Pulse-Stretching für Stromfühler:
// - triggerDelayMs: Schnell reagieren (5ms fängt selbst kleinste Ladespitzen ein)
// - holdDelayMs: Haltezeit (400ms überbrückt Pufferkondensator & Radkontakt-Lücken)
unsigned long triggerDelayMs = 5;
unsigned long holdDelayMs = 400;

// --- Globale Variablen & Objekte ---
Preferences prefs;
WebServer webServer(80);
WiFiClient tcpClient;

String wifiSsid = DEFAULT_SSID;
String wifiPass = DEFAULT_PASS;
String serverIp = DEFAULT_SERVER;
int serverPort = DEFAULT_PORT;
int unitId = DEFAULT_UNIT;
String nodeName = DEFAULT_NODE_NAME;

unsigned long lastServerConnectAttempt = 0;
unsigned long lastHeartbeat = 0;
bool isConnectedToServer = false;

// --- Zugriffsschutz (Admin-PIN) ---
String adminPin = DEFAULT_ADMIN_PIN;
uint8_t pinFailures = 0;
unsigned long pinLockedAt = 0;
bool pinLocked = false;
// Firmware-Upload: wird erst nach PIN-Eingabe für die anfragende IP freigeschaltet
bool otaUnlocked = false;
unsigned long otaUnlockedAt = 0;
IPAddress otaUnlockedIp;
bool otaUploadAccepted = false;

// --- Prototypen ---
void setupPins();
void handleInputs();
void connectToWiFi();
void maintainServerConnection();
void sendSensorEvent(uint8_t pin, bool state);
void sendHeartbeat();
void processIncomingData(String data);
void setupWebServer();

// --- Hilfsfunktionen Sicherheit ---

// Text für die Ausgabe in HTML entschärfen (Modulname, SSID, Server-Adresse)
String htmlEscape(const String& in) {
  String out;
  out.reserve(in.length() + 8);
  for (size_t i = 0; i < in.length(); i++) {
    char ch = in[i];
    switch (ch) {
      case '&': out += "&amp;"; break;
      case '<': out += "&lt;"; break;
      case '>': out += "&gt;"; break;
      case '"': out += "&quot;"; break;
      case '\'': out += "&#39;"; break;
      default: out += ch;
    }
  }
  return out;
}

// Modulname: nur Buchstaben, Ziffern, Leerzeichen, - _ . (max. 32 Zeichen).
// Der Name wird in HTML, JSON und XML eingesetzt und darf dort nichts aufbrechen.
String sanitizeNodeName(const String& in) {
  String out;
  for (size_t i = 0; i < in.length() && out.length() < 32; i++) {
    char ch = in[i];
    if (isalnum((unsigned char)ch) || ch == ' ' || ch == '-' || ch == '_' || ch == '.') out += ch;
  }
  out.trim();
  return out.length() > 0 ? out : String(DEFAULT_NODE_NAME);
}

// Server-Adresse: IP oder Hostname (Buchstaben, Ziffern, Punkt, Bindestrich)
bool isValidHost(const String& in) {
  if (in.length() == 0 || in.length() > 64) return false;
  for (size_t i = 0; i < in.length(); i++) {
    char ch = in[i];
    if (!(isalnum((unsigned char)ch) || ch == '.' || ch == '-')) return false;
  }
  return true;
}

// Admin-PIN prüfen, mit Sperre nach mehreren Fehlversuchen
bool checkAdminPin(const String& candidate) {
  if (pinLocked) {
    if (millis() - pinLockedAt < PIN_LOCKOUT_MS) return false;
    pinLocked = false;
    pinFailures = 0;
  }
  if (candidate.length() > 0 && candidate == adminPin) {
    pinFailures = 0;
    return true;
  }
  if (++pinFailures >= PIN_MAX_FAILURES) {
    pinLocked = true;
    pinLockedAt = millis();
    Serial.println("⛔ Zu viele falsche PIN-Eingaben: 60 s gesperrt.");
  }
  return false;
}

// Ist der Firmware-Upload für die anfragende Gegenstelle freigeschaltet?
bool otaAllowedForClient() {
  if (!otaUnlocked) return false;
  if (millis() - otaUnlockedAt >= OTA_UNLOCK_WINDOW_MS) {
    otaUnlocked = false;
    return false;
  }
  return webServer.client().remoteIP() == otaUnlockedIp;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n==========================================");
  Serial.println("🚂 TrainMaster Node ESP32 Firmware v" FIRMWARE_VERSION);
  Serial.println("==========================================");

  // Einstellungen aus Flash-Speicher (NVS) laden
  prefs.begin("trainmaster", false);
  wifiSsid = prefs.getString("ssid", DEFAULT_SSID);
  wifiPass = prefs.getString("pass", DEFAULT_PASS);
  serverIp = prefs.getString("server", DEFAULT_SERVER);
  serverPort = prefs.getInt("port", DEFAULT_PORT);
  unitId = prefs.getInt("unit", DEFAULT_UNIT);
  nodeName = sanitizeNodeName(prefs.getString("name", DEFAULT_NODE_NAME));
  adminPin = prefs.getString("admin_pin", DEFAULT_ADMIN_PIN);
  if (adminPin.length() < 4) adminPin = DEFAULT_ADMIN_PIN;
  triggerDelayMs = prefs.getULong("trigger", 5);
  holdDelayMs = prefs.getULong("hold", 400);

  setupPins();
  connectToWiFi();
  setupWebServer();

  // ArduinoOTA für bequemes Flashen über Arduino IDE / Netzwerk (TM-05).
  // Passwort = Admin-PIN dieses Moduls (kein festes, im Quelltext stehendes Passwort mehr).
  // Solange die Werks-PIN aktiv ist, bleibt ArduinoOTA abgeschaltet: erst PIN ändern.
  ArduinoOTA.setHostname(nodeName.c_str());
  ArduinoOTA.setPassword(adminPin.c_str());
  ArduinoOTA.onStart([]() {
    Serial.println("🔄 ArduinoOTA Flashvorgang gestartet...");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\n🎉 ArduinoOTA erfolgreich abgeschlossen! Neustart...");
  });
  if (adminPin != DEFAULT_ADMIN_PIN) {
    ArduinoOTA.begin();
  } else {
    Serial.println("⚠️ Werks-PIN aktiv: ArduinoOTA ist abgeschaltet. Bitte in der Web-Oberfläche eine eigene Admin-PIN setzen.");
  }

  Serial.println("✅ System bereit. Starte Hauptschleife...");
}

void loop() {
  if (adminPin != DEFAULT_ADMIN_PIN) ArduinoOTA.handle();
  webServer.handleClient();
  maintainServerConnection();
  handleInputs();

  // Alle 5 Sekunden Heartbeat / Lebenszeichen senden
  if (millis() - lastHeartbeat >= 5000) {
    lastHeartbeat = millis();
    if (isConnectedToServer) {
      sendHeartbeat();
    }
  }

  // Daten vom TrainMaster Server empfangen
  // CR-12: Persistenter Zeilenpuffer - nur vollständige, mit '\n' abgeschlossene Zeilen verarbeiten
  static String rxLine = "";
  while (tcpClient.connected() && tcpClient.available()) {
    char c = (char)tcpClient.read();
    if (c == '\n') {
      processIncomingData(rxLine);
      rxLine = "";
    } else if (c != '\r') {
      if (rxLine.length() < 1024) {
        rxLine += c;
      } else {
        Serial.println("⚠️ RX-Zeile zu lang, verworfen.");
        rxLine = "";
      }
    }
  }
  if (!tcpClient.connected()) {
    rxLine = "";
  }
}

// CR-11: Liefert true, wenn ein Befehl eine fremde Unit adressiert (unit="X" bzw. "unit":X)
bool isForOtherUnit(const String& data) {
  int idx = data.indexOf("unit=\"");
  int offset = 6;
  if (idx < 0) {
    idx = data.indexOf("\"unit\":");
    offset = 7;
  }
  if (idx < 0) return false; // Ohne Unit-Angabe: abwärtskompatibel annehmen
  int target = data.substring(idx + offset).toInt();
  return target != unitId;
}

// CR-13: Aktuellen Zustand aller Sensor-Pins (auch FREI) nach jeder Verbindung melden
void sendSensorSnapshot() {
  for (int i = 0; i < NUM_PINS; i++) {
    PinModeType mode = configuredPins[i].mode;
    if (mode != PIN_SENSOR_PULLUP && mode != PIN_SENSOR_NOPULL) continue;
    uint8_t pin = configuredPins[i].pin;
    String json = "{\"event\":\"sensor\",\"snapshot\":true,\"unit\":" + String(unitId) +
                  ",\"pin\":" + String(pin) +
                  ",\"state\":" + (configuredPins[i].isOccupied ? "true" : "false") +
                  ",\"addr\":" + String(unitId * 100 + pin) + "}\n";
    tcpClient.print(json);
  }
  Serial.println("📤 Sensor-Snapshot an TrainMaster gesendet.");
}

// --- Hardware-Pins initialisieren ---
void setupPins() {
  for (int i = 0; i < NUM_PINS; i++) {
    uint8_t pin = configuredPins[i].pin;
    PinModeType mode = configuredPins[i].mode;

    switch (mode) {
      case PIN_SENSOR_PULLUP:
        pinMode(pin, INPUT_PULLUP);
        configuredPins[i].isOccupied = (digitalRead(pin) == LOW); // LOW = Kontakt geschlossen = belegt
        configuredPins[i].state = configuredPins[i].isOccupied;
        break;

      case PIN_SENSOR_NOPULL:
        pinMode(pin, INPUT);
        configuredPins[i].isOccupied = (digitalRead(pin) == LOW);
        configuredPins[i].state = configuredPins[i].isOccupied;
        break;

      case PIN_SIGNAL_ACTIVE_LOW:
        pinMode(pin, OUTPUT);
        digitalWrite(pin, HIGH); // Aus (Active Low)
        configuredPins[i].state = false;
        break;

      case PIN_SIGNAL_ACTIVE_HIGH:
        pinMode(pin, OUTPUT);
        digitalWrite(pin, LOW); // Aus (Active High)
        configuredPins[i].state = false;
        break;

      default:
        break;
    }
  }
  Serial.printf("📌 %d Pins erfolgreich konfiguriert.\n", NUM_PINS);
}

// --- Sensor-Eingänge mit asymmetrischem Pulse-Stretching (Haltezeit) abfragen ---
void handleInputs() {
  unsigned long now = millis();

  for (int i = 0; i < NUM_PINS; i++) {
    PinModeType mode = configuredPins[i].mode;
    if (mode != PIN_SENSOR_PULLUP && mode != PIN_SENSOR_NOPULL) continue;

    uint8_t pin = configuredPins[i].pin;
    // Bei typischen Belegtmeldern & Reed-Kontakten: LOW = Kontakt aktiv (GND geschaltet)
    bool rawActive = (digitalRead(pin) == LOW);
    configuredPins[i].state = rawActive;

    if (rawActive) {
      // Stromfluss erkannt (jeder Impuls lädt die Haltezeit neu auf)
      configuredPins[i].lastActiveTime = now;

      if (!configuredPins[i].isOccupied) {
        // Melder ist noch FREI: Schnelle Einschaltverzögerung prüfen
        if (configuredPins[i].triggerStartTime == 0) {
          configuredPins[i].triggerStartTime = now;
        }

        if (now - configuredPins[i].triggerStartTime >= triggerDelayMs) {
          configuredPins[i].isOccupied = true;
          configuredPins[i].triggerStartTime = 0;
          Serial.printf("📡 SENSOR-TRIGGER auf Pin GPIO %d -> 🔴 BELEGT\n", pin);
          sendSensorEvent(pin, true);
        }
      }
    } else {
      // Kein Stromfluss aktuell (z. B. Puffer versorgt LED oder Radprellen)
      configuredPins[i].triggerStartTime = 0;

      if (configuredPins[i].isOccupied) {
        // Melder ist noch BELEGT: Haltezeit (Abfallverzögerung / Pulse-Stretching) abwarten
        if (now - configuredPins[i].lastActiveTime >= holdDelayMs) {
          configuredPins[i].isOccupied = false;
          Serial.printf("📡 SENSOR-RELEASE auf Pin GPIO %d -> ⚪ FREI (nach %lu ms Haltezeit)\n", pin, holdDelayMs);
          sendSensorEvent(pin, false);
        }
      }
    }
  }
}

// --- Sensor-Meldung an TrainMaster senden ---
void sendSensorEvent(uint8_t pin, bool state) {
  if (!tcpClient.connected()) {
    Serial.println("⚠️ Nicht mit TrainMaster Server verbunden, Event kann nicht gesendet werden.");
    return;
  }

  // Sende sauberes JSON an TrainMaster
  String json = "{\"event\":\"sensor\",\"unit\":" + String(unitId) +
                ",\"pin\":" + String(pin) +
                ",\"state\":" + (state ? "true" : "false") +
                ",\"addr\":" + String(unitId * 100 + pin) + "}\n";

  tcpClient.print(json);
  Serial.print("TX -> TrainMaster: " + json);
}

// --- Regelmäßiger Heartbeat ---
void sendHeartbeat() {
  String json = "{\"event\":\"heartbeat\",\"unit\":" + String(unitId) +
                ",\"nodename\":\"" + nodeName + "\"" +
                ",\"rssi\":" + String(WiFi.RSSI()) +
                ",\"uptime\":" + String(millis() / 1000) +
                ",\"ip\":\"" + WiFi.localIP().toString() + "\"} \n";
  tcpClient.print(json);
}

// --- Befehle von TrainMaster verarbeiten (Signale schalten) ---
void processIncomingData(String data) {
  data.trim();
  if (data.length() == 0) return;

  Serial.println("RX <- TrainMaster: " + data);

  if (isForOtherUnit(data)) {
    Serial.println("↪️ Befehl für andere Unit ignoriert.");
    return;
  }

  // 1. XML Aspect oder Output Befehl: <output unit="33" port="12" val="1"/>
  if (data.startsWith("<output") || data.indexOf("port=") > 0) {
    int portIdx = data.indexOf("port=\"");
    int valIdx = data.indexOf("val=\"");
    if (portIdx > 0 && valIdx > 0) {
      int pin = data.substring(portIdx + 6, data.indexOf("\"", portIdx + 6)).toInt();
      int val = data.substring(valIdx + 5, data.indexOf("\"", valIdx + 5)).toInt();

      // Pin ansteuern
      for (int i = 0; i < NUM_PINS; i++) {
        if (configuredPins[i].pin == pin) {
          bool active = (val == 1);
          configuredPins[i].state = active;
          if (configuredPins[i].mode == PIN_SIGNAL_ACTIVE_LOW) {
            digitalWrite(pin, active ? LOW : HIGH);
          } else {
            digitalWrite(pin, active ? HIGH : LOW);
          }
          Serial.printf("🚦 Signal-Pin %d geschaltet: %s\n", pin, active ? "AN" : "AUS");
          break;
        }
      }
    }
    return;
  }

  // 2. JSON Signalbefehl: {"cmd":"signal", "pins":{"12":false,"13":true}}
  if (data.startsWith("{") && data.indexOf("\"pins\"") > 0) {
    // Einfaches Parsen der Pin-Pegel
    int pinsObjStart = data.indexOf("\"pins\":{");
    if (pinsObjStart > 0) {
      String pinsStr = data.substring(pinsObjStart + 7, data.indexOf("}", pinsObjStart));
      for (int i = 0; i < NUM_PINS; i++) {
        uint8_t pin = configuredPins[i].pin;
        String pinKey = "\"" + String(pin) + "\":";
        int keyPos = pinsStr.indexOf(pinKey);
        if (keyPos >= 0) {
          bool active = pinsStr.substring(keyPos + pinKey.length()).startsWith("true");
          configuredPins[i].state = active;
          if (configuredPins[i].mode == PIN_SIGNAL_ACTIVE_LOW) {
            digitalWrite(pin, active ? LOW : HIGH);
          } else if (configuredPins[i].mode == PIN_SIGNAL_ACTIVE_HIGH) {
            digitalWrite(pin, active ? HIGH : LOW);
          }
          Serial.printf("🚦 Signal-Pin %d -> %s\n", pin, active ? "EIN" : "AUS");
        }
      }
    }
  }
}

// --- WLAN-Verbindung verwalten ---
void connectToWiFi() {
  Serial.printf("📶 Verbinde mit WLAN '%s'...\n", wifiSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(400);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n🎉 WLAN erfolgreich verbunden!");
    Serial.print("📍 Lokale IP-Adresse: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n⚠️ WLAN-Verbindung fehlgeschlagen! Starte Access-Point 'TrainMaster-Setup'...");
    WiFi.mode(WIFI_AP);
    // Passwort des Einrichtungs-Hotspots: die eigene Admin-PIN, sobald sie mindestens
    // 8 Zeichen hat (WPA2-Minimum), sonst das Werkspasswort 12345678.
    String apPass = adminPin.length() >= 8 ? adminPin : String("12345678");
    WiFi.softAP("TrainMaster-Setup", apPass.c_str());
    Serial.print("📍 Konfigurations-IP: ");
    Serial.println(WiFi.softAPIP());
  }
}

// --- Dauerhafte TCP-Verbindung zu TrainMaster aufrechterhalten ---
void maintainServerConnection() {
  if (WiFi.status() != WL_CONNECTED) return;

  if (!tcpClient.connected()) {
    isConnectedToServer = false;
    if (millis() - lastServerConnectAttempt >= 3500) {
      lastServerConnectAttempt = millis();
      Serial.printf("🔌 Verbinde mit TrainMaster Server (%s:%d)...\n", serverIp.c_str(), serverPort);

      if (tcpClient.connect(serverIp.c_str(), serverPort)) {
        isConnectedToServer = true;
        Serial.println("🟢 Verbindung zu TrainMaster Server erfolgreich hergestellt!");

        // Registrierung / Handshake an TrainMaster senden
        String regMsg = "{\"event\":\"connect\",\"unit\":" + String(unitId) +
                        ",\"nodename\":\"" + nodeName + "\"" +
                        ",\"version\":\"" FIRMWARE_VERSION "\"" +
                        ",\"ip\":\"" + WiFi.localIP().toString() + "\"}\n";
        tcpClient.print(regMsg);

        // Auch Rocrail-kompatiblen Handshake für abwärtskompatiblen WIO-Treiber mitsenden
        tcpClient.printf("<xmlh><wio type=\"tm-esp\" id=\"%d\" nodename=\"%s\" clientver=\"2000\"/></xmlh>\n", unitId, nodeName.c_str());

        // CR-13: Belegtzustände nach jeder (Wieder-)Verbindung abgleichen
        sendSensorSnapshot();
      } else {
        Serial.println("❌ Verbindung fehlgeschlagen. Neuer Versuch in 3.5s...");
      }
    }
  } else {
    isConnectedToServer = true;
  }
}

// --- Moderne Web-Oberfläche auf Port 80 ---
void setupWebServer() {
  // Hauptseite: Dashboard
  webServer.on("/", HTTP_GET, []() {
    String html = "<!DOCTYPE html><html lang='de'><head><meta charset='UTF-8'>"
                  "<meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                  "<title>TrainMaster Node (" + htmlEscape(nodeName) + ")</title>"
                  "<style>"
                  "body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0d1117;color:#c9d1d9;margin:0;padding:20px;}"
                  ".card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:18px;max-width:680px;margin:0 auto 16px;box-shadow:0 4px 12px rgba(0,0,0,0.3);}"
                  "h1,h2{color:#f0f6fc;margin-top:0;}"
                  ".badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;}"
                  ".badge-online{background:rgba(35,134,54,0.2);border:1px solid #238636;color:#3fb950;}"
                  ".badge-offline{background:rgba(218,54,51,0.2);border:1px solid #da3633;color:#f85149;}"
                  ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-top:12px;}"
                  ".pin-box{background:#21262d;border:1px solid #30363d;border-radius:6px;padding:10px;text-align:center;}"
                  ".pin-box.active{background:rgba(218,54,51,0.25);border-color:#da3633;}"
                  ".btn{background:#238636;color:#fff;border:none;border-radius:6px;padding:8px 14px;cursor:pointer;font-weight:600;text-decoration:none;display:inline-block;}"
                  ".btn:hover{background:#2ea043;}"
                  "input[type=text],input[type=password],input[type=number]{background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#f0f6fc;padding:8px;width:100%;box-sizing:border-box;margin:6px 0 12px;}"
                  "</style>"
                  "</head><body>";

    html += "<div class='card'>";
    html += "<div style='display:flex;justify-content:space-between;align-items:center;'>";
    html += "<h1>🚂 TrainMaster Node</h1>";
    html += "<span class='badge " + String(isConnectedToServer ? "badge-online'>🟢 Verbunden" : "badge-offline'>🔴 Getrennt") + "</span>";
    html += "</div>";
    html += "<p style='color:#8b949e;font-size:14px;'>Modellbahn ESP32-Controller für Signale & Belegtmeldung (v" FIRMWARE_VERSION ")</p>";
    html += "<div>Unit/Baugruppe: <strong>#" + String(unitId) + "</strong> | IP: <strong>" + WiFi.localIP().toString() + "</strong> | RSSI: <strong>" + String(WiFi.RSSI()) + " dBm</strong></div>";
    html += "<div>TrainMaster Server: <strong>" + htmlEscape(serverIp) + ":" + String(serverPort) + "</strong></div>";
    if (adminPin == DEFAULT_ADMIN_PIN) {
      html += "<div style='margin-top:12px;padding:10px;border:1px solid #da3633;border-radius:6px;background:rgba(218,54,51,0.15);color:#ffa198;'>"
              "⚠️ <strong>Werks-PIN 1234 aktiv.</strong> Jeder im WLAN kann dieses Modul umstellen und neue Firmware aufspielen. "
              "Bitte unten eine eigene Admin-PIN setzen.</div>";
    }
    html += "</div>";

    // Pin-Monitor
    html += "<div class='card'>";
    html += "<h2>Live Pin-Monitor</h2>";
    html += "<div class='grid'>";
    for (int i = 0; i < NUM_PINS; i++) {
      uint8_t pin = configuredPins[i].pin;
      bool isHigh = configuredPins[i].isOccupied;
      String role = (configuredPins[i].mode == PIN_SENSOR_NOPULL || configuredPins[i].mode == PIN_SENSOR_PULLUP) ? "SENSOR" : "SIGNAL";
      html += "<div class='pin-box " + String(isHigh ? "active" : "") + "'>";
      html += "<div style='font-size:11px;color:#8b949e;'>" + role + "</div>";
      html += "<div style='font-size:16px;font-weight:700;color:#f0f6fc;'>GPIO " + String(pin) + "</div>";
      html += "<div style='font-size:12px;margin-top:4px;color:" + String(isHigh ? "#f85149" : "#8b949e") + ";'>" + String(isHigh ? "🔴 BELEGT" : "⚪ FREI") + "</div>";
      html += "</div>";
    }
    html += "</div>";
    html += "</div>";

    // Einstellungen Formular
    html += "<div class='card'>";
    html += "<h2>⚙️ Konfiguration</h2>";
    html += "<form method='POST' action='/save'>";
    html += "<label>Modul-Name (Buchstaben, Ziffern, - _ . Leerzeichen):</label><input type='text' name='name' maxlength='32' value='" + htmlEscape(nodeName) + "'>";
    html += "<label>Baugruppe / Unit-Nummer:</label><input type='number' name='unit' value='" + String(unitId) + "'>";
    html += "<label>TrainMaster Server IP:</label><input type='text' name='server' value='" + htmlEscape(serverIp) + "'>";
    html += "<label>Server Port:</label><input type='number' name='port' value='" + String(serverPort) + "'>";
    html += "<label>Belegtmelder Haltezeit (ms, Abfallverzögerung / Pulse-Stretching):</label><input type='number' name='hold' value='" + String(holdDelayMs) + "'>";
    html += "<label>Belegtmelder Triggerzeit (ms, Einschaltverzögerung):</label><input type='number' name='trigger' value='" + String(triggerDelayMs) + "'>";
    html += "<label>WLAN SSID:</label><input type='text' name='ssid' value='" + htmlEscape(wifiSsid) + "'>";
    html += "<label>WLAN Passwort (leer lassen zum Beibehalten):</label><input type='password' name='pass' placeholder='••••••••' value=''>";
    html += "<label>Neue Admin-PIN (4–32 Zeichen, leer lassen zum Beibehalten):</label><input type='password' name='newpin' maxlength='32' autocomplete='new-password' value=''>";
    html += "<label>Aktuelle Admin-PIN zur Bestätigung (Werkseinstellung: 1234):</label><input type='password' name='pin' placeholder='Admin-PIN' required>";
    html += "<button type='submit' class='btn'>💾 Speichern & Neustart</button>";
    html += "</form>";
    html += "</div>";

    // OTA Update Formular
    html += "<div class='card'>";
    html += "<h2>🔄 Over-The-Air Update (OTA)</h2>";
    html += "<p style='color:#8b949e;font-size:13px;'>Aktualisiere die Firmware direkt über das Netzwerk mit einer compilierten .bin Datei:</p>";
    if (otaAllowedForClient()) {
      // Upload ist für dieses Gerät freigeschaltet (PIN wurde bereits geprüft)
      html += "<p style='color:#3fb950;font-size:13px;'>🔓 Upload für dieses Gerät 3 Minuten lang freigeschaltet.</p>";
      html += "<form method='POST' action='/update' enctype='multipart/form-data'>";
      html += "<input type='file' name='update' accept='.bin' required style='margin-bottom:10px;'><br>";
      html += "<button type='submit' class='btn' style='background:#1f6feb;'>🚀 Firmware flashen</button>";
      html += "</form>";
    } else {
      // Erst die PIN prüfen, dann den Upload annehmen. Früher wurde die Datei schon
      // geflasht, bevor die PIN überhaupt geprüft war.
      html += "<form method='POST' action='/ota-unlock'>";
      html += "<label>Admin-PIN:</label><input type='password' name='pin' placeholder='Admin-PIN' required style='margin-bottom:10px;'><br>";
      html += "<button type='submit' class='btn' style='background:#1f6feb;'>🔓 Upload freischalten</button>";
      html += "</form>";
    }
    html += "</div>";

    html += "</body></html>";
    webServer.send(200, "text/html", html);
  });

  // Einstellungen speichern (geschützt mit Admin-PIN)
  webServer.on("/save", HTTP_POST, []() {
    if (!webServer.hasArg("pin") || !checkAdminPin(webServer.arg("pin"))) {
      webServer.send(401, "text/html; charset=utf-8", "<h2>⛔ Zugriff verweigert: Ungültige Admin-PIN (oder nach 5 Fehlversuchen 60 s gesperrt)!</h2><script>setTimeout(()=>window.location='/', 3000);</script>");
      return;
    }

    // Eingaben prüfen, bevor sie gespeichert werden
    if (webServer.hasArg("newpin") && webServer.arg("newpin").length() > 0) {
      String newPin = webServer.arg("newpin");
      if (newPin.length() < 4 || newPin.length() > 32) {
        webServer.send(400, "text/html; charset=utf-8", "<h2>⚠️ Die neue Admin-PIN muss 4 bis 32 Zeichen lang sein. Nichts gespeichert.</h2><script>setTimeout(()=>window.location='/', 4000);</script>");
        return;
      }
      prefs.putString("admin_pin", newPin);
    }
    if (webServer.hasArg("ssid") && webServer.arg("ssid").length() > 0 && webServer.arg("ssid").length() <= 32) prefs.putString("ssid", webServer.arg("ssid"));
    if (webServer.hasArg("pass") && webServer.arg("pass").length() > 0 && webServer.arg("pass").length() <= 64) prefs.putString("pass", webServer.arg("pass"));
    if (webServer.hasArg("server") && isValidHost(webServer.arg("server"))) prefs.putString("server", webServer.arg("server"));
    if (webServer.hasArg("port")) {
      long p = webServer.arg("port").toInt();
      if (p >= 1 && p <= 65535) prefs.putInt("port", (int)p);
    }
    if (webServer.hasArg("unit")) {
      long u = webServer.arg("unit").toInt();
      if (u >= 0 && u <= 65535) prefs.putInt("unit", (int)u);
    }
    if (webServer.hasArg("name")) prefs.putString("name", sanitizeNodeName(webServer.arg("name")));
    if (webServer.hasArg("hold")) {
      long h = webServer.arg("hold").toInt();
      if (h >= 0 && h <= 60000) prefs.putULong("hold", (unsigned long)h);
    }
    if (webServer.hasArg("trigger")) {
      long t = webServer.arg("trigger").toInt();
      if (t >= 0 && t <= 60000) prefs.putULong("trigger", (unsigned long)t);
    }

    webServer.send(200, "text/html", "<h2>✅ Einstellungen gespeichert! ESP32 startet neu...</h2><script>setTimeout(()=>window.location='/', 5000);</script>");
    delay(1000);
    ESP.restart();
  });

  // Firmware-Upload freischalten: PIN prüfen, danach darf nur diese IP 3 Minuten lang hochladen
  webServer.on("/ota-unlock", HTTP_POST, []() {
    if (!webServer.hasArg("pin") || !checkAdminPin(webServer.arg("pin"))) {
      webServer.send(401, "text/html; charset=utf-8", "<h2>⛔ Zugriff verweigert: Ungültige Admin-PIN (oder nach 5 Fehlversuchen 60 s gesperrt)!</h2><script>setTimeout(()=>window.location='/', 3000);</script>");
      return;
    }
    otaUnlocked = true;
    otaUnlockedAt = millis();
    otaUnlockedIp = webServer.client().remoteIP();
    webServer.sendHeader("Location", "/");
    webServer.send(303, "text/plain", "OK");
  });

  // OTA Firmware Upload Handler. Die Freischaltung wird geprüft, BEVOR das erste Byte
  // in den Flash geschrieben wird (im Upload-Callback), nicht erst nach dem Flashen.
  webServer.on("/update", HTTP_POST, []() {
    if (!otaUploadAccepted) {
      webServer.send(401, "text/plain", "ACCESS DENIED: UPLOAD NOT UNLOCKED");
      return;
    }
    otaUploadAccepted = false;
    otaUnlocked = false; // Freischaltung gilt für genau einen Upload
    bool ok = !Update.hasError();
    webServer.sendHeader("Connection", "close");
    webServer.send(ok ? 200 : 500, "text/plain", ok ? "OK" : "FAIL");
    if (ok) {
      delay(500);
      ESP.restart();
    }
  }, []() {
    HTTPUpload& upload = webServer.upload();
    if (upload.status == UPLOAD_FILE_START) {
      otaUploadAccepted = otaAllowedForClient();
      if (!otaUploadAccepted) {
        Serial.println("⛔ OTA Upload abgelehnt: nicht freigeschaltet.");
        return;
      }
      Serial.printf("🔄 OTA Update Start: %s\n", upload.filename.c_str());
      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (!otaUploadAccepted) return; // nichts schreiben
      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_END) {
      if (!otaUploadAccepted) return;
      if (Update.end(true)) {
        Serial.printf("🎉 OTA Update erfolgreich: %u Bytes\n", upload.totalSize);
      } else {
        Update.printError(Serial);
      }
    } else if (upload.status == UPLOAD_FILE_ABORTED) {
      if (otaUploadAccepted) Update.abort();
      otaUploadAccepted = false;
    }
  });

  webServer.begin();
  Serial.println("🌐 Web-Server aktiv auf Port 80");
}
