#ifndef LED_EFFECTS_H
#define LED_EFFECTS_H

#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#include "config.h"

enum LedMode {
  LED_BOOT_CONNECTING,
  LED_WIFI_SUCCESS,
  LED_EMERGENCY_STOP,
  LED_TRACK_POWER_OFF,
  LED_DRIVE_GAUGE,
  LED_FUNCTION_FLASH
};

class LedController {
public:
  LedController(uint8_t pin = LED_PIN, uint8_t count = LED_COUNT);
  void begin();
  void update();

  void setMode(LedMode mode);
  void updateDriveState(uint8_t speed, bool isFwd, bool trackPower, bool emergencyStop);
  void triggerFlash(uint32_t color = 0xFFFFFF, uint16_t durationMs = 180);

private:
  Adafruit_NeoPixel _strip;
  LedMode _mode;
  uint8_t _speed;
  bool _isFwd;
  bool _trackPower;
  bool _emergencyStop;

  unsigned long _lastUpdate;
  uint16_t _animStep;
  unsigned long _flashUntil;
  uint32_t _flashColor;

  void renderBootConnecting();
  void renderEmergencyStop();
  void renderDriveGauge();
};

#endif // LED_EFFECTS_H
