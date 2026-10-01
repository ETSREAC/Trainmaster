#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// =============================================================================
// 1. WLAN & DCC-EX Zentrale Konfiguration (STANDALONE MODUS)
// =============================================================================
#define WIFI_SSID           "DEIN_WLAN_NAME"
#define WIFI_PASSWORD       "DEIN_WLAN_PASSWORT"

// IP-Adresse deiner DCC-EX Zentrale (Mega / ESP32)
#define DCC_EX_HOST         "192.168.178.xxx"
#define DCC_EX_PORT         2560

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
#define SPEED_STEP          2    // Fahrstufen pro Encoder-Raste
#define LONG_PRESS_MS       800  // Druckdauer für Not-Aus (> 800ms)
#define DOUBLE_CLICK_MS     350  // Max Zeitfenster für Doppelklick

#endif // CONFIG_H
