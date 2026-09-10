# 🎶 TrainMaster Sound & Akustik Ideen-Sammlung

Dieses Dokument dient als zentrale Ideensammlung und Referenz für alle zukünftigen Sound-, Audio- und Atmosphären-Features in TrainMaster. Hier werden alle Wünsche, Hardware-Ideen und Soundabläufe strukturiert gesammelt, damit keine Idee verloren geht.

---

## 🚂 1. Lok-basierte Sounds (DCC Funktionstasten F0–F28)

Viele moderne Sound-Loks (DCC/RailCom) besitzen hochentwickelte Soundprojekte (z. B. ESU Loksound, ZIMO, Märklin mfx). TrainMaster kann diese Funktionen vollautomatisch und passend zur Betriebssituation triggern:

### 1.1 Vor der Abfahrt
* **Schaffnerpfiff / Abfahrtsignal (z. B. F3)**:
  * 3 bis 5 Sekunden vor dem Umschalten des Ausfahrsignals auf Fahrt (HP1) und dem Anfahren der Lok ertönt automatisch der Pfiff.
  * TrainMaster aktiviert die entsprechende F-Taste als Impuls (z. B. für 1,5 Sekunden) und schaltet sie wieder ab.
* **Türen schließen / Piepen**:
  * Bei modernen Triebzügen (ICE, Regional-Flirt, S-Bahn): Türschließ-Warnton 5 Sekunden vor Abfahrt.
* **Kompressor / Zylinder ausblasen**:
  * Bei Dampfloks: Zylinder entwässern kurz vor der Abfahrt.
* **Motorstart / Standgas**:
  * Wenn die Lok im Schattenbahnhof oder Abstellgleis stand, kann der Motorsound (oft F1) 10 Sekunden vor Abfahrt automatisch gestartet werden.

### 1.2 Während der Fahrt & auf freier Strecke
* **Pfeiftafeln & Bahnübergänge (z. B. F2)**:
  * Erreicht ein Zug einen Streckenabschnitt mit Bahnübergang oder Signal "Pfeifen" (P-Tafel), ertönt das Makrofon / Horn der Lok.
* **Kurvenquietschen**:
  * Kann bei engen Weichenstraßen oder Bogenblöcken kurzzeitig aktiviert werden.
* **Glocke / Läutewerk**:
  * Bei Nebenbahnen oder Straßenbahnstrecken (z. B. Kato Pocketline Tram).

### 1.3 Beim Anhalten & Einfahren
* **Bremsenquietschen**:
  * Wenn die BBT-Bremskurve die Kriechgeschwindigkeit erreicht oder der Zug den IN-Melder auslöst.
* **Stationsansage im Zug (z. B. F12)**:
  * *"Nächster Halt: Bahnhof..."* beim Auslösen des ENTER-Melders.

---

## 🔊 2. Stationäre Sounds am Modellbahnhof (ESP32 WIO Nodes)

Nicht jeder Zug besitzt einen teuren Sounddekoder, und viele Geräusche gehören fest zum Bahnhof oder zur Landschaft – nicht zur Lok!

### 2.1 Hardware-Konzept (ESP32 Audio Node)
* **DFPlayer Mini (MP3 Player mit MicroSD-Karte)**:
  * Sehr günstig (ca. 2 €), per UART (Serial RX/TX) an beliebige 2 Pins eines ESP32 WIO Nodes anschließbar.
  * Kann hunderte MP3-Dateien (Ansagen, Glocken, Effekte) auf microSD-Karte abspielen.
  * Lautsprecher direkt anschließbar (bis 3 Watt) unter dem Bahnsteig montiert.
* **I2S DAC Verstärker (z. B. MAX98357A)**:
  * Kristallklare digitale Audioausgabe direkt vom ESP32 über I2S (3 Pins: BCLK, LRC, DIN).
  * Kann Sounds über SPIFFS/Flash oder Stream abspielen.

### 2.2 Bahnhofs-Szenarien & Ansagen
* **Gleisbezogene Bahnsteigansagen**:
  * Vor Abfahrt: *"Achtung an Gleis 1: Regionalexpress nach... bitte einsteigen, Türen schließen selbsttätig."*
  * Vor Einfahrt: *"Gleis 2: Einfahrt ICE 574 nach..."*
  * Gong vor der Ansage (*"Ding-Dong"*).
* **Bahnhofshallen-Atmosphäre**:
  * Leises, dezentes Hintergrundrauschen (Gemurmel, Taubengurren, Schrittgeräusche, Hallen-Echo) auf Dauerschleife mit geringer Lautstärke.
* **Verspätungsansagen (Zufallsfeature für Automatik)**:
  * Für besondere Realitätsnähe: Seltene Zufallsansage *"Heute ca. 5 Minuten später..."* mit verlängerter Block-Wartezeit!

### 2.3 Strecken- & Industrie-Sounds
* **Bahnübergang (BÜ)**:
  * Akustisches Läutewerk (Glockenschlag / Bimmeln), synchron geschaltet mit den Andreaskreuz-Blinkern und Schrankenservos über WIO.
* **Güterbahnhof / Industrie**:
  * Rangierfunk, Ladegeräusche, Krähen, metallisches Klappern.

---

## 💻 3. Web-Audio im Browser (Client-Fallback)

Für Anwender, die sofort Sound erleben möchten, ohne zusätzliche Hardware auf der Anlage zu installieren:
* **Audio-Engine im Web-Frontend**:
  * HTML5 Web Audio API im Browser.
  * Server sendet via WebSocket `{ type: 'PLAY_SOUND', payload: { name: 'whistle', volume: 0.8 } }`.
  * Browser auf dem Smartphone, Tablet oder PC-Monitor spielt die MP3/WAV-Sounds über die Lautsprecher des Steuergeräts ab.
* **Lok-Horn Taster im Handregler**:
  * Schnelltaster für Pfeife / Glocke direkt in der Web-Bedienoberfläche.

---

## ⚙️ 4. Konfiguration & Zuordnung in TrainMaster

Die Verknüpfung von Sound und Automatikbetrieb wird wie folgt parametriert:

| Ebene | Einstellung | Wirkung |
|---|---|---|
| **Block** | `departureFKey` (z. B. 3) | Löst DCC F-Taste der dort stehenden Lok kurz vor Abfahrt aus |
| **Block** | `departureLeadTimeSec` (z. B. 3s) | Sekunden vor Abfahrt, wann der Pfiff/Sound ausgelöst wird |
| **Block** | `wioSoundIndex` (z. B. Track 1) | Spielt MP3-Track auf dem am Bahnsteig montierten ESP32 ab |
| **Lok** | `functionLabels` (F0-F28) | Beschriftung der Sounds ("Pfiff", "Glocke", "Ansage", "Schaffner") |
| **Automatik** | Sound-Wahrscheinlichkeit | Z. B. 80% (nicht jeder Zug pfeift jedes Mal, für natürliche Varianz) |

---

*Diese Datei wird fortlaufend erweitert, wenn neue Soundideen oder Hardwaremodule hinzukommen.*
