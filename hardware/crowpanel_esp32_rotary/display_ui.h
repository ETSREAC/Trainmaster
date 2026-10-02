#ifndef DISPLAY_UI_H
#define DISPLAY_UI_H

#include <Arduino.h>
#include <Arduino_GFX_Library.h>
#include "config.h"

enum UiScreen {
  SCREEN_BOOT,
  SCREEN_DRIVE,
  SCREEN_FUNCTIONS,
  SCREEN_LOCO_SELECT
};

struct UiLoco {
  char id[32];
  char name[32];
  uint16_t dccAddress;
  uint8_t speed;
  bool isFwd;
  bool functions[29];
  char trainType[16];
};

struct DeviceSettings {
  uint8_t ledBrightnessLevel; // 0=Aus, 1=Gedimmt(15), 2=Normal(35), 3=Hell(80)
  uint8_t speedStepMode;      // 0=Fein(+2), 1=Mittel(+4), 2=Schnell(+8), 3=Dynamisch(Auto)
};

class DisplayUI {
public:
  DisplayUI();
  bool begin();
  void setBacklight(uint8_t brightness);

  void showBootStatus(const char* statusText, const char* detailText = "");
  void showEmergencyStop(bool active);
  
  void setScreen(UiScreen screen);
  UiScreen getScreen() const { return _currentScreen; }

  void renderDriveScreen(const UiLoco &loco, bool trackPower, bool emergencyStop);
  void renderFunctionScreen(const UiLoco &loco, uint8_t selectedFunc, const DeviceSettings &settings);
  void renderLocoSelectScreen(const UiLoco &loco, uint8_t currentIdx, uint8_t totalLocos);
  void resetDriveCache();

private:
  Arduino_DataBus *_bus;
  Arduino_GFX *_gfx;
  UiScreen _currentScreen;
  uint8_t _brightness;

  // Cache für flackerfreie Delta-Aktualisierung
  int16_t _lastSpeed;
  bool _lastFwd;
  bool _lastTrackPower;
  bool _lastEmergencyStop;
  bool _lastFunc0;
  bool _lastFunc1;
  char _lastLocoId[32];

  // Hilfsfunktionen für rundes Display (240x240)
  void drawSpeedArc(uint8_t speed, uint8_t maxSpeed);
  uint16_t getSpeedColor(uint8_t speed);
};

#endif // DISPLAY_UI_H
