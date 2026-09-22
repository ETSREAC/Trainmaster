# 🎛️ Stream Deck XL & Drehregler-Stellpult: TrainMaster Controller

> **Vollständiges Konzept, Plugin-Anleitung und 3D-Druck-Halterung für das ultimative Modellbahn-Schreibtisch-Stellpult.**  
> Kombiniert das **Elgato Stream Deck XL (32 Tasten)** mit dem **kabellosen Brimford RGB-Drehregler-Puck**.

---

## 🌟 1. Das Konzept: Warum diese Kombination unschlagbar ist

Anstatt ein komplettes Handgerät von Hand zu löten und zu verkabeln, verwandeln wir dein **Stream Deck XL** und den **Brimford RGB-Drehregler** in ein professionelles High-End-Stellpult:

```text
┌─────────────────────────────────────────────────────────┬────────────────────────┐
│               ELGATO STREAM DECK XL                     │  BRIMFORD DREHREGLER   │
│             (32 Vollfarb-LCD-Tasten)                    │ (Alu-Puck mit RGB-Ring)│
├─────────────────────────────────────────────────────────┼────────────────────────┤
│ • Echte Lok-Fotos & Baureihen (BR 101, ICE, V 200)      │                        │
│ • Live-Tacho & Geschwindigkeitsanzeige                  │   ┌────────────────┐   │
│ • Fahrtrichtungspfeile (▲ Vorwärts / ▼ Rückwärts)       │   │    Massiver    │   │
│ • F-Tasten (F0 Licht, F1 Sound, F2 Horn, etc.)          │   │ Alu-Drehknopf  │   │
│ • Weichenstellung (Gerade / Abzweig) live               │   │  (Stufenlos)   │   │
│ • ⚡ Gleisstrom AN/AUS & 🛑 Roter NOT-HALT              │   └────────────────┘   │
│ • 🤖 Automatik-/Aquarium-Fahrbetrieb                    │   ░░░ RGB-Halo ░░░     │
└─────────────────────────────────────────────────────────┴────────────────────────┘
```

---

## 🚀 2. Das TrainMaster Stream Deck Plugin

Wir haben ein natives **Elgato Stream Deck Plugin** (`com.etsreac.trainmaster.sdPlugin`) entwickelt, das direkt per WebSocket mit dem TrainMaster Backend (`ws://localhost:3001`) kommuniziert!

### 📥 Enthaltene Stream Deck Aktionen:
1. **⚡ Gleisstrom (Power)**: Zeigt live an, ob Fahrstrom auf den Schienen ist (Grün = AN, Grau = AUS). Ein Klick schaltet den Strom um.
2. **🛑 Not-Aus (E-Stop)**: Rote Taste mit Warn-Status. Ein Klick friert alle Züge sofort ein!
3. **🤖 Automatik-Modus**: Schaltet den vollautomatischen Zugsicherungs- und Fahrbetrieb (Aquarium-Modus) an/aus.
4. **🚂 Lokomotive auswählen**: Zeigt Lokname, DCC-Adresse, Fahrtrichtungspfeil und Live-Geschwindigkeit (z. B. `BR 101\n▲ 85 km/h`). Klick wählt diese Lok als aktive Lokomotive aus (wird mit blauem Rand hervorgehoben!).
5. **💡 Lok-Funktion (F0 - F28)**: Schaltet Spitzenlicht (F0), Motor-Sound (F1), Horn (F2), Glocke (F3), etc. Taste leuchtet bernsteinfarben auf, wenn aktiv!
6. **🔄 Fahrtrichtung**: Schaltet die Fahrtrichtung der aktiven Lok zwischen Vorwärts und Rückwärts um.
7. **🔀 Weiche stellen**: Zeigt die Lage einer Weiche an (Gerade / Abzweig) und schaltet sie per Tastendruck um.
8. **➕ Beschleunigen (+)**: Erhöht die Fahrstufe der aktiven Lok (+1, +5, +10, +20 im Property Inspector wählbar) mit dynamischer Live-Tachoanzeige `+5 [45]`.
9. **➖ Bremsen (-)**: Verringert die Fahrstufe der aktiven Lok (-1, -5, -10, -20 im Property Inspector wählbar) mit dynamischer Live-Tachoanzeige `-5 [45]`.
10. **⏹️ Halt (0 km/h)**: Sofortiger Zughalt der aktiven Lok auf Fahrstufe 0 (leuchtet rot bei Fahrt, grau bei Stillstand `HALT [0]`).
11. **🚀 Geschwindigkeits-Preset**: Springt sofort auf vMin (Rangiergang), vMid (Reisefahrt), vMax (Höchstgeschwindigkeit) oder benutzerdefinierte Stufen (50, 100, 128). Taste leuchtet blau auf, wenn der Zug exakt dieses Tempo fährt!
12. **🧭 Gleisplan Navigation (D-Pad)**: Verschiebt das Sichtfenster des Live-Gleisplans auf dem Stream Deck (Hoch ⬆️, Runter ⬇️, Links ⬅️, Rechts ➡️ oder Home 🏠). Zeigt die aktuellen Koordinaten live an.
13. **🗺️ Gleisplan Kachel (Live-Gitter)**: Stellt eine Kachel des echten Modellbahn-Gleisplans auf dem Tastendisplay dar. Erkennt die Position im Raster automatisch! Zeigt Gleise, Weichenstellung, Signale mit Signalbegriff (🔴 HP0, 🟢 HP1, 🟡 HP2), Rückmelder und belegte Blöcke. **Klick auf eine Weiche schaltet sie sofort um; Klick auf ein Signal wechselt den Signalbegriff!**

---

## 📋 3. Empfohlene Tastenbelegungen (Stream Deck XL Layouts)

### Layout A: Mit Brimford Drehregler-Puck (Knob steuert Speed)
```text
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ ⚡ POWER │ 🛑 NOTAUS│ 🤖 AUTO  │ 🔄 RICHT │ 🚂 LOK 1 │ 🚂 LOK 2 │ 🚂 LOK 3 │ 🚂 LOK 4 │ <-- System & Loks
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 💡 F0 LCT│ 🔊 F1 SND│ 📢 F2 HRN│ 🔔 F3 GLC│ 🚂 LOK 5 │ 🚂 LOK 6 │ 🚂 LOK 7 │ 🚂 LOK 8 │ <-- Sound & Loks
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ ⚡ F4 LÜF│ 🎺 F5 PFF│ 🛋️ F6 KAB│ 🔗 F7 KUP│ 🔀 W 1   │ 🔀 W 2   │ 🔀 W 3   │ 🔀 W 4   │ <-- F-Tasten & Weichen
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 💡 F8 FRN│ 🚂 F9 KRV│ 🗣️ F10ANS│ ⏹️ STOP 0│ 🔀 W 5   │ 🔀 W 6   │ 🔀 W 7   │ 🔀 W 8   │ <-- Weichen & Stop
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

### Layout B: Pure Fahrertasten (OHNE Drehregler – Alles direkt auf dem Stream Deck)
Für alle, die keinen externen Drehregler anschließen möchten, bieten die 4 Fahrtasten vollwertige Führerstandskontrolle:
```text
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ ⚡ POWER │ 🛑 NOTAUS│ 🤖 AUTO  │ 🔄 RICHT │ ➕ FAHRT+│ 🚀 REISE │ 🚂 LOK 1 │ 🚂 LOK 2 │ <-- Fahrschalter & Loks
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 💡 F0 LCT│ 🔊 F1 SND│ 📢 F2 HRN│ ⏹️ HALT 0│ ➖ FAHRT-│ 🚀 MAX   │ 🚂 LOK 3 │ 🚂 LOK 4 │ <-- Fahrschalter & Loks
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ ⚡ F4 LÜF│ 🎺 F5 PFF│ 🛋️ F6 KAB│ 🔗 F7 KUP│ 🔀 W 1   │ 🔀 W 2   │ 🔀 W 3   │ 🔀 W 4   │ <-- F-Tasten & Weichen
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 💡 F8 FRN│ 🚂 F9 KRV│ 🗣️ F10ANS│ 🔔 F3 GLC│ 🔀 W 5   │ 🔀 W 6   │ 🔀 W 7   │ 🔀 W 8   │ <-- Weichen & Sound
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

### Layout C: Interaktives Gleisbildstellpult (Live-Gleisplan mit D-Pad-Navigation)
Verwandelt dein Stream Deck XL in ein vollinteraktives Fahrdienstleiter-Pult:
```text
┌──────────┬──────────────────────────────────────────────────────────────────────┐
│ Spalte 1 │ Spalte 2 bis 8: Interaktive Live-Gleisplan-Kacheln (7 × 4 Viewport)  │
├──────────┼──────┬──────┬──────┬──────┬──────┬──────┬────────────────────────────┤
│  ▲ HOCH  │  ══  │  ══  │  🔀  │  ══  │  🟢  │  ══  │  [Kachel (6, 0)]            │
├──────────┼──────┼──────┼──────┼──────┼──────┼──────┼────────────────────────────┤
│  ▼ RUNTER│  ║   │      │  ║   │      │      │  ║   │  [Kachel (6, 1)]            │
├──────────┼──────┼──────┼──────┼──────┼──────┼──────┼────────────────────────────┤
│  ◀ LINKS │  ╔══ │  ══  │  ╝   │  ══  │  🔴  │  ══  │  (Block belegt 🔴 ICE 1)    │
├──────────┼──────┼──────┼──────┼──────┼──────┼──────┼────────────────────────────┤
│  ▶ RECHTS│  [X,Y] Koordinaten & Weichen schalten per Fingertipp                 │
└──────────┴──────────────────────────────────────────────────────────────────────┘
```
- **Spalte 1 (links)**: Belege alle 4 Tasten mit **`Gleisplan Navigation (D-Pad)`**. Im Auto-Modus sind sie automatisch als **Hoch (Zeile 0)**, **Runter (Zeile 1)**, **Links (Zeile 2)** und **Rechts (Zeile 3)** konfiguriert.
- **Spalten 2 bis 8 (28 Tasten)**: Belege alle restlichen Tasten mit **`Gleisplan Kachel (Live)`**. Das Plugin erkennt die Spalten und Zeilen automatisch und projiziert den passenden Gleisausschnitt darauf.
- **Interaktivität**:
  - Tippe auf eine **Weiche**: Die Weiche schaltet sofort auf deiner Modellbahn um und wechselt ihre Farbe live auf dem Tastendisplay!
  - Tippe auf ein **Signal**: Schaltet den Signalbegriff durch (Hp0 ⇄ Hp1 ⇄ Hp2).
  - Tippe auf einen **Block**: Wählt den darin befindlichen Zug als aktive Lokomotive aus.

---

## ⚙️ 4. Belegung des Brimford RGB-Drehregler-Pucks

In der Begleit-Software des Brimford-Drehreglers stellst du einfach folgende Tastatur-Shortcuts ein (diese sind in TrainMaster bereits voll integriert):

| Aktion am Puck | Tastatur-Kürzel | Wirkung in TrainMaster |
|---|:---:|---|
| **Drehen im Uhrzeigersinn** ↷ | `BildAuf` (PageUp) oder `W` | Aktive Lokomotive beschleunigen (+5 Fahrstufen) |
| **Drehen gegen Uhrzeigersinn** ↶ | `BildAb` (PageDown) oder `S` | Aktive Lokomotive abbremsen (-5 Fahrstufen) |
| **Knopf drücken (Klick)** 🔘 | `Pos1` (Home) oder `X` | Soforthalt der aktiven Lok (Fahrstufe 0) |
| **Knopf Doppelklick** | `Leertaste` (Space) | 🛑 Gesamte Anlage NOT-HALT |

---

---

## 🛠️ 5. Installation & Inbetriebnahme (In 2 Minuten)

Das Plugin wurde bereits direkt in dein Stream Deck Plugin-Verzeichnis installiert:
`C:\Users\etswr\AppData\Roaming\Elgato\StreamDeck\Plugins\com.etsreac.trainmaster.sdPlugin`

*(Falls du es später erneut installieren möchtest, reicht ein Doppelklick auf [`install_streamdeck_plugin.bat`](file:///c:/Users/etswr/Downloads/TrainMaster/install_streamdeck_plugin.bat))*

### So aktivierst du es:
1. **Stream Deck App neu starten:**
   * Klicke unten rechts im Windows-Infobereich (Tray) mit der rechten Maustaste auf das Stream Deck Icon und wähle **Beenden**.
   * Starte die Stream Deck App über das Startmenü neu.
2. **TrainMaster-Kategorie entdecken:**
   * Rechts in der Aktionsleiste von Stream Deck findest du nun die neue Kategorie **`TrainMaster`**!
3. **Tasten belegen:**
   * Ziehe die gewünschten Aktionen (z. B. *Gleisstrom*, *Not-Aus*, *Lok auswählen*, *Lok-Funktion*) per Drag & Drop auf deine 32 Tasten.
4. **Fahrbetrieb starten:**
   * Starte TrainMaster über **`start.bat`**.
   * Sobald TrainMaster läuft, erwachen alle Tasten auf deinem Stream Deck XL sofort zum Leben!

---

## 🖨️ 6. Die 3D-Druck-Halterung (Duo-Stellpult-Konsole)

Damit beide Geräte wie aus einem Guss auf deinem Schreibtisch stehen, haben wir eine maßgeschneiderte Pult-Halterung konstruiert:

* **Datei:** [`hardware/enclosure/streamdeck_xl_dock/sd_xl_puck_console.stl`](file:///c:/Users/etswr/Downloads/TrainMaster/hardware/enclosure/streamdeck_xl_dock/sd_xl_puck_console.stl)
* **Design-Merkmale:**
  * **Ergonomischer 17.5°-Pultwinkel:** Beide Geräte sind leicht zum Fahrer geneigt für perfekte Ablesbarkeit und ermüdungsfreie Handhaltung.
  * **Linke Schale (Stream Deck XL):** Passgenaue 184 × 114 mm Einbuchtung mit Kabelkanal nach hinten.
  * **Rechte Schale (Brimford Puck):** 66 mm runde Vertiefung für den Aluknopf mit eigenem Kabelschacht.
  * **Drucktipp für Bambu Studio:** Das Modell ist 260 mm breit. Auf der 256 × 256 mm Platte deines Bambu Lab Druckers drehst du das Modell einfach um **45° diagonal** auf dem Druckbett (die Diagonale beträgt 362 mm, passt also mit riesigem Freiraum problemlos drauf!).
  * **Material & Profil:** PLA Basic oder PETG, 0.20 mm Standard, 15 % Infill, keine Stützen nötig!
