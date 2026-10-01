#include "cst816_touch.h"

CST816Touch::CST816Touch(int sdaPin, int sclPin, int rstPin, int intPin, uint8_t i2cAddr)
  : _sda(sdaPin), _scl(sclPin), _rst(rstPin), _int(intPin), _addr(i2cAddr) {}

bool CST816Touch::begin() {
  if (_rst >= 0) {
    pinMode(_rst, OUTPUT);
    digitalWrite(_rst, LOW);
    delay(10);
    digitalWrite(_rst, HIGH);
    delay(50);
  }

  if (_int >= 0) {
    pinMode(_int, INPUT);
  }

  Wire.begin(_sda, _scl, 400000);

  // Kurzer Check ob Chip auf I2C antwortet
  Wire.beginTransmission(_addr);
  return (Wire.endTransmission() == 0);
}

bool CST816Touch::read(TouchData &data) {
  data.isTouched = false;
  data.gesture = GESTURE_NONE;
  data.x = 0;
  data.y = 0;

  // Wenn Interrupt-Pin definiert und nicht aktiv, keine Berührung
  if (_int >= 0 && digitalRead(_int) == HIGH) {
    return false;
  }

  Wire.beginTransmission(_addr);
  Wire.write(0x01); // Ab Register 0x01 lesen (Gesten & Koordinaten)
  if (Wire.endTransmission() != 0) {
    return false;
  }

  uint8_t count = Wire.requestFrom((uint8_t)_addr, (uint8_t)6);
  if (count < 6) {
    return false;
  }

  uint8_t rawGesture = Wire.read(); // Reg 0x01: Geste
  uint8_t points     = Wire.read(); // Reg 0x02: Fingeranzahl
  uint8_t xHigh      = Wire.read(); // Reg 0x03: X High (4 bit)
  uint8_t xLow       = Wire.read(); // Reg 0x04: X Low (8 bit)
  uint8_t yHigh      = Wire.read(); // Reg 0x05: Y High (4 bit)
  uint8_t yLow       = Wire.read(); // Reg 0x06: Y Low (8 bit)

  if (points > 0 || rawGesture != 0) {
    data.isTouched = true;
    data.gesture = (TouchGesture)rawGesture;
    data.x = ((xHigh & 0x0F) << 8) | xLow;
    data.y = ((yHigh & 0x0F) << 8) | yLow;

    // Geste im Controller zurücksetzen, damit kein Dauerfeuer entsteht
    if (rawGesture != 0) {
      Wire.beginTransmission(_addr);
      Wire.write(0x01);
      Wire.write(0x00);
      Wire.endTransmission();
    }
    return true;
  }

  return false;
}
