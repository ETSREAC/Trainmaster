/**
 * PC-Testprogramm: "Knob ohne Display" fuer den Z21-Betrieb.
 *
 * Nutzt unveraendert ../z21_protocol.cpp aus der Firmware; nur UDP-Socket und
 * Uhr kommen vom PC statt vom ESP32. Gesteuert ueber stdin (eine Zeile = ein
 * Befehl), Ausgabe als JSON-Zeilen auf stdout. Wird von
 * scripts/test_crowpanel_z21.mjs gebaut und gegen den Z21-Simulator gefahren.
 *
 * Aufruf: z21_host_knob <host> <port> [pollMs timeoutMs refreshPolls]
 *
 * Befehle:
 *   begin | select A | drive A STEP DIR | fn A N ON | power ON | estop | logoff
 *   build <name> [args]      -> nur Bytes ausgeben (kein Senden)
 *   parsehex <hex>           -> Datagramm parsen, Events + Statistik ausgeben
 *   state | quit
 */
#include "../z21_protocol.h"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <sstream>
#include <vector>

#ifdef _WIN32
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #include <windows.h>
  typedef SOCKET sock_t;
#else
  #include <arpa/inet.h>
  #include <netinet/in.h>
  #include <sys/select.h>
  #include <sys/socket.h>
  #include <unistd.h>
  typedef int sock_t;
#endif

using namespace z21;

static sock_t g_sock;
static sockaddr_in g_dest;

static uint32_t nowMs() {
  using namespace std::chrono;
  return (uint32_t)duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}

static std::string toHex(const uint8_t *d, size_t n) {
  static const char *h = "0123456789abcdef";
  std::string s;
  for (size_t i = 0; i < n; i++) {
    if (i) s += ' ';
    s += h[d[i] >> 4];
    s += h[d[i] & 15];
  }
  return s;
}

static void out(const std::string &json) {
  fputs(json.c_str(), stdout);
  fputc('\n', stdout);
  fflush(stdout);
}

static void udpSend(const uint8_t *data, size_t len, void *) {
  sendto(g_sock, (const char *)data, (int)len, 0, (const sockaddr *)&g_dest, sizeof(g_dest));
  out("{\"ev\":\"tx\",\"hex\":\"" + toHex(data, len) + "\"}");
}

static const char *evName(EventType t) {
  switch (t) {
    case EV_SERIAL_NUMBER: return "serial";
    case EV_TRACK_POWER_ON: return "power_on";
    case EV_TRACK_POWER_OFF: return "power_off";
    case EV_SHORT_CIRCUIT: return "short_circuit";
    case EV_PROGRAMMING_MODE: return "programming";
    case EV_STOPPED: return "stopped";
    case EV_STATUS: return "status";
    case EV_LOCO_INFO: return "loco_info";
    case EV_UNKNOWN_COMMAND: return "unknown_command";
    case EV_OTHER: return "other";
    case EV_CONNECTED: return "connected";
    case EV_DISCONNECTED: return "disconnected";
  }
  return "?";
}

static void onEvent(const Event &ev, void *) {
  char b[400];
  if (ev.type == EV_LOCO_INFO) {
    snprintf(b, sizeof(b),
             "{\"ev\":\"loco_info\",\"address\":%u,\"steps\":%u,\"raw\":%u,\"speed126\":%u,"
             "\"estop\":%s,\"forward\":%s,\"busy\":%s,\"functions\":%lu}",
             ev.address, ev.speedSteps, ev.speedRaw, ev.speed126, ev.locoEStop ? "true" : "false",
             ev.forward ? "true" : "false", ev.busy ? "true" : "false", (unsigned long)ev.functions);
  } else if (ev.type == EV_SERIAL_NUMBER) {
    snprintf(b, sizeof(b), "{\"ev\":\"serial\",\"serial\":%lu}", (unsigned long)ev.serial);
  } else if (ev.type == EV_STATUS) {
    snprintf(b, sizeof(b), "{\"ev\":\"status\",\"status\":%u}", ev.status);
  } else {
    snprintf(b, sizeof(b), "{\"ev\":\"%s\",\"header\":%u}", evName(ev.type), ev.header);
  }
  out(b);
}

static std::vector<uint8_t> parseHex(const std::string &s) {
  std::vector<uint8_t> v;
  std::string digits;
  for (char c : s) if (isxdigit((unsigned char)c)) digits += c;
  for (size_t i = 0; i + 1 < digits.size(); i += 2) v.push_back((uint8_t)strtoul(digits.substr(i, 2).c_str(), nullptr, 16));
  return v;
}

static void cmdBuild(std::istringstream &in) {
  std::string name;
  in >> name;
  uint8_t buf[MAX_TX_PACKET];
  size_t n = 0;
  unsigned a = 0, b = 0, c = 0;
  if (name == "serial") n = buildGetSerialNumber(buf);
  else if (name == "logoff") n = buildLogoff(buf);
  else if (name == "flags") { unsigned long f = 0; in >> std::hex >> f; n = buildSetBroadcastFlags(buf, (uint32_t)f); }
  else if (name == "status") n = buildGetStatus(buf);
  else if (name == "power") { in >> a; n = buildSetTrackPower(buf, a != 0); }
  else if (name == "stop") n = buildSetStop(buf);
  else if (name == "locoinfo") { in >> a; n = buildGetLocoInfo(buf, (uint16_t)a); }
  else if (name == "drive") { in >> a >> b >> c; n = buildSetLocoDrive(buf, (uint16_t)a, (uint8_t)(b > 255 ? 255 : b), c != 0); }
  else if (name == "fn") { in >> a >> b >> c; n = buildSetLocoFunction(buf, (uint16_t)a, (uint8_t)b, c != 0); }
  out("{\"ev\":\"bytes\",\"name\":\"" + name + "\",\"hex\":\"" + toHex(buf, n) + "\"}");
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "Aufruf: %s <host> <port> [pollMs timeoutMs refreshPolls]\n", argv[0]);
    return 2;
  }
#ifdef _WIN32
  WSADATA wsa;
  WSAStartup(MAKEWORD(2, 2), &wsa);
#endif
  g_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  sockaddr_in local;
  memset(&local, 0, sizeof(local));
  local.sin_family = AF_INET;
  local.sin_addr.s_addr = htonl(INADDR_ANY);
  local.sin_port = 0;
  bind(g_sock, (sockaddr *)&local, sizeof(local));

  memset(&g_dest, 0, sizeof(g_dest));
  g_dest.sin_family = AF_INET;
  g_dest.sin_port = htons((uint16_t)atoi(argv[2]));
  inet_pton(AF_INET, argv[1], &g_dest.sin_addr);

  SessionConfig cfg = defaultSessionConfig();
  if (argc >= 6) {
    cfg.pollIntervalMs = (uint32_t)atoi(argv[3]);
    cfg.timeoutMs = (uint32_t)atoi(argv[4]);
    cfg.refreshEveryPolls = (uint8_t)atoi(argv[5]);
  }
  Session session(udpSend, nullptr, onEvent, nullptr, cfg);
  out("{\"ev\":\"ready\"}");

  std::string lineBuf;
  bool running = true;
  while (running) {
    // 1. UDP empfangen (max. 10 ms warten)
    fd_set rf;
    FD_ZERO(&rf);
    FD_SET(g_sock, &rf);
    timeval tv;
    tv.tv_sec = 0;
    tv.tv_usec = 10000;
    if (select((int)g_sock + 1, &rf, nullptr, nullptr, &tv) > 0) {
      uint8_t rx[512];
      int n = recv(g_sock, (char *)rx, sizeof(rx), 0);
      if (n > 0) session.onDatagram(rx, (size_t)n, nowMs());
    }
    session.tick(nowMs());

    // 2. stdin ohne Blockieren lesen
    char chunk[1024];
    long got = 0;
#ifdef _WIN32
    HANDLE hin = GetStdHandle(STD_INPUT_HANDLE);
    DWORD avail = 0;
    if (!PeekNamedPipe(hin, nullptr, 0, nullptr, &avail, nullptr)) break; // stdin geschlossen
    if (avail > 0) {
      DWORD r = 0;
      ReadFile(hin, chunk, avail < sizeof(chunk) ? avail : (DWORD)sizeof(chunk), &r, nullptr);
      got = (long)r;
    }
#else
    fd_set sf;
    FD_ZERO(&sf);
    FD_SET(0, &sf);
    timeval tz = {0, 0};
    if (select(1, &sf, nullptr, nullptr, &tz) > 0) {
      got = (long)read(0, chunk, sizeof(chunk));
      if (got <= 0) break;
    }
#endif
    lineBuf.append(chunk, (size_t)(got > 0 ? got : 0));

    size_t pos;
    while ((pos = lineBuf.find('\n')) != std::string::npos) {
      std::string line = lineBuf.substr(0, pos);
      lineBuf.erase(0, pos + 1);
      if (!line.empty() && line.back() == '\r') line.pop_back();
      std::istringstream in(line);
      std::string cmd;
      in >> cmd;
      unsigned a = 0, b = 0, c = 0;
      if (cmd == "begin") session.begin(nowMs());
      else if (cmd == "select") { in >> a; session.selectLoco((uint16_t)a); }
      else if (cmd == "drive") { in >> a >> b >> c; session.drive((uint16_t)a, (uint8_t)(b > 255 ? 255 : b), c != 0); }
      else if (cmd == "fn") { in >> a >> b >> c; session.setFunction((uint16_t)a, (uint8_t)b, c != 0); }
      else if (cmd == "power") { in >> a; session.setTrackPower(a != 0); }
      else if (cmd == "estop") session.emergencyStop();
      else if (cmd == "logoff") session.logoff();
      else if (cmd == "build") cmdBuild(in);
      else if (cmd == "parsehex") {
        std::string rest;
        std::getline(in, rest);
        std::vector<uint8_t> d = parseHex(rest);
        ParseStats st = parseDatagram(d.data(), d.size(), onEvent, nullptr);
        char b2[96];
        snprintf(b2, sizeof(b2), "{\"ev\":\"parse_stats\",\"packets\":%u,\"rejected\":%u}", st.packets, st.rejected);
        out(b2);
      } else if (cmd == "state") {
        ParseStats st = session.totalStats();
        char b2[160];
        snprintf(b2, sizeof(b2), "{\"ev\":\"state\",\"connected\":%s,\"serial\":%lu,\"packets\":%u,\"rejected\":%u}",
                 session.isConnected() ? "true" : "false", (unsigned long)session.serialNumber(), st.packets, st.rejected);
        out(b2);
      } else if (cmd == "quit") running = false;
      out("{\"ev\":\"ack\",\"cmd\":\"" + cmd + "\"}");
    }
  }
#ifdef _WIN32
  closesocket(g_sock);
  WSACleanup();
#else
  close(g_sock);
#endif
  return 0;
}
