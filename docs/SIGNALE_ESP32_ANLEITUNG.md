# 🚦 Anschluss- & Einrichtungsanleitung: Viessmann Lichtsignale am ESP32 & TrainMaster

Diese Anleitung erklärt Schritt für Schritt, wie **Modellbahn-Lichtsignale** (am Beispiel von **Viessmann H0/N/TT**) direkt an ein **ESP32 Dev Board** (z. B. Freenove ESP32-WROOM-32E) angeschlossen und in **TrainMaster** gesteuert werden.

---

## 🔌 1. Das Funktionsprinzip (Gemeinsames Plus / Active Low)

Modellbahn-Signale (insbesondere von Viessmann) arbeiten mit einer **Gemeinsamen Anode (Gemeinsamer Pluspol `+`)**:
- Der **gemeinsame Draht** wird mit dem **Pluspol (`3.3V`)** des ESP32 verbunden.
- Die **Farben (Rot, Grün, Gelb, Weiß)** werden mit einzelnen **GPIO-Pins** verbunden.
- Wenn der ESP32 einen Pin auf `LOW` (GND / 0V) schaltet, fließt der Strom und die entsprechende LED leuchtet (**Active Low**).
- Die integrierten Vorwiderstände der Viessmann-Signale schützen die LEDs. An den 3.3V des ESP32 leuchten sie vorbildgerecht sanft und blenden nicht.

---

## 📌 2. Die Pinbelegung am ESP32 (Freenove Dev Board)

Auf der **linken Pinleiste unten** (direkt oberhalb der USB-C Buchse) liegen alle benötigten Pins direkt nebeneinander:

```text
               ANTENNE (oben)
               ┌──────────┐
    3.3V  [ 1] │          │ [ 1]  GND
      EN  [ 2] │          │ [ 2]  23
      VP  [ 3] │          │ [ 3]  22
      VN  [ 4] │          │ [ 4]  TX
      34  [ 5] │          │ [ 5]  RX
      35  [ 6] │          │ [ 6]  21  (Belegtmelder)
      32  [ 7] │          │ [ 7]  GND
      33  [ 8] │          │ [ 8]  19
      25  [ 9] │          │ [ 9]  18
      26  [10] │          │ [10]   5
      27  [11] │          │ [11]  17
      14  [12] │          │ [12]  16
👉    12  [13] │          │ [13]   4   <--- GPIO 12: ROT (Hp0 / Halt)
     GND  [14] │          │ [14]   0   <--- GND (Masse)
👉    13  [15] │          │ [15]   2   <--- GPIO 13: GRÜN (Hp1 / Fahrt)
👉  3.3V  [16] │          │ [16]  15   <--- 3.3V: GEMEINSAMER PLUSPOL (+)
    3.3V  [17] │          │ [17]  GND
      5V  [18] │          │ [18]  GND
               └──────────┘
               [  USB-C   ]
```

### Kabel-Zuordnungstabelle

| Signal-Draht (Viessmann) | Funktion | ESP32-Pin (Freenove Board) | Position auf dem Board |
| :--- | :--- | :--- | :--- |
| **Orange / Weiß** *(oder mit Widerstand)* | **Gemeinsamer Pluspol (`+`)** | **`3.3V`** | Linke Leiste, **3. Pin von unten** |
| **Rot** | **Hp0 (Halt)** | **`12`** (GPIO 12) | Linke Leiste, **6. Pin von unten** |
| **Grün** | **Hp1 (Fahrt)** | **`13`** (GPIO 13) | Linke Leiste, **4. Pin von unten** |
| **Gelb** *(bei 3-/4-begriffig)* | **Hp2 (Langsamfahrt)** | **`14`** (GPIO 14) | Linke Leiste, **7. Pin von unten** |
| **Weiß** *(bei Rangiersignal Sh1)* | **Sh1 (Rangierfahrt)** | **`15`** (GPIO 15) | Rechte Leiste, **3. Pin von unten** |

---

## 🛠️ 3. Schritt-für-Schritt Anschluss

1. **Gemeinsamen Draht anschließen**:
   - Stecke das gemeinsame Kabel deines Viessmann-Signals (meist orange oder mit dem Schutzwiderstands-Baustein) in den Pin **`3.3V`** am ESP32.
2. **Farben anstecken**:
   - Roter Draht ➔ in Pin **`12`**.
   - Grüner Draht ➔ in Pin **`13`**.
   - *(Optional bei 3-begriffigem Signal: Gelber Draht ➔ in Pin **`14`**)*.
3. **ESP32 mit Strom versorgen**:
   - USB-C Kabel in den Computer oder ein USB-Netzteil stecken.

---

## 💻 4. Konfiguration in TrainMaster

In TrainMaster ist das Signal **„Ausfahrsignal N1“** bereits standardmäßig für diese Belegung vorkonfiguriert:

### Einstellungen im Signal-Dialog:
- **Signal-Typ**: `WIO` (ESP32 via WLAN)
- **Baugruppe / Unit**: `33` *(oder die Unit-Nummer deines ESP32)*
- **Pin Rot**: `12`
- **Pin Grün**: `13`
- **Pin Gelb**: `14` *(optional)*
- **Pin Weiß**: `15` *(optional)*
- **Invertiert / Active Low (Gemeinsames Plus)**: **Aktiviert (Häkchen gesetzt)**

### Testen:
1. Öffne TrainMaster im Browser auf `http://localhost:5173/`.
2. Klicke auf den Reiter **Signale & Rückmelder**.
3. Scrolle zu **🚦 Signal-Steuerung & Konfiguration**:
   - Klick auf **`[🔴 Hp0]`** ➔ Die rote LED leuchtet.
   - Klick auf **`[🟢 Hp1]`** ➔ Die grüne LED leuchtet.
4. **Im Gleisplan**:
   - Klicke im Betriebsmodus einfach direkt auf das Signal im Gleisplan, um es zwischen Rot und Grün umzuschalten.
   - Bei aktiver Fahrstraße schaltet TrainMaster das Signal **vollautomatisch** auf Fahrt frei (`Hp1`) und nach Einfahrt des Zugs in den Zielblock wieder auf Halt (`Hp0`).

---

## ❓ Häufige Fragen & Fehlerbehebung (FAQ)

### Die falsche Lampe leuchtet (z. B. Rot statt Grün)
- Vertausche einfach die beiden Drähte an den Pins **`12`** und **`13`**, oder passe die Pin-Zuweisung im Signal-Dialog von TrainMaster an.

### Beide Lampen leuchten gleichzeitig oder keine leuchtet
- Prüfe, ob das Häkchen bei **Invertiert / Active Low** im Signal-Dialog gesetzt ist.
- Stelle sicher, dass der gemeinsame Draht fest in **`3.3V`** (nicht in GND) sitzt.

### Kann ich mehrere Signale an denselben ESP32 anschließen?
- **Ja!** Ein einzelner ESP32 hat über 20 freie GPIO-Pins. Du kannst problemlos 5 bis 8 vollständige Lichtsignale an einem einzigen ESP32-Board betreiben.
- Weise jedem weiteren Signal in TrainMaster einfach neue Pins zu (z. B. Signal 2: Rot = `16`, Grün = `17`, Gelb = `18`). Der gemeinsame Pluspol (`3.3V`) kann für alle Signale zusammen verwendet werden.
