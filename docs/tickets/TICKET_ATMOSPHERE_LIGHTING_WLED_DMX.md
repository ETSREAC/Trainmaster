# [Feature] Atmosphere Lighting Engine: WLED, DMX & Zigbee Tag/Nacht- & Wettersteuerung

**Typ:** Smart Environment / IoT / Visual Immersion  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/lighting/AtmosphereEngine.ts`, `server/src/lighting/WLedClient.ts`, `server/src/lighting/ArtNetDmxClient.ts`, `client/src/components/LightingSettingsModal.ts`  
**Labels:** `lighting`, `wled`, `dmx`, `artnet`, `iot`, `fast-clock`, `atmosphere`, `weather`

---

## 1. Problemstellung & Motivation

Die Ausleuchtung und Stimmung von Modellbahnanlagen ist oft stark vernachlässigt:
* Die meisten Anlagen haben starres, ungemütliches Deckenlicht.
* Professionelle Tag-Nacht-Steuerungen (z. B. von Viessmann oder Uhlenbrock) kosten hunderte Euro und sind extrem kompliziert zu programmieren.
* Im Open-Source- und Smart-Home-Bereich existiert mit **WLED** (Open-Source-Firmware für ESP32/ESP8266 LED-Streifen für ca. 15 €) und **DMX/Art-Net** der weltweite Goldstandard für professionelle Lichtsteuerung.
* **TrainMaster-Lösung:** Direkte Integration von WLED, Art-Net/DMX und Philips Hue in TrainMaster, synchronisiert mit der Modellzeit-Uhr (Fast Clock) und Ereignissen auf der Modellbahn.

---

## 2. Kernfunktionen

### 2.1 Sanfter 24-Stunden Tag-Nacht-Zyklus (Fast-Clock-Sync)
* Ein konfigurierbarer Modellzeit-Faktor (z. B. 1 Modelltag = 30 oder 60 Minuten Echtzeit).
* Stufenloser, mathematisch berechneter Farbtemperatur- und Helligkeitsübergang:
  * **00:00 – 05:00 (Nacht):** Tiefblaues / violettes Mondlicht (Dunkelblau ~15 % Helligkeit).
  * **05:00 – 07:00 (Morgendämmerung):** Warmer Rosa-/Orangeton, ansteigende Helligkeit.
  * **07:00 – 17:00 (Tag):** Helles, neutrales Sonnenlicht (4500K – 5500K, 100 % Helligkeit).
  * **17:00 – 20:00 (Goldene Stunde / Abendrot):** Warmes Bernstein/Rotgold.
  * **20:00 – 23:59 (Abenddämmerung):** Wechsel ins Mondlicht.

### 2.2 Intelligente Häuser- und Straßenlaternen-Schaltung
* Wenn die Dämmerung einbricht, schalten sich Häuser und Straßenlampen **nicht schlagartig alle gleichzeitig ein** (wirkt unnatürlich).
* TrainMaster steuert Relais- oder DCC-Zubehördecoder mit **realistischer Zufallsverzögerung** an:
  * Zuerst gehen die Straßenlaternen an.
  * Anschließend schalten sich Fenster in den Häusern nacheinander zufällig ein und nachts nach 23:00 Uhr schrittweise wieder aus.

### 2.3 Ereignis- und Sicherheitsbeleuchtung
* **Not-Halt / Kurzschluss:** Das Raumlicht schaltet **sofort auf 100 % neutralweißes Arbeitslicht**, damit der Modellbahner sofort die Entgleisung oder Störung auf der Anlage beheben kann.
* **Tunnel-Erkennung:** Fährt ein Zug in einen Tunnelblock ein, können Führerstands- oder Tunnellichter gezielt aktiviert werden.

### 2.4 Wettereffekte & Gewitter-Simulation
* Auf Knopfdruck oder per Zufallsplan:
  * Himmel zieht sich zu (Licht wird grau/dunkel).
  * Unwetter-Modus: Zufällige, grelle weiße Lichtblitze über WLED-LEDs.
  * **Audio-Synchronisation:** Blitz wird zeitversetzt vom passenden Donner-Grollen über den [Smart Sound Director](file:///c:/Users/etswr/Downloads/TrainMaster/docs/tickets/TICKET_SMART_SOUND_AND_STATION_DIRECTOR.md) begleitet!

---

## 3. Technische Protokolle

### 3.1 WLED (JSON API & UDP Realtime DDP)
* WLED läuft auf jedem 5 € ESP32-Mikrocontroller mit WS2812B / SK6812 RGB/RGBW-Streifen über WLAN.
* Ansteuerung via **WLED JSON API** (`POST /json/state`) für weiche Farbwechsel.
* UDP **DDP (Distributed Display Protocol)** für blitzschnelle Gewitter-Effekte ohne Latenz.

### 3.2 Art-Net / DMX over IP
* Industriestandard für Bühnenbeleuchtung (DMX512 über UDP Port `6454`).
* Steuert PAR-Kannen, Fluter und DMX-Dimmer über der Anlage.

---

## 4. Datenmodell (`types.ts`)

```typescript
export interface LightingDevice {
  id: string;
  name: string; // z.B. "Hintergrund-Licht Decke", "Häuserzeile Dorf"
  type: 'wled' | 'artnet_dmx' | 'philips_hue' | 'dcc_accessory';
  endpoint: string; // IP-Adresse oder COM-Port
  universe?: number; // für Art-Net
  wledSegmentId?: number;
  assignedRole: 'sky_sun' | 'sky_ambient' | 'streetlights' | 'worklight';
}

export interface DayNightKeyframe {
  timeMinutes: number; // 0 - 1440 (Tagesminute)
  brightness: number;  // 0 - 255
  rgb: [number, number, number]; // [R, G, B]
  whiteTempKelvin?: number;
}
```

---

## 5. UI & Bedienung

* **Neuer Reiter „Licht & Atmosphäre“:**
  * Live-Vorschau des aktuellen Himmelslichts (Farbverlauf).
  * Schnell-Regler für Modellzeit-Geschwindigkeit (1x, 5x, 10x, 30x).
  * Manuelle Schalter: *„Tag einfrieren“*, *„Nacht erzwingen“*, *„Gewitter auslösen“*, *„Arbeitslicht AN“*.
  * Gerätesuche: Automatischer mDNS-Scan nach WLED-Controllern im lokalen WLAN (`_wled._tcp`).

---

## 6. Akzeptanzkriterien

- [ ] WLED-Client kann Farb- und Helligkeitswerte per JSON und UDP an ESP32-Streifen senden.
- [ ] Art-Net UDP Broadcast (`Port 6454`) unterstützt.
- [ ] Stufenlose Farbberechnung für 24-Stunden-Zyklus ohne Ruckeln oder sichtbare Farbsprünge.
- [ ] Bei Not-Halt schaltet das Licht verzögerungsfrei auf 100 % Arbeitslicht.
- [ ] Gewittersimulation mit Blitzen und synchronisiertem Donner über die Audio-Engine.
- [ ] Zufallsgesteuerte Dämmerungsschaltung für Straßen- und Häuserlichter.
