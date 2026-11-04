#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// =============================================================================
// 1. WLAN & Zentrale Konfiguration (STANDALONE MODUS)
// =============================================================================
// Eigene Werte gehoeren in config.local.h (wird nicht ins Git uebernommen).
// Alles, was dort nicht steht, nimmt die Standardwerte unten.
#define CS_PROTOCOL_DCCEX   1    // DCC-EX, TCP Port 2560
#define CS_PROTOCOL_Z21     2    // Roco Z21 / z21 start, UDP Port 21105

#if __has_include("config.local.h")
  #include "config.local.h"
#endif

#ifndef WIFI_SSID
  #define WIFI_SSID           "DEIN_WLAN_NAME"
#endif
#ifndef WIFI_PASSWORD
  #define WIFI_PASSWORD       "DEIN_WLAN_PASSWORT"
#endif

// Welche Zentrale? In config.local.h z. B.: #define CS_PROTOCOL CS_PROTOCOL_Z21
#ifndef CS_PROTOCOL
  #define CS_PROTOCOL         CS_PROTOCOL_DCCEX
#endif

// IP-Adresse deiner DCC-EX Zentrale (Mega / ESP32)
#ifndef DCC_EX_HOST
  #define DCC_EX_HOST         "192.168.4.1"
#endif
#ifndef DCC_EX_PORT
  #define DCC_EX_PORT         2560
#endif

// IP-Adresse deiner Z21 (Werkseinstellung 192.168.0.111)
#ifndef Z21_HOST
  #define Z21_HOST            "192.168.0.111"
#endif
#ifndef Z21_PORT
  #define Z21_PORT            21105
#endif

#if CS_PROTOCOL == CS_PROTOCOL_Z21
  #define CS_NAME             "Z21"
  #define CS_HOST             Z21_HOST
#else
  #define CS_NAME             "DCC-EX"
  #define CS_HOST             DCC_EX_HOST
#endif

// =============================================================================
// 2. Hardware Pinout (Elecrow CrowPanel 1.28" ESP32-S3 Rotary Display)
// =============================================================================

// --- LCD Stromversorgungs-Pins (Power Rails) ---
#define POWER_LCD_PIN       1    // Aktiviert 3.3V für das LCD Display (Active High)
#define POWER_EXT_PIN       2    // Aktiviert 5V für externe Ports (Active High)

// --- 1.28" Runder GC9A01 SPI Display ---
#define TFT_SCK             10
#define TFT_MOSI            11
#define TFT_DC              3
#define TFT_CS              9
#define TFT_RST             14
#define TFT_BL              46   // Hintergrundbeleuchtung (PWM-fähig)

#define SCREEN_WIDTH        240
#define SCREEN_HEIGHT       240

// --- Drehregler (Rotary Encoder) & Drucktaster ---
#define ROTARY_PIN_A        45
#define ROTARY_PIN_B        42
#define ROTARY_PIN_BTN      41   // Druckknopf im Drehregler (Active LOW)

// --- Kapazitiver Touchscreen (CST816D I2C) ---
#define TOUCH_SDA           6
#define TOUCH_SCL           7
#define TOUCH_INT           5
#define TOUCH_RST           13
#define TOUCH_I2C_ADDR      0x15

// --- 5x WS2812 RGB LED Ring ---
#define LED_PIN             48
#define LED_COUNT           5

// =============================================================================
// 3. Steuerungs- & Regelparameter
// =============================================================================
#define SPEED_MAX           128  // DCC 128 Fahrstufen (Standard DCC)
#define DEFAULT_SPEED_STEP_MODE 2 // 0=Fein (+2), 1=Normal (+4), 2=Schnell (+8), 3=Dynamisch (Auto)
#define DEFAULT_LED_BRIGHT_MODE 2 // 0=Aus (0), 1=Gedimmt (15), 2=Normal (35), 3=Hell (80)
#define LONG_PRESS_MS       800  // Druckdauer für Not-Aus (> 800ms)
#define DOUBLE_CLICK_MS     350  // Max Zeitfenster für Doppelklick

#endif // CONFIG_H
