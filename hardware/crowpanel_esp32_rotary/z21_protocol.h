/**
 * TrainMaster - Roco Z21 LAN-Protokoll (Client-Seite)
 * =============================================================================
 * Reines C++ ohne Arduino-Abhaengigkeit: dieselbe Datei laeuft auf dem ESP32
 * (CrowPanel Handregler) und im PC-Test (test/z21_host_knob.cpp).
 *
 * Grundlage: "Z21 LAN Protokoll Spezifikation" (Roco/Fleischmann, V1.13).
 *   - UDP Port 21105, Paket = DataLen(2, LE) + Header(2, LE) + Daten
 *   - X-Bus-Befehle unter Header 0x40, letztes Byte = XOR ueber die X-Bytes
 *   - Ein Datagramm darf mehrere Pakete hintereinander enthalten
 *   - Client wird nach 60 s ohne Kommunikation von der Z21 abgemeldet
 */
#ifndef Z21_PROTOCOL_H
#define Z21_PROTOCOL_H

#include <stdint.h>
#include <stddef.h>

namespace z21 {

static const uint16_t DEFAULT_PORT = 21105;

// LAN_SET_BROADCASTFLAGS: Fahren & Schalten (Gleisspannung, Not-Halt, Lok-Infos)
static const uint32_t BC_DRIVING_SWITCHING = 0x00000001UL;

// Bits im Zentralen-Status (LAN_X_STATUS_CHANGED)
static const uint8_t CS_EMERGENCY_STOP     = 0x01;
static const uint8_t CS_TRACK_VOLTAGE_OFF  = 0x02;
static const uint8_t CS_SHORT_CIRCUIT      = 0x04;
static const uint8_t CS_PROGRAMMING_MODE   = 0x20;

// Groesster Puffer, den ein Builder beschreibt
static const size_t MAX_TX_PACKET = 16;

// -----------------------------------------------------------------------------
// Kodierung
// -----------------------------------------------------------------------------
// Lokadresse: MSB = (Adr >> 8) & 0x3F, ab Adresse 128 zusaetzlich | 0xC0
void     encodeAddress(uint16_t address, uint8_t &msb, uint8_t &lsb);
uint16_t decodeAddress(uint8_t msb, uint8_t lsb);

// 128 Fahrstufen: step 0..126 (groesser wird auf 126 begrenzt)
// Ergebnis RVVVVVVV: 0 = Halt, 2..127 = Fahrstufe 1..126, Bit 7 = vorwaerts
uint8_t  encodeSpeed128(uint8_t step, bool forward);

// -----------------------------------------------------------------------------
// Pakete bauen (Rueckgabe: Laenge in Byte, buf muss MAX_TX_PACKET gross sein)
// -----------------------------------------------------------------------------
size_t buildGetSerialNumber(uint8_t *buf);                         // LAN_GET_SERIAL_NUMBER
size_t buildLogoff(uint8_t *buf);                                  // LAN_LOGOFF
size_t buildSetBroadcastFlags(uint8_t *buf, uint32_t flags);       // LAN_SET_BROADCASTFLAGS
size_t buildGetStatus(uint8_t *buf);                               // LAN_X_GET_STATUS
size_t buildSetTrackPower(uint8_t *buf, bool on);                  // LAN_X_SET_TRACK_POWER_ON/OFF
size_t buildSetStop(uint8_t *buf);                                 // LAN_X_SET_STOP
size_t buildGetLocoInfo(uint8_t *buf, uint16_t address);           // LAN_X_GET_LOCO_INFO
size_t buildSetLocoDrive(uint8_t *buf, uint16_t address, uint8_t step, bool forward); // LAN_X_SET_LOCO_DRIVE (128)
size_t buildSetLocoFunction(uint8_t *buf, uint16_t address, uint8_t fn, bool on);     // LAN_X_SET_LOCO_FUNCTION

// -----------------------------------------------------------------------------
// Empfang
// -----------------------------------------------------------------------------
enum EventType : uint8_t {
  EV_SERIAL_NUMBER,     // serial
  EV_TRACK_POWER_ON,    // LAN_X_BC_TRACK_POWER_ON
  EV_TRACK_POWER_OFF,   // LAN_X_BC_TRACK_POWER_OFF
  EV_SHORT_CIRCUIT,     // LAN_X_BC_TRACK_SHORT_CIRCUIT
  EV_PROGRAMMING_MODE,  // LAN_X_BC_PROGRAMMING_MODE
  EV_STOPPED,           // LAN_X_BC_STOPPED (Not-Halt)
  EV_STATUS,            // LAN_X_STATUS_CHANGED: status
  EV_LOCO_INFO,         // LAN_X_LOCO_INFO
  EV_UNKNOWN_COMMAND,   // LAN_X_UNKNOWN_COMMAND
  EV_OTHER,             // gueltiges Paket ohne Auswertung (zaehlt als Lebenszeichen)
  // nur von Session erzeugt:
  EV_CONNECTED,
  EV_DISCONNECTED
};

struct Event {
  EventType type;
  uint16_t  header;      // LAN-Header des Pakets
  uint32_t  serial;      // EV_SERIAL_NUMBER
  uint8_t   status;      // EV_STATUS
  // EV_LOCO_INFO
  uint16_t  address;
  uint8_t   speedSteps;  // 14, 28 oder 128 (Format der Lok in der Zentrale)
  uint8_t   speedRaw;    // Fahrstufe im Format der Lok (ohne Richtungsbit)
  uint8_t   speed126;    // auf 0..126 umgerechnet (Not-Halt = 0)
  bool      locoEStop;   // Lok steht per Not-Halt
  bool      forward;
  bool      busy;        // Lok wird von anderem X-Bus-Geraet gesteuert
  uint32_t  functions;   // Bit n = Fn (F0..F31)
};

typedef void (*EventCallback)(const Event &ev, void *ctx);

struct ParseStats {
  uint16_t packets;   // gueltige Pakete
  uint16_t rejected;  // verworfen (Laenge/XOR falsch, abgeschnitten)
};

// Wertet ein komplettes UDP-Datagramm aus (auch mehrere Pakete).
ParseStats parseDatagram(const uint8_t *data, size_t len, EventCallback cb, void *ctx);

// -----------------------------------------------------------------------------
// Sitzung: Anmeldung, Lebenszeichen, Verbindungsueberwachung, Lok-Abo
// -----------------------------------------------------------------------------
typedef void (*SendFn)(const uint8_t *data, size_t len, void *ctx);

struct SessionConfig {
  uint32_t pollIntervalMs;   // Abstand LAN_X_GET_STATUS
  uint32_t timeoutMs;        // ohne gueltige Antwort -> getrennt
  uint8_t  refreshEveryPolls;// alle n Polls Broadcast-Flags + Lok-Abo erneuern
  uint32_t broadcastFlags;
};

SessionConfig defaultSessionConfig(); // 3000 ms / 8000 ms / 10 / BC_DRIVING_SWITCHING

class Session {
public:
  Session(SendFn send, void *sendCtx, EventCallback onEvent, void *eventCtx,
          const SessionConfig &cfg = defaultSessionConfig());

  void begin(uint32_t nowMs);                 // Zentrale suchen
  void tick(uint32_t nowMs);                  // regelmaessig aufrufen
  void onDatagram(const uint8_t *data, size_t len, uint32_t nowMs);

  void selectLoco(uint16_t address);          // abonnieren + Zustand holen
  void drive(uint16_t address, uint8_t step126, bool forward);
  void setFunction(uint16_t address, uint8_t fn, bool on);
  void setTrackPower(bool on);
  void emergencyStop();
  void logoff();

  bool       isConnected() const { return _connected; }
  uint32_t   serialNumber() const { return _serial; }
  uint16_t   selectedLoco() const { return _selectedLoco; }
  ParseStats totalStats() const { return _stats; }

private:
  void sendBuf(size_t len);
  void registerClient();
  static void parseCb(const Event &ev, void *ctx);

  SendFn        _send;
  void         *_sendCtx;
  EventCallback _onEvent;
  void         *_eventCtx;
  SessionConfig _cfg;

  uint8_t   _tx[MAX_TX_PACKET];
  bool      _started;
  bool      _connected;
  uint32_t  _lastRx;
  uint32_t  _lastPoll;
  uint8_t   _pollCount;
  uint32_t  _serial;
  uint16_t  _selectedLoco;
  ParseStats _stats;
};

} // namespace z21

#endif // Z21_PROTOCOL_H
