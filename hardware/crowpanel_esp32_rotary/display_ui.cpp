#include "display_ui.h"

// 16-Bit RGB565 Farbdefinitionen (TrainMaster Theme)
#define COLOR_BG          0x0821  // Sehr dunkles Schiefergrau
#define COLOR_CARD        0x18C3  // Dunkles Karten-Panel
#define COLOR_TEXT_WHITE  0xFFFF
#define COLOR_TEXT_MUTED  0x9492
#define COLOR_ACCENT      0x05FD  // TrainMaster Cyan
#define COLOR_GREEN       0x2FE6  // Fahrt / Go
#define COLOR_YELLOW      0xFFE0  // Warnung / Reisestufe
#define COLOR_ORANGE      0xFD00  // Schnell
#define COLOR_RED         0xF945  // Stop / Maximal
#define COLOR_DARK_ARC    0x2124  // Tacho-Hintergrund

DisplayUI::DisplayUI()
  : _bus(nullptr), _gfx(nullptr), _currentScreen(SCREEN_BOOT), _brightness(220) {}

bool DisplayUI::begin() {
  // 1. LCD 3.3V Stromversorgung aktivieren (Hardware-Schalter auf GPIO 1)
  pinMode(POWER_LCD_PIN, OUTPUT);
  digitalWrite(POWER_LCD_PIN, HIGH);

  // 2. Externe 5V Versorgung aktivieren (GPIO 2)
  pinMode(POWER_EXT_PIN, OUTPUT);
  digitalWrite(POWER_EXT_PIN, HIGH);

  // 3. Backlight Pin initialisieren & einschalten (GPIO 46)
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);

  delay(60); // Kurze Stabilisierungspause für LCD Power Rail

  // SPI Bus mit FSPI & Hardware-CS für ESP32-S3 und GC9A01 Display konfigurieren
  _bus = new Arduino_ESP32SPI(TFT_DC, TFT_CS, TFT_SCK, TFT_MOSI, GFX_NOT_DEFINED, FSPI, true);
  _gfx = new Arduino_GC9A01(_bus, TFT_RST, 0 /* Rotation 0 */, true /* IPS */);

  if (!_gfx->begin()) {
    return false;
  }

  // Display initialisieren & Screen aufbauen
  _gfx->fillScreen(COLOR_BG);
  digitalWrite(TFT_BL, HIGH);
  return true;
}

void DisplayUI::setBacklight(uint8_t brightness) {
  _brightness = brightness;
  pinMode(TFT_BL, OUTPUT);
  if (_brightness > 0) {
    digitalWrite(TFT_BL, HIGH);
  } else {
    digitalWrite(TFT_BL, LOW);
  }
}

void DisplayUI::setScreen(UiScreen screen) {
  _currentScreen = screen;
  _gfx->fillScreen(COLOR_BG);
}

void DisplayUI::showBootStatus(const char* statusText, const char* detailText) {
  _gfx->fillScreen(COLOR_BG);

  // Zentraler Kreis mit TrainMaster Logo-Farben
  _gfx->drawCircle(120, 120, 108, COLOR_ACCENT);
  _gfx->drawCircle(120, 120, 106, COLOR_DARK_ARC);

  // Titel
  _gfx->setTextColor(COLOR_ACCENT);
  _gfx->setTextSize(2);
  _gfx->setCursor(45, 60);
  _gfx->print("TrainMaster");

  // Icon / Untertitel
  _gfx->setTextColor(COLOR_TEXT_WHITE);
  _gfx->setTextSize(1);
  _gfx->setCursor(55, 90);
  _gfx->print("ESP32 SMART KNOB");

  // Status
  _gfx->setTextSize(1);
  _gfx->setTextColor(COLOR_GREEN);
  _gfx->setCursor(35, 125);
  _gfx->print(statusText);

  // Detail (z.B. IP)
  if (detailText && strlen(detailText) > 0) {
    _gfx->setTextColor(COLOR_TEXT_MUTED);
    _gfx->setCursor(35, 145);
    _gfx->print(detailText);
  }

  // Versions-Badge unten
  _gfx->setTextColor(COLOR_TEXT_MUTED);
  _gfx->setCursor(75, 185);
  _gfx->print("v1.0 - WiFi HMI");
}

void DisplayUI::showEmergencyStop(bool active) {
  if (active) {
    _gfx->fillScreen(COLOR_RED);
    _gfx->setTextColor(COLOR_TEXT_WHITE);
    _gfx->setTextSize(3);
    _gfx->setCursor(45, 90);
    _gfx->print("NOT-AUS");
    _gfx->setTextSize(2);
    _gfx->setCursor(40, 135);
    _gfx->print("TRACK STOP");
  } else {
    _gfx->fillScreen(COLOR_BG);
  }
}

uint16_t DisplayUI::getSpeedColor(uint8_t speed) {
  if (speed == 0)   return COLOR_TEXT_MUTED;
  if (speed <= 30)  return COLOR_ACCENT;
  if (speed <= 70)  return COLOR_GREEN;
  if (speed <= 100) return COLOR_YELLOW;
  return COLOR_RED;
}

void DisplayUI::drawSpeedArc(uint8_t speed, uint8_t maxSpeed) {
  int cx = 120;
  int cy = 120;
  int r_out = 114;
  int r_in = 104;

  float currentFraction = (float)speed / (float)maxSpeed;
  if (currentFraction > 1.0f) currentFraction = 1.0f;

  // Gesamtwinkel von 135 Grad bis 405 Grad (270 Grad Umfang)
  int startAngle = 135;
  int totalAngle = 270;
  int activeAngle = startAngle + (int)(currentFraction * totalAngle);

  // Schrittweise Punkte zeichnen (flüssiger Kreisbogen)
  for (int a = startAngle; a <= startAngle + totalAngle; a += 3) {
    float rad = (a * 3.14159f) / 180.0f;
    float cosA = cos(rad);
    float sinA = sin(rad);

    uint16_t col;
    if (a <= activeAngle && speed > 0) {
      // Farbe abhängig vom relativen Fortschritt
      float pos = (float)(a - startAngle) / (float)totalAngle;
      if (pos < 0.25f)      col = COLOR_ACCENT;
      else if (pos < 0.60f) col = COLOR_GREEN;
      else if (pos < 0.85f) col = COLOR_YELLOW;
      else                  col = COLOR_RED;
    } else {
      col = COLOR_DARK_ARC;
    }

    int x1 = cx + (int)(r_in * cosA);
    int y1 = cy + (int)(r_in * sinA);
    int x2 = cx + (int)(r_out * cosA);
    int y2 = cy + (int)(r_out * sinA);

    _gfx->drawLine(x1, y1, x2, y2, col);
  }
}

void DisplayUI::resetDriveCache() {
  _lastSpeed = -1;
  _lastFwd = false;
  _lastTrackPower = true;
  _lastEmergencyStop = false;
  _lastFunc0 = false;
  _lastFunc1 = false;
  _lastLocoId[0] = '\0';
}

void DisplayUI::renderDriveScreen(const UiLoco &loco, bool trackPower, bool emergencyStop) {
  // 1. Wenn Not-Aus aktiv ist -> roten Not-Aus Screen anzeigen
  if (emergencyStop) {
    if (!_lastEmergencyStop) {
      _lastEmergencyStop = true;
      showEmergencyStop(true);
    }
    return;
  }

  // 2. Wenn Not-Aus beendet wurde -> Bildschirm komplett sauber wischen
  if (_lastEmergencyStop && !emergencyStop) {
    _lastEmergencyStop = false;
    resetDriveCache();
    _gfx->fillScreen(COLOR_BG);
  }

  // 3. Wenn Lok gewechselt wurde oder erster Draw -> Grundgerüst zeichnen
  bool fullRedraw = (strcmp(_lastLocoId, loco.id) != 0);
  if (fullRedraw) {
    _gfx->fillScreen(COLOR_BG);
    strlcpy(_lastLocoId, loco.id, sizeof(_lastLocoId));

    // Oben: Dezent "DCC ADRESSE", darunter groß z.B. "#3"
    _gfx->setTextSize(1);
    _gfx->setTextColor(COLOR_TEXT_MUTED, COLOR_BG);
    _gfx->setCursor(85, 20);
    _gfx->print("DCC ADRESSE");

    _gfx->setTextSize(3);
    _gfx->setTextColor(COLOR_ACCENT, COLOR_BG);
    char addrBuf[16];
    snprintf(addrBuf, sizeof(addrBuf), "#%d", loco.dccAddress);
    int addrLen = strlen(addrBuf);
    int addrX = 120 - (addrLen * 9);
    _gfx->setCursor(addrX, 36);
    _gfx->print(addrBuf);

    // Beschriftung unter Ziffer
    _gfx->setTextColor(COLOR_TEXT_MUTED, COLOR_BG);
    _gfx->setTextSize(1);
    _gfx->setCursor(92, 126);
    _gfx->print("FAHRSTUFE");

    // Tacho Bogen initial zeichnen
    drawSpeedArc(loco.speed, SPEED_MAX);
    _lastSpeed = -1;
  }

  // 4. Tacho-Bogen & Ziffer flackerfrei aktualisieren (nur bei Änderung)
  if (loco.speed != _lastSpeed || fullRedraw) {
    drawSpeedArc(loco.speed, SPEED_MAX);

    _gfx->setTextColor(getSpeedColor(loco.speed), COLOR_BG);
    _gfx->setTextSize(5);
    _gfx->setCursor(75, 76);
    _gfx->printf("%3d", loco.speed);

    _lastSpeed = loco.speed;
  }

  // 5. Fahrtrichtung nur bei Änderung aktualisieren
  if (loco.isFwd != _lastFwd || fullRedraw) {
    _gfx->setTextSize(2);
    if (loco.isFwd) {
      _gfx->setTextColor(COLOR_GREEN, COLOR_BG);
      _gfx->setCursor(55, 150);
      _gfx->print("> VORWAERTS  ");
    } else {
      _gfx->setTextColor(COLOR_YELLOW, COLOR_BG);
      _gfx->setCursor(55, 150);
      _gfx->print("< RUECKWAERTS");
    }
    _lastFwd = loco.isFwd;
  }

  // 6. Funktions-Badges flackerfrei
  if (loco.functions[0] != _lastFunc0 || loco.functions[1] != _lastFunc1 || fullRedraw) {
    _gfx->setTextSize(1);
    // F0 Licht
    if (loco.functions[0]) {
      _gfx->setTextColor(COLOR_YELLOW, COLOR_BG);
      _gfx->setCursor(55, 178);
      _gfx->print("[F0:LICHT] ");
    } else {
      _gfx->setTextColor(COLOR_DARK_ARC, COLOR_BG);
      _gfx->setCursor(55, 178);
      _gfx->print(" F0:Aus    ");
    }

    // F1 Sound
    if (loco.functions[1]) {
      _gfx->setTextColor(COLOR_ACCENT, COLOR_BG);
      _gfx->setCursor(130, 178);
      _gfx->print("[F1:SND]");
    } else {
      _gfx->setTextColor(COLOR_DARK_ARC, COLOR_BG);
      _gfx->setCursor(130, 178);
      _gfx->print(" F1:Aus ");
    }
    _lastFunc0 = loco.functions[0];
    _lastFunc1 = loco.functions[1];
  }

  // 7. Gleisspannungs-Indikator
  if (trackPower != _lastTrackPower || fullRedraw) {
    _gfx->setTextSize(1);
    if (!trackPower) {
      _gfx->setTextColor(COLOR_RED, COLOR_BG);
      _gfx->setCursor(75, 196);
      _gfx->print("GLEIS STROM AUS");
    } else {
      _gfx->setTextColor(COLOR_BG, COLOR_BG);
      _gfx->setCursor(75, 196);
      _gfx->print("               ");
    }
    _lastTrackPower = trackPower;
  }
}

void DisplayUI::renderFunctionScreen(const UiLoco &loco, uint8_t selectedFunc) {
  _gfx->fillScreen(COLOR_BG);

  // Äußerer Zierring
  _gfx->drawCircle(120, 120, 114, COLOR_ACCENT);

  // Header
  _gfx->setTextColor(COLOR_TEXT_WHITE);
  _gfx->setTextSize(1);
  _gfx->setCursor(70, 22);
  _gfx->print("FUNKTIONEN");

  _gfx->setTextColor(COLOR_ACCENT);
  _gfx->setCursor(65, 34);
  _gfx->printf("%s (#%d)", loco.name, loco.dccAddress);

  // Standard Funktionsbeschriftungen
  const char* funcNames[12] = {
    "F0: Spitzensignal",
    "F1: Motorsound",
    "F2: Horn / Pfeife",
    "F3: Rangiergang",
    "F4: Bahnhofsansage",
    "F5: Luefter / Aux1",
    "F6: Schaffnerpfiff",
    "F7: Bremsenquietschen",
    "F8: Sound Mute",
    "F9: Fuehrerstandslicht",
    "F10: Fernlicht",
    "F11: Kupplung"
  };

  // Anzeige von 5 sichtbaren Einträgen (Scrollbereich rund um selectedFunc)
  int startIdx = (int)selectedFunc - 2;
  if (startIdx < 0) startIdx = 0;
  if (startIdx > 7) startIdx = 7;

  int y = 55;
  for (int i = startIdx; i < startIdx + 5 && i < 12; i++) {
    bool isSelected = (i == selectedFunc);
    bool isActive = loco.functions[i];

    if (isSelected) {
      _gfx->fillRoundRect(30, y - 2, 180, 22, 5, COLOR_CARD);
      _gfx->drawRoundRect(30, y - 2, 180, 22, 5, COLOR_ACCENT);
    }

    _gfx->setTextSize(1);
    if (isSelected) {
      _gfx->setTextColor(COLOR_TEXT_WHITE);
    } else {
      _gfx->setTextColor(COLOR_TEXT_MUTED);
    }
    _gfx->setCursor(40, y + 5);
    _gfx->print(funcNames[i]);

    // Status Badge rechts (AN / AUS)
    if (isActive) {
      _gfx->setTextColor(COLOR_GREEN);
      _gfx->setCursor(180, y + 5);
      _gfx->print("AN");
    } else {
      _gfx->setTextColor(COLOR_DARK_ARC);
      _gfx->setCursor(180, y + 5);
      _gfx->print("--");
    }

    y += 25;
  }

  // Hinweistext unten
  _gfx->setTextColor(COLOR_TEXT_MUTED);
  _gfx->setTextSize(1);
  _gfx->setCursor(48, 195);
  _gfx->print("Druecken: An/Aus");
  _gfx->setCursor(55, 207);
  _gfx->print("Touch: Zurueck");
}

void DisplayUI::renderLocoSelectScreen(const UiLoco &loco, uint8_t currentIdx, uint8_t totalLocos) {
  _gfx->fillScreen(COLOR_BG);

  // Runde Rahmenverzierung
  _gfx->drawCircle(120, 120, 114, COLOR_ACCENT);

  // Titel
  _gfx->setTextColor(COLOR_TEXT_MUTED);
  _gfx->setTextSize(1);
  _gfx->setCursor(75, 30);
  _gfx->printf("LOK %d VON %d", currentIdx + 1, totalLocos);

  // Lokkarte in der Mitte
  _gfx->fillRoundRect(30, 55, 180, 120, 10, COLOR_CARD);
  _gfx->drawRoundRect(30, 55, 180, 120, 10, COLOR_ACCENT);

  // Lok-Name groß
  _gfx->setTextColor(COLOR_TEXT_WHITE);
  _gfx->setTextSize(2);
  int nameLen = strlen(loco.name);
  int nameX = 120 - (nameLen * 6);
  if (nameX < 35) nameX = 35;
  _gfx->setCursor(nameX, 75);
  _gfx->print(loco.name);

  // DCC Adresse
  _gfx->setTextSize(2);
  _gfx->setTextColor(COLOR_ACCENT);
  _gfx->setCursor(65, 105);
  _gfx->printf("DCC #%d", loco.dccAddress);

  // Zugtyp / Info
  _gfx->setTextSize(1);
  _gfx->setTextColor(COLOR_TEXT_MUTED);
  _gfx->setCursor(60, 135);
  _gfx->printf("Typ: %s", loco.trainType);

  // Swipe Pfeile unten
  _gfx->setTextColor(COLOR_GREEN);
  _gfx->setTextSize(1);
  _gfx->setCursor(45, 192);
  _gfx->print("<< SWIPEN >>");
  _gfx->setTextColor(COLOR_TEXT_MUTED);
  _gfx->setCursor(50, 208);
  _gfx->print("Klick = Uebernehmen");
}
