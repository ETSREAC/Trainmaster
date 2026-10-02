#include "led_effects.h"

LedController::LedController(uint8_t pin, uint8_t count)
  : _strip(count, pin, NEO_GRB + NEO_KHZ800),
    _brightness(35),
    _mode(LED_BOOT_CONNECTING),
    _speed(0),
    _isFwd(true),
    _trackPower(true),
    _emergencyStop(false),
    _lastUpdate(0),
    _animStep(0),
    _flashUntil(0),
    _flashColor(0xFFFFFF) {}

void LedController::begin() {
  _strip.begin();
  _strip.setBrightness(_brightness); // Angenehme, blendfreie Helligkeit (35)
  _strip.show();
}

void LedController::setBrightness(uint8_t brightness) {
  _brightness = brightness;
  _strip.setBrightness(_brightness);
  _strip.show();
}

uint8_t LedController::getBrightness() const {
  return _brightness;
}

void LedController::setMode(LedMode mode) {
  _mode = mode;
}

void LedController::updateDriveState(uint8_t speed, bool isFwd, bool trackPower, bool emergencyStop) {
  _speed = speed;
  _isFwd = isFwd;
  _trackPower = trackPower;
  _emergencyStop = emergencyStop;

  if (_emergencyStop) {
    _mode = LED_EMERGENCY_STOP;
  } else if (!_trackPower) {
    _mode = LED_TRACK_POWER_OFF;
  } else {
    _mode = LED_DRIVE_GAUGE;
  }
}

void LedController::triggerFlash(uint32_t color, uint16_t durationMs) {
  _flashColor = color;
  _flashUntil = millis() + durationMs;
}

void LedController::update() {
  unsigned long now = millis();

  // 1. Priorität: Funktions-Flash (Horn, Sound, Licht)
  if (now < _flashUntil) {
    for (int i = 0; i < LED_COUNT; i++) {
      _strip.setPixelColor(i, _flashColor);
    }
    _strip.show();
    return;
  }

  // 2. Regelmäßige Animation (alle 30ms für flüssige 30+ FPS)
  if (now - _lastUpdate < 30) return;
  _lastUpdate = now;
  _animStep++;

  switch (_mode) {
    case LED_BOOT_CONNECTING:
      renderBootConnecting();
      break;

    case LED_WIFI_SUCCESS:
      for (int i = 0; i < LED_COUNT; i++) {
        _strip.setPixelColor(i, _strip.Color(0, 255, 60));
      }
      _strip.show();
      break;

    case LED_EMERGENCY_STOP:
    case LED_TRACK_POWER_OFF:
      renderEmergencyStop();
      break;

    case LED_DRIVE_GAUGE:
    default:
      renderDriveGauge();
      break;
  }
}

void LedController::renderBootConnecting() {
  // Rotierendes blau/cyan Lauflicht
  uint8_t activeLed = (_animStep / 4) % LED_COUNT;
  for (int i = 0; i < LED_COUNT; i++) {
    if (i == activeLed) {
      _strip.setPixelColor(i, _strip.Color(0, 180, 255));
    } else {
      _strip.setPixelColor(i, _strip.Color(0, 10, 40));
    }
  }
  _strip.show();
}

void LedController::renderEmergencyStop() {
  // Sanft pulsierendes Rot (Breathing)
  float pulse = (sin(_animStep * 0.15f) + 1.0f) * 0.5f; // 0.0 .. 1.0
  uint8_t red = 40 + (uint8_t)(pulse * 215);
  for (int i = 0; i < LED_COUNT; i++) {
    _strip.setPixelColor(i, _strip.Color(red, 0, 0));
  }
  _strip.show();
}

void LedController::renderDriveGauge() {
  if (_speed == 0) {
    // Lok steht: Mittlere LED glimmt dezent in Richtungsfarbe
    // Vorwärts = Warmweiß/Zartcyan, Rückwärts = Zartrot/Bernstein
    for (int i = 0; i < LED_COUNT; i++) {
      _strip.setPixelColor(i, 0);
    }
    if (_isFwd) {
      _strip.setPixelColor(2, _strip.Color(40, 60, 50)); // Zentrums-Ruhelicht
    } else {
      _strip.setPixelColor(2, _strip.Color(70, 20, 0));  // Bernstein Rückwärts
    }
  } else {
    // Tacho-Balken von LED 0 bis 4 (5 Stufen)
    // Speed 1..128
    // LED 0: Speed > 0   (Cyan / Türkis)
    // LED 1: Speed > 25  (Grün)
    // LED 2: Speed > 55  (Gelb)
    // LED 3: Speed > 85  (Orange)
    // LED 4: Speed > 110 (Rot)
    
    uint32_t colors[5] = {
      _strip.Color(0, 180, 255),  // 1: Cyan (Anfahren)
      _strip.Color(0, 255, 60),   // 2: Grün (Reisegeschwindigkeit)
      _strip.Color(255, 200, 0),  // 3: Gelb
      _strip.Color(255, 100, 0),  // 4: Orange
      _strip.Color(255, 10, 10)   // 5: Maximal / Rot
    };

    uint8_t thresholds[5] = { 1, 26, 52, 80, 110 };

    for (int i = 0; i < LED_COUNT; i++) {
      if (_speed >= thresholds[i]) {
        _strip.setPixelColor(i, colors[i]);
      } else {
        _strip.setPixelColor(i, _strip.Color(3, 5, 8)); // Dunkles Glühen
      }
    }
  }
  _strip.show();
}
