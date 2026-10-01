#ifndef CST816_TOUCH_H
#define CST816_TOUCH_H

#include <Arduino.h>
#include <Wire.h>

enum TouchGesture {
  GESTURE_NONE        = 0x00,
  GESTURE_SLIDE_UP    = 0x01,
  GESTURE_SLIDE_DOWN  = 0x02,
  GESTURE_SLIDE_LEFT  = 0x03,  // Swipe nach links
  GESTURE_SLIDE_RIGHT = 0x04,  // Swipe nach rechts
  GESTURE_CLICK       = 0x05,  // Kurzer Tap
  GESTURE_DOUBLE_CLICK= 0x0B,  // Doppel-Tap
  GESTURE_LONG_PRESS  = 0x0C   // Langer Touch
};

struct TouchData {
  bool isTouched;
  TouchGesture gesture;
  uint16_t x;
  uint16_t y;
};

class CST816Touch {
public:
  CST816Touch(int sdaPin, int sclPin, int rstPin, int intPin, uint8_t i2cAddr = 0x15);
  bool begin();
  bool read(TouchData &data);

private:
  int _sda;
  int _scl;
  int _rst;
  int _int;
  uint8_t _addr;
};

#endif // CST816_TOUCH_H
