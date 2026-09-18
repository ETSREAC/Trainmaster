# 📡 TrainMaster Kabelloses Rückmelde-Konzept: "SpotWIO"
> **Zuverlässige, spurunabhängige Zug- und Block-Rückmeldung ohne Kabelgemetzel, ohne Gleistrennungen und mit minimalem Einbauaufwand.**

---

## 🛑 1. Das Problem herkömmlicher Rückmeldesysteme

| Traditionelle Methode | Das Problem ("Kabelgemetzel & Frust") |
|---|---|
| **Klassische Stromfühler (Gleisbesetztmelder)** | Gleise müssen aufwendig zersägt/isoliert werden. Jeder Block benötigt dicke Kabel zurück zu einer zentralen Melder-Platine. Wagen ohne Widerstandsachsen werden nicht erkannt. Systemabhängig (2-Leiter Gleichstrom vs. 3-Leiter Märklin). |
| **Zentrale Reedkontakte** | Dutzende meterlange Signalleitungen unter der Anlage. Reedkontakte sind mechanisch empfindlich (Glaskolbenbruch, Verkleben der Kontakte). Klobige Magnete nötig. |
| **Klassische Lichtschranken** | Empfindlich gegen wechselndes Raumlicht/Schatten. Klobige Sender/Empfänger-Dioden neben den Gleisen stören die Modell-Optik. |

---

## 🌟 2. Das "SpotWIO"-Konzept: Dezentral & Funkbasiert

Statt 50 Kabel quer unter der ganzen Modellbahnanlage zu verlegen, basiert **SpotWIO** auf dem Prinzip **lokaler Funk-Knotenpunkte**:

```mermaid
graph TD
    subgraph "Gleisbereich Bahnhof West (Dezentral)"
        S1[Sensor 1: ENTER] -->|10cm Draht| NODE1[ESP32-C3 SuperMini Node 1]
        S2[Sensor 2: IN] -->|10cm Draht| NODE1
        S3[Sensor 3: WEICHE] -->|10cm Draht| NODE1
    end

    subgraph "Gleisbereich Schattenbahnhof (Dezentral)"
        S4[Sensor 4: ENTER] -->|10cm Draht| NODE2[ESP32-C3 SuperMini Node 2]
        S5[Sensor 5: IN] -->|10cm Draht| NODE2
    end

    NODE1 ==>|WLAN UDP Datagramm| TM[TrainMaster Server (Port 8051)]
    NODE2 ==>|WLAN UDP Datagramm| TM

    TM --> AUTO[Automatik-Engine / BBT / Stellwerk]
```

### Der Trick gegen Kabelsalat:
- Ein winziger **ESP32-C3 SuperMini** (so klein wie eine Briefmarke: 22 × 18 mm, ca. 1,60 €) sitzt direkt dort, wo die Sensoren sind (z. B. unter Gleis 1–3 im Bahnhof).
- Die Sensorkabel sind nur **10 bis 20 cm lang** und gehen direkt in den lokalen Node.
- Die Datenübertragung zum TrainMaster-Server erfolgt **drahtlos per WLAN** über das bereits in TrainMaster integrierte WIO/UDP-Protokoll.
- Unter der Anlage liegt lediglich eine **einzige 2-adrige Versorgungsleitung (5V oder 12V DC)** für alle Nodes (oder Direktabgriff vom DCC-Gleis mit Mini-Gleichrichter!).

---

## 🎯 3. Die 3 besten kabellosen Sensormethoden (Spurunabhängig)

### 🥇 Lösung A: Unsichtbare SMD-Reflexlichtschranken (VCNT2020 / TCRT5000)
*Ideal für: Absolute Zugerkennung OHNE Magnete, für JEDEN Wagen (Plastik, Metall, beleuchtet oder unbeleuchtet).*

```text
       Zugunterseite / Drehgestell
    ================================
          ▲                  │
    Infrarot-Licht      Reflexion
          │                  ▼
    ┌───────────────────────────────┐
    │  [IR-LED]   [Fototransistor]  │  <-- Nur 2.9 x 1.4 mm groß!
    └───────────────────────────────┘
     [Schwelle]  SENSOR  [Schwelle]   <-- Sitzt unsichtbar zwischen zwei Schwellen
```

- **Sensortyp**: **Vishay VCNT2020** (2.9 × 1.4 × 0.8 mm SMD) oder **TCRT5000**.
- **Einbau**:
  - Passt selbst in **Spur N, TT und H0** direkt zwischen zwei Schwellen, ohne das Gleis zu schwächen!
  - 1 mm Loch von oben durch die Trasse bohren, Sensor flach zwischen die Schwellen kleben und mattschwarz anmalen – **aus 30 cm Entfernung unsichtbar**.
- **Zuverlässigkeit gegen Fremdlicht**:
  - Der ESP32 pulst die IR-LED z. B. mit 10 kHz oder misst Umgebungslicht differentiell (Hellmessung vs. Dunkelmessung) ➔ **immun gegen Lampenlicht, Taschenlampen und Raumabdunklung**.
- **Gleiseingriff**: **0 % (Kein Gleis zersägen, keine Isolierschienenverbinder)**.

---

### 🥈 Lösung B: SMD-Mikro-Hall-Sensoren (Magnet-Auslösung)
*Ideal für: 100 % fehlerfreie, unzerstörbare Punkt-Erkennung (ENTER/IN) bei Tag und Nacht.*

- **Sensortyp**: **Texas Instruments DRV5032** oder **Diodes AH3362** (SOT-23 Gehäuse, 2.9 × 1.3 mm).
- **Einbau**:
  - Der winzige Sensor sitzt flach im Gleisbett zwischen zwei Schwellen.
  - Unter die Lokomotive (oder den letzten Wagen des Zuges) wird ein winziger **Neodym-Pillenkontakt (1 mm Durchmesser, 0.5 mm Dicke)** geklebt.
- **Vorteile**:
  - Null mechanischer Verschleiß.
  - Völlig unbeeinflusst von Licht, Schmutz, Staub oder Rauchöl.
  - Schaltzeit im Mikrosekundenbereich (auch bei ICE-Vollgas mit 300 km/h Modellgeschwindigkeit absolut präzise).

---

### 🥉 Lösung C: RFID-Micro-Pucks (Automatische Zug-Identifikation)
*Ideal für: Blöcke, die sofort wissen sollen, WELCHE Lok gerade darüberfährt.*

- **Sensortyp**: 13.56 MHz RFID / NFC (z. B. **PN532** oder **RC522 Mini-Coil**) oder 125 kHz Micro-Transponder.
- **Einbau**:
  - Flache Mini-Spule unter der Trassenplatte (muss nicht mal das Gleis berühren!).
  - 5 mm selbstklebender RFID-Sticker unter der Lok.
- **Der Clou**:
  - Meldet nicht nur "Gleis belegt", sondern sendet z. B. `LOK-ID: BR-101` direkt an TrainMaster.
  - TrainMaster weist die Lok im Gleisplan **automatisch** dem richtigen Block zu, ohne dass man sie manuell antippen muss!

---

## ⚡ 4. Der "Zero-Wiring" Stromversorgungs-Trick: DCC-Energy-Harvesting

Wenn du selbst die 2-adrige Gleichstrom-Ringleitung sparen möchtest:

```text
DCC-Fahrgleis (14–18V AC/DCC) ──┬── [Mini-Brückengleichrichter MB10F]
                                │               │
                                └─── [LM2596 / MP1584 Mini Step-Down 3.3V]
                                                │
                                                ▼
                                    ESP32-C3 Node + Sensoren
```

- Ein fingernagelgroßes Modul (Gleichrichter + Step-Down-Regler, ca. 0,80 €) greift 5–10 mA direkt vom Digitalgleis ab.
- **Ergebnis**: **0 KABEL** durch die Anlage. Sensor und ESP32-C3 werden direkt an der Schiene mit Strom versorgt und funken das Signal per WLAN an TrainMaster!

---

## 📊 5. Vergleich der Methoden auf einen Blick

| Kriterium | A: SMD-Reflexlichtschranke | B: SMD-Hallsensor | C: RFID-Transponder |
|---|:---:|:---:|:---:|
| **Gleistrennungen nötig?** | ❌ **Nein (0%)** | ❌ **Nein (0%)** | ❌ **Nein (0%)** |
| **Magnete an Fahrzeugen?** | ❌ **Nein** | ✔️ Ja (1 mm Mini-Puck) | ✔️ Ja (RFID-Sticker) |
| **Erkennt jeden Einzelwagen?** | ✔️ **Ja (auch Geisterwagen)** | Nur Wagen mit Magnet | Nur Wagen mit Tag |
| **Schmutz- & Staubresistent?**| Sehr gut (bei IR) | **Perfekt (100%)** | **Perfekt (100%)** |
| **Spurunabhängig?** | **Z, N, TT, H0, 0, G** | **Z, N, TT, H0, 0, G** | **N, TT, H0, 0, G** |
| **Zugnummernerkennung?** | Über TrainMaster BBT | Über TrainMaster BBT | **Direkt per Hardware** |
| **Kosten pro Meldeknoten** | ~ 2,50 € (ESP + 4 Sensoren) | ~ 2,50 € (ESP + 4 Sensoren) | ~ 4,00 € (ESP + RFID) |

---

## 🛠️ 6. Empfehlung für die Praxis: Die Hybrid-Kombination

Für das beste Preis-Leistungs- und Einbauverhältnis auf deiner Anlage:

1. **Für die Blockabschnitte (ENTER / IN)**:
   - **Lösung A (Reflexlichtschranke VCNT2020)** zwischen zwei Schwellen:
     - Reagiert auf jede Lok und jeden Wagen.
     - Löst automatisch BBT-Bremsen und Halt aus.
     - Kein Bekleben von Loks/Wagen nötig.
2. **Als dezentraler Funk-Knoten**:
   - **ESP32-C3 SuperMini** unter der Trasse.
   - An einen einzigen C3-Node schließt du 4 bis 6 Sensoren aus der unmittelbaren Umgebung (z. B. Bahnhofs-Gleis 1 und 2) mit kurzen Drähten an.
   - Der Node sendet sofort beim Auslösen:
     `{"unit": 1, "pin": 3, "state": true}` via UDP an Port 8051 von TrainMaster.
3. **Ergebnis**:
   - **Keine Kabelbäume** durch den Raum.
   - **Keine Schienen aufdremeln**.
   - Funktioniert mit **jeder Spurweite** (von Z bis H0 und Gartenbahn).
   - In TrainMaster bereits **zu 100 % ab Werk unterstützt** (WIO-Treiber läuft bereits auf Port 8051)!
