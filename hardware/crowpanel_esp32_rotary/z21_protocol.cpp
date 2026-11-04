/**
 * TrainMaster - Roco Z21 LAN-Protokoll (Client-Seite), Implementierung
 * Siehe z21_protocol.h. Keine Arduino-Abhaengigkeit.
 */
#include "z21_protocol.h"
#include <string.h>

namespace z21 {

static const uint16_t HDR_SERIAL_NUMBER   = 0x0010;
static const uint16_t HDR_LOGOFF          = 0x0030;
static const uint16_t HDR_X_BUS           = 0x0040;
static const uint16_t HDR_SET_BC_FLAGS    = 0x0050;

// -----------------------------------------------------------------------------
// Kodierung
// -----------------------------------------------------------------------------
void encodeAddress(uint16_t address, uint8_t &msb, uint8_t &lsb) {
  msb = (uint8_t)((address >> 8) & 0x3F);
  if (address >= 128) msb |= 0xC0;
  lsb = (uint8_t)(address & 0xFF);
}

uint16_t decodeAddress(uint8_t msb, uint8_t lsb) {
  return (uint16_t)(((uint16_t)(msb & 0x3F) << 8) | lsb);
}

uint8_t encodeSpeed128(uint8_t step, bool forward) {
  if (step > 126) step = 126;
  uint8_t v = (step == 0) ? 0 : (uint8_t)(step + 1); // 1 waere Not-Halt
  return (uint8_t)(v | (forward ? 0x80 : 0x00));
}

// -----------------------------------------------------------------------------
// Pakete bauen
// -----------------------------------------------------------------------------
static size_t putHeader(uint8_t *buf, uint16_t len, uint16_t header) {
  buf[0] = (uint8_t)(len & 0xFF);
  buf[1] = (uint8_t)(len >> 8);
  buf[2] = (uint8_t)(header & 0xFF);
  buf[3] = (uint8_t)(header >> 8);
  return 4;
}

// X-Bus-Paket: xbytes = X-Header + DB..., XOR wird angehaengt
static size_t buildX(uint8_t *buf, const uint8_t *xbytes, size_t n) {
  size_t len = 4 + n + 1;
  putHeader(buf, (uint16_t)len, HDR_X_BUS);
  uint8_t x = 0;
  for (size_t i = 0; i < n; i++) {
    buf[4 + i] = xbytes[i];
    x ^= xbytes[i];
  }
  buf[4 + n] = x;
  return len;
}

size_t buildGetSerialNumber(uint8_t *buf) { return putHeader(buf, 4, HDR_SERIAL_NUMBER); }
size_t buildLogoff(uint8_t *buf)          { return putHeader(buf, 4, HDR_LOGOFF); }

size_t buildSetBroadcastFlags(uint8_t *buf, uint32_t flags) {
  putHeader(buf, 8, HDR_SET_BC_FLAGS);
  buf[4] = (uint8_t)(flags & 0xFF);
  buf[5] = (uint8_t)((flags >> 8) & 0xFF);
  buf[6] = (uint8_t)((flags >> 16) & 0xFF);
  buf[7] = (uint8_t)((flags >> 24) & 0xFF);
  return 8;
}

size_t buildGetStatus(uint8_t *buf) {
  const uint8_t x[] = {0x21, 0x24};
  return buildX(buf, x, sizeof(x));
}

size_t buildSetTrackPower(uint8_t *buf, bool on) {
  const uint8_t x[] = {0x21, (uint8_t)(on ? 0x81 : 0x80)};
  return buildX(buf, x, sizeof(x));
}

size_t buildSetStop(uint8_t *buf) {
  const uint8_t x[] = {0x80};
  return buildX(buf, x, sizeof(x));
}

size_t buildGetLocoInfo(uint8_t *buf, uint16_t address) {
  uint8_t msb, lsb;
  encodeAddress(address, msb, lsb);
  const uint8_t x[] = {0xE3, 0xF0, msb, lsb};
  return buildX(buf, x, sizeof(x));
}

size_t buildSetLocoDrive(uint8_t *buf, uint16_t address, uint8_t step, bool forward) {
  uint8_t msb, lsb;
  encodeAddress(address, msb, lsb);
  const uint8_t x[] = {0xE4, 0x13, msb, lsb, encodeSpeed128(step, forward)};
  return buildX(buf, x, sizeof(x));
}

size_t buildSetLocoFunction(uint8_t *buf, uint16_t address, uint8_t fn, bool on) {
  uint8_t msb, lsb;
  encodeAddress(address, msb, lsb);
  // TTNNNNNN: TT 00 = aus, 01 = ein; NNNNNN = Funktionsnummer
  const uint8_t db3 = (uint8_t)((on ? 0x40 : 0x00) | (fn & 0x3F));
  const uint8_t x[] = {0xE4, 0xF8, msb, lsb, db3};
  return buildX(buf, x, sizeof(x));
}

// -----------------------------------------------------------------------------
// Empfang
// -----------------------------------------------------------------------------
static void decodeSpeed(uint8_t kkk, uint8_t db3, Event &ev) {
  ev.forward = (db3 & 0x80) != 0;
  ev.locoEStop = false;
  ev.speed126 = 0;

  if (kkk == 4) {               // 128 Fahrstufen
    ev.speedSteps = 128;
    uint8_t v = db3 & 0x7F;
    ev.speedRaw = v;
    if (v == 1) ev.locoEStop = true;
    else if (v >= 2) ev.speed126 = (uint8_t)(v - 1);
  } else if (kkk == 2) {        // 28 Fahrstufen (NMRA: Bit 4 = Zwischenstufe)
    ev.speedSteps = 28;
    uint8_t v = db3 & 0x1F;
    uint8_t lo = v & 0x0F;
    uint8_t step = 0;
    if (lo == 1) ev.locoEStop = true;
    else if (lo >= 2) step = (uint8_t)((lo - 1) * 2 - 1 + ((v & 0x10) ? 1 : 0));
    ev.speedRaw = step;
    ev.speed126 = (uint8_t)((step * 126u + 14u) / 28u);
  } else {                      // 14 Fahrstufen
    ev.speedSteps = 14;
    uint8_t v = db3 & 0x0F;
    uint8_t step = 0;
    if (v == 1) ev.locoEStop = true;
    else if (v >= 2) step = (uint8_t)(v - 1);
    ev.speedRaw = step;
    ev.speed126 = (uint8_t)(step * 9u);
  }
}

// p zeigt auf ein vollstaendiges Paket der Laenge len (bereits laengengeprueft)
static bool handlePacket(const uint8_t *p, size_t len, EventCallback cb, void *ctx) {
  const uint16_t header = (uint16_t)(p[2] | (p[3] << 8));
  Event ev;
  memset(&ev, 0, sizeof(ev));
  ev.header = header;
  ev.type = EV_OTHER;

  if (header == HDR_X_BUS) {
    if (len < 6) return false;                   // mind. X-Header + XOR
    uint8_t x = 0;
    for (size_t i = 4; i < len - 1; i++) x ^= p[i];
    if (x != p[len - 1]) return false;           // Pruefsumme falsch

    const uint8_t xh = p[4];
    const size_t  n  = len - 5;                  // X-Bytes ohne XOR
    const uint8_t db0 = n > 1 ? p[5] : 0;

    if (xh == 0x61 && n >= 2) {
      if (db0 == 0x00)      ev.type = EV_TRACK_POWER_OFF;
      else if (db0 == 0x01) ev.type = EV_TRACK_POWER_ON;
      else if (db0 == 0x02) ev.type = EV_PROGRAMMING_MODE;
      else if (db0 == 0x08) ev.type = EV_SHORT_CIRCUIT;
      else if (db0 == 0x82) ev.type = EV_UNKNOWN_COMMAND;
    } else if (xh == 0x62 && n >= 3 && db0 == 0x22) {
      ev.type = EV_STATUS;
      ev.status = p[6];
    } else if (xh == 0x81 && n >= 2 && db0 == 0x00) {
      ev.type = EV_STOPPED;
    } else if (xh == 0xEF && n >= 9) {           // EF + DB0..DB7 (DB8 optional)
      ev.type = EV_LOCO_INFO;
      ev.address = decodeAddress(p[5], p[6]);
      const uint8_t db2 = p[7];
      ev.busy = (db2 & 0x08) != 0;
      decodeSpeed((uint8_t)(db2 & 0x07), p[8], ev);
      const uint8_t db4 = p[9];
      uint32_t f = 0;
      if (db4 & 0x10) f |= 1UL << 0;             // L = F0
      f |= (uint32_t)(db4 & 0x0F) << 1;          // J,H,G,F = F1..F4
      f |= (uint32_t)p[10] << 5;                 // F5..F12
      f |= (uint32_t)p[11] << 13;                // F13..F20
      f |= (uint32_t)p[12] << 21;                // F21..F28
      if (n >= 10) f |= (uint32_t)(p[13] & 0x07) << 29; // F29..F31
      ev.functions = f;
    }
  } else if (header == HDR_SERIAL_NUMBER) {
    if (len < 8) return false;
    ev.type = EV_SERIAL_NUMBER;
    ev.serial = (uint32_t)p[4] | ((uint32_t)p[5] << 8) | ((uint32_t)p[6] << 16) | ((uint32_t)p[7] << 24);
  }

  if (cb) cb(ev, ctx);
  return true;
}

ParseStats parseDatagram(const uint8_t *data, size_t len, EventCallback cb, void *ctx) {
  ParseStats st = {0, 0};
  size_t off = 0;
  while (off + 4 <= len) {
    const uint16_t dlen = (uint16_t)(data[off] | (data[off + 1] << 8));
    if (dlen < 4 || off + dlen > len) {          // kaputt/abgeschnitten: Rest verwerfen
      st.rejected++;
      return st;
    }
    if (handlePacket(data + off, dlen, cb, ctx)) st.packets++;
    else st.rejected++;
    off += dlen;
  }
  if (off < len) st.rejected++;                  // Restbytes < 4
  return st;
}

// -----------------------------------------------------------------------------
// Sitzung
// -----------------------------------------------------------------------------
SessionConfig defaultSessionConfig() {
  SessionConfig c;
  c.pollIntervalMs = 3000;
  c.timeoutMs = 8000;
  c.refreshEveryPolls = 10;
  c.broadcastFlags = BC_DRIVING_SWITCHING;
  return c;
}

Session::Session(SendFn send, void *sendCtx, EventCallback onEvent, void *eventCtx,
                 const SessionConfig &cfg)
  : _send(send), _sendCtx(sendCtx), _onEvent(onEvent), _eventCtx(eventCtx), _cfg(cfg),
    _started(false), _connected(false), _lastRx(0), _lastPoll(0), _pollCount(0),
    _serial(0), _selectedLoco(0) {
  _stats.packets = 0;
  _stats.rejected = 0;
}

void Session::sendBuf(size_t len) {
  if (_send && len > 0) _send(_tx, len, _sendCtx);
}

void Session::registerClient() {
  // Nach (Wieder-)Verbindung: Z21 hat uns evtl. nach 60 s vergessen
  sendBuf(buildSetBroadcastFlags(_tx, _cfg.broadcastFlags));
  if (_selectedLoco) sendBuf(buildGetLocoInfo(_tx, _selectedLoco));
}

void Session::begin(uint32_t nowMs) {
  _started = true;
  _connected = false;
  _lastPoll = nowMs;
  _pollCount = 0;
  sendBuf(buildGetSerialNumber(_tx));
  sendBuf(buildSetBroadcastFlags(_tx, _cfg.broadcastFlags));
  sendBuf(buildGetStatus(_tx));
  if (_selectedLoco) sendBuf(buildGetLocoInfo(_tx, _selectedLoco));
}

void Session::tick(uint32_t nowMs) {
  if (!_started) return;

  if (_connected && (uint32_t)(nowMs - _lastRx) > _cfg.timeoutMs) {
    _connected = false;
    Event ev;
    memset(&ev, 0, sizeof(ev));
    ev.type = EV_DISCONNECTED;
    if (_onEvent) _onEvent(ev, _eventCtx);
  }

  if ((uint32_t)(nowMs - _lastPoll) >= _cfg.pollIntervalMs) {
    _lastPoll = nowMs;
    _pollCount++;
    if (!_connected) sendBuf(buildGetSerialNumber(_tx));
    sendBuf(buildGetStatus(_tx));
    if (_connected && _cfg.refreshEveryPolls && (_pollCount % _cfg.refreshEveryPolls) == 0) {
      registerClient(); // UDP kann Pakete verlieren: Abo regelmaessig erneuern
    }
  }
}

struct ParseCtx { Session *self; uint32_t now; bool any; };

void Session::parseCb(const Event &ev, void *ctx) {
  ParseCtx *pc = static_cast<ParseCtx *>(ctx);
  Session *s = pc->self;
  if (ev.type == EV_SERIAL_NUMBER) s->_serial = ev.serial;
  if (s->_onEvent) s->_onEvent(ev, s->_eventCtx);
}

void Session::onDatagram(const uint8_t *data, size_t len, uint32_t nowMs) {
  // Erst Verbindungsstatus pruefen: gueltiges Paket vorhanden?
  ParseStats probe = parseDatagram(data, len, nullptr, nullptr);
  _stats.rejected += probe.rejected;
  if (probe.packets == 0) return;
  _stats.packets += probe.packets;
  _lastRx = nowMs;

  if (!_connected) {
    _connected = true;
    if (_started) registerClient();
    Event ev;
    memset(&ev, 0, sizeof(ev));
    ev.type = EV_CONNECTED;
    if (_onEvent) _onEvent(ev, _eventCtx);
  }

  ParseCtx pc = {this, nowMs, false};
  parseDatagram(data, len, &Session::parseCb, &pc);
}

void Session::selectLoco(uint16_t address) {
  _selectedLoco = address;
  if (address) sendBuf(buildGetLocoInfo(_tx, address));
}

void Session::drive(uint16_t address, uint8_t step126, bool forward) {
  sendBuf(buildSetLocoDrive(_tx, address, step126, forward));
}

void Session::setFunction(uint16_t address, uint8_t fn, bool on) {
  sendBuf(buildSetLocoFunction(_tx, address, fn, on));
}

void Session::setTrackPower(bool on) { sendBuf(buildSetTrackPower(_tx, on)); }
void Session::emergencyStop()        { sendBuf(buildSetStop(_tx)); }

void Session::logoff() {
  sendBuf(buildLogoff(_tx));
  _connected = false;
  _started = false;
}

} // namespace z21
