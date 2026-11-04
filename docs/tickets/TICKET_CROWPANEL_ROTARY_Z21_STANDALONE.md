# [Hardware] CrowPanel Rotary Handregler: Standalone-Betrieb mit Roco Z21

**Typ:** Feature / Hardware-Firmware / Protokoll  
**Status:** Umgesetzt (v1.10.0), Test an echter Z21 offen  
**Priorität:** Mittel  
**Komponenten:** `hardware/crowpanel_esp32_rotary/` (`z21_protocol.*`, `crowpanel_esp32_rotary.ino`, `config.h`), `scripts/z21_simulator.mjs`, `scripts/test_crowpanel_z21.mjs`  
**Labels:** `hardware`, `crowpanel`, `z21`, `protocol`, `standalone`

**Quelle:** Roco/Fleischmann „Z21 LAN Protokoll Spezifikation“ (V1.13)

---

## 1. Problembeschreibung & Motivation

Der CrowPanel-1.28"-Drehregler (`hardware/crowpanel_esp32_rotary`) kann heute nur mit **DCC-EX** sprechen: per TCP auf Port 2560 mit Befehlen wie `<t …>` und `<F …>`. Wer eine **Roco Z21 / z21 start** hat, kann den Knob nicht nutzen.

Ziel: Der Knob steuert eine Z21 **eigenständig**, also direkt über WLAN, ohne PC und ohne TrainMaster-Server. Bedienung und Anzeige bleiben wie beim DCC-EX-Betrieb.

## 2. Fakten aus der Z21-LAN-Spezifikation (in eigenen Worten)

- UDP, Port **21105**. Standard-IP der Z21: `192.168.0.111`. Die Z21 antwortet an IP und Port des Absenders.
- Paket: `DataLen` (2 Byte LE, inkl. Kopf) + `Header` (2 Byte LE) + Daten. Ein UDP-Datagramm kann **mehrere Pakete hintereinander** enthalten.
- X-Bus-Befehle laufen unter Header `0x40`. Das letzte Byte ist ein XOR über alle X-Bytes davor.
- Ein Client wird nach **60 s ohne Kommunikation** abgemeldet. Danach bekommt er keine Broadcasts mehr, also muss er sich regelmäßig melden.
- Broadcasts gibt es nur nach `LAN_SET_BROADCASTFLAGS`. Flag `0x00000001` liefert Gleisspannung, Not-Halt und Lok-Infos.
- `LAN_X_LOCO_INFO` bekommt nur, wer die Lok vorher mit `LAN_X_GET_LOCO_INFO` **abonniert** hat (max. 16 Loks pro Client).
- Lokadresse: `Adr_MSB = (Adr >> 8) & 0x3F`, ab Adresse **128** zusätzlich `| 0xC0`. `Adr_LSB = Adr & 0xFF`.
- 128 Fahrstufen (`E4 13`): Bit 7 = Richtung (1 = vorwärts). 0 = Halt, 1 = Not-Halt, 2–127 = Fahrstufe 1–126.

Benutzte Befehle:

| Zweck | Befehl | Bytes |
| :--- | :--- | :--- |
| Zentrale erkennen | LAN_GET_SERIAL_NUMBER | `04 00 10 00` |
| Broadcasts anmelden | LAN_SET_BROADCASTFLAGS | `08 00 50 00 01 00 00 00` |
| Status / Lebenszeichen | LAN_X_GET_STATUS | `07 00 40 00 21 24 05` |
| Gleisspannung ein/aus | LAN_X_SET_TRACK_POWER_ON/OFF | `… 21 81 A0` / `… 21 80 A1` |
| Not-Halt (alle Loks) | LAN_X_SET_STOP | `06 00 40 00 80 80` |
| Lok abonnieren / abfragen | LAN_X_GET_LOCO_INFO | `09 00 40 00 E3 F0 MSB LSB XOR` |
| Fahren | LAN_X_SET_LOCO_DRIVE | `0A 00 40 00 E4 13 MSB LSB RVVVVVVV XOR` |
| Funktion | LAN_X_SET_LOCO_FUNCTION | `0A 00 40 00 E4 F8 MSB LSB TTNNNNNN XOR` |
| Abmelden | LAN_LOGOFF | `04 00 30 00` |

Ausgewertet werden `LAN_X_LOCO_INFO` (Fahrstufe, Richtung, F0–F31), `LAN_X_BC_TRACK_POWER_ON/OFF`, `LAN_X_BC_TRACK_SHORT_CIRCUIT`, `LAN_X_BC_STOPPED`, `LAN_X_STATUS_CHANGED` und die Seriennummer.

## 3. Lösung

### 3.1 Aufbau

- **`z21_protocol.h/.cpp`**: reines C++ ohne Arduino-Abhängigkeit. Pakete bauen, Datagramme parsen (mehrere Pakete, Längen- und XOR-Prüfung) und die Sitzung `Z21Session` (Anmeldung, Lebenszeichen, Verbindungsüberwachung, Lok-Abo). Senden und Uhr kommen von außen, deshalb läuft **derselbe Code** auf dem ESP32 und im PC-Test.
- **Firmware**: Die Zentrale wird in `config.local.h` gewählt:
  ```cpp
  #define CS_PROTOCOL  CS_PROTOCOL_Z21
  #define Z21_HOST     "192.168.0.111"
  ```
  Ohne Angabe bleibt alles wie bisher (DCC-EX).

### 3.2 Verhalten

- **Start:** Seriennummer abfragen, Broadcast-Flags setzen, Status holen, aktuelle Lok abonnieren. Die Gleisspannung wird **nicht** automatisch eingeschaltet, weil an der Z21 meist noch andere Regler hängen.
- **Lebenszeichen:** alle 3 s `LAN_X_GET_STATUS`. Kommt 8 s lang keine gültige Antwort, gilt die Z21 als getrennt (Anzeige „Z21 getrennt“, LEDs blau). Sobald wieder Antworten kommen, meldet sich der Knob neu an (Flags + Lok-Abo), denn die Z21 hat ihn nach 60 s vergessen.
- **Lokwechsel** (Swipe/Auswahl): Die neue Lok wird abonniert. Der Knob übernimmt ihren **echten Zustand** von der Zentrale (Fahrstufe, Richtung, Funktionen).
- **Fremde Regler** (Roco-App, multiMAUS): Änderungen kommen als `LAN_X_LOCO_INFO` und werden angezeigt. Solange am Knob gedreht wird (500 ms nach der letzten Drehung), wird die Fahrstufe aus Meldungen ignoriert. So springt der Regler nicht durch eigene, verzögerte Echos zurück.
- **Bedienung wie bisher:** Drehen = Fahrstufe, Klick = Richtung, Long-Press = Not-Halt (`LAN_X_SET_STOP`) bzw. wieder Gleisspannung ein, Funktionen F0–F11.

## 4. Tests

**Automatisiert, ohne Z21-Hardware** (`npm run test:z21`):

- `scripts/z21_simulator.mjs` ist eine **unabhängige** Z21-Nachbildung nach der Spezifikation. Sie prüft jedes Paket streng (Länge, XOR, bekannte Befehle), führt Lokzustände, Abos, Broadcast-Flags und das 60-s-Timeout und protokolliert Fehler.
- `hardware/crowpanel_esp32_rotary/test/z21_host_knob.cpp` ist ein „Knob ohne Display“. Er nutzt den **unveränderten** Firmware-Protokollcode, nur das UDP kommt vom PC statt vom ESP32.
- Geprüft wird unter anderem:
  - exakte Bytes aller Befehle gegen die Tabelle in Abschnitt 2,
  - Anmeldung, Fahren vor- und rückwärts, Fahrstufen-Grenzen, Funktionen, Not-Halt, Gleisspannung,
  - kurze und lange Adressen (127 kurz, 128 lang, 9999),
  - eine Fremdsteuerung über einen zweiten Client, die beim Knob ankommt,
  - Ausfall der Z21 und automatische Neuanmeldung,
  - mehrere Pakete in einem Datagramm, kaputte Pakete, die sicher verworfen werden.
- Firmware-Build für ESP32-S3 mit `arduino-cli` (`esp32:esp32:esp32s3`).

**Mit echtem Knob, ohne Z21:** `node scripts/z21_simulator.mjs` auf dem PC starten und in `config.local.h` als `Z21_HOST` die PC-IP eintragen. Der Simulator zeigt jeden Befehl des Knobs im Klartext.

**An echter Z21 (offen):** eine Lok, niedrige Fahrstufe, Hand am Stopp-Knopf. Fahren, Richtung, Licht, Not-Halt, Lokwechsel, Parallelbetrieb mit der Z21-App, Z21 aus- und wieder einschalten.

## 5. Akzeptanzkriterien

1. Mit `CS_PROTOCOL_Z21` steuert der Knob Fahrstufe, Richtung, F0–F11 und Not-Halt einer Z21 ohne PC.
2. Alle gesendeten Pakete entsprechen der Spezifikation (Simulator meldet 0 Protokollfehler).
3. Fahrstufe nie außerhalb 0/2–127. Lange Adressen ab 128 werden korrekt kodiert.
4. Änderungen durch andere Regler erscheinen auf dem Knob.
5. Nach einem Ausfall der Z21 erkennt der Knob die Trennung binnen 8 s und meldet sich danach selbstständig neu an.
6. DCC-EX-Betrieb bleibt unverändert, wenn `CS_PROTOCOL` nicht gesetzt ist.

## 6. Nebenbefund (nicht Teil dieses Tickets)

`server/src/hal/Z21Driver.ts` kodiert Adressen schon **ab 100** als lange Adresse (`isLong = address >= 100`). Laut Spezifikation gilt das erst ab 128. Loks mit kurzen Adressen 100–127 werden vom Server deshalb falsch angesprochen. Dafür braucht es ein eigenes Patch-Ticket.
