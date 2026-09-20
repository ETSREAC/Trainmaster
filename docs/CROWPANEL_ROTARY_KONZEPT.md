# 🎛️ CrowPanel 1.28" Rotary Display: TrainMaster Fahrregler-Konzept

> **Konzept & Steuerungslogik für das Elecrow CrowPanel 1.28-Zoll ESP32-S3 Rotary Touch Display (240×240 IPS)**  
> Kompakter Funk-Fahrregler (oder Desktop-Puck) mit Fokus auf **reinem Fahrbetrieb, perfekter Haptik und intuitiver Gestensteuerung**.

---

## 🎯 1. Die Design-Philosophie: Maximale Ergonomie

Wie von dir vollkommen richtig erkannt:
* **Keine Weichen:** Auf einem 32 mm runden Display wäre ein Gleisbildstellwerk viel zu klein und fummelig. Weichen steuerst du 100× bequemer über das danebenliegende Stream Deck XL oder das Web-Gleisbildstellpult.
* **Keine Lok-Fotos:** Auf einem 240×240 Runddisplay sehen Fotos oft verzerrt oder abgeschnitten aus. Stattdessen setzen wir auf **große, kontrastreiche High-End Typografie** (Lok-Name, DCC-Adresse, Tacho), die man auch aus einem Meter Entfernung sofort ablesen kann.
* **Fokus 100 % aufs Fahren:** Beschleunigen, Bremsen, Rangieren, Wenden, Soforthalt und Lokwechsel.

---

## ⚙️ 2. Die Steuerungs-Mechanik: Drehregler, Knopf & Touch

Das Modul besitzt **drei Bedienelemente**, die perfekt ineinandergreifen:

### A. Der Endlos-Drehregler (Encoder-Ring)
* **Rechtsdreh (Uhrzeigersinn ↷):**
  * Fahrstufe erhöhen (+2 bei normalem Drehen, +5 bei schnellem Drehen für dynamische Beschleunigung).
  * Maximalwert: 128 (bzw. konfigurierte `vMax` der Lok).
* **Linksdreh (Gegen Uhrzeigersinn ↶):**
  * Fahrstufe verringern (-2 bzw. -5).
  * Bremst sauber bis auf Fahrstufe 0 ab.
  * **Wichtig:** Beim Weiterdrehen unter 0 bleibt der Zug bei 0 stehen – **kein versehentliches Rückwärtsfahren** oder Ruckeln!
* **Im Menü:** Scrollt durch die Lokomotiven-Liste.

---

### B. Der integrierte Knopf (Klick auf das Display) – „Kontext-Klick“
Der Drucktaster hat zwei geniale Funktionen, die sich am aktuellen Fahrzustand orientieren:

1. **Wenn der Zug fährt (`Speed > 0`):**
   * **Kurzer Klick:** ⏹️ **SOFORTHALT / STOPP**  
     *(Der Zug stoppt sofort sanft auf Fahrstufe 0. Das ist der intuitive „Schreck-Reflex“-Halt, ohne dass man die ganze Anlage per Not-Aus lahmlegt!)*
2. **Wenn der Zug steht (`Speed == 0`):**
   * **Kurzer Klick:** 🔄 **FAHRTRICHTUNGSWECHSEL**  
     *(Kehrt die Fahrtrichtung um: `VORWÄRTS ▲` ⇄ `RÜCKWÄRTS ▼`. Die Tacho-Farbe und Pfeile wechseln sofort).*
3. **Langer Klick (1,5 Sekunden gedrückt halten):**
   * 🛑 **ANLAGEN-NOT-AUS**  
     *(Schaltet den Gleisstrom der gesamten Anlage aus bzw. wieder ein).*

---

### C. Der runde kapazitive Touchscreen (Wischgesten)
Dank des Touchscreens brauchst du keine zusätzlichen Tasten:

* **Horizontal Wischen (◀️ Nach links / ▶️ Nach rechts):**
  * Wechselt direkt zur **nächsten / vorherigen Lokomotive** im TrainMaster-Fuhrpark!
  * Display animiert flüssig zur neuen Lok, Drehregler steuert sofort diese Lok.
* **Wisch nach oben (🔼 Swipe Up):**
  * Öffnet die **Lok-Auswahlliste** (Menü mit allen Loks, DCC-Adressen).
  * Kann per Touch angetippt oder mit dem Drehregler durchgescrollt + geklickt werden.
* **Wisch nach unten (🔽 Swipe Down):**
  * Öffnet das **Schnellfunktions-Panel** (4 große Kacheln: 💡 F0 Licht, 🔊 F1 Sound, 📢 F2 Horn, 🐢 F3 Rangiergang).
* **Tap auf den Richtungspfeil:**
  * Schaltet ebenfalls die Fahrtrichtung um.

---

## 🖥️ 3. Display-Layout (240×240 IPS Round Screen)

```text
               ┌───────────────────────┐
            ╱           DB BR 218         ╲    <-- Lok-Name (Text)
          ╱             DCC #218            ╲   <-- DCC-Adresse
        │     ╭─────────────────────────╮     │
        │    │          ╭─────╮          │    │ <-- Dynamischer Tacho-Bogen
       │    │          │  65  │           │    │     (Cyan = Vorwärts,
       │    │          │ km/h │           │    │      Orange = Rückwärts)
       │    │          ╰─────╯            │    │ <-- Große km/h Ziffer
        │    │                           │    │
        │     ╰─────────────────────────╯     │
          ╲     ▲ VOR       ⚡       💡     ╱   <-- Status-Leiste:
            ╲  (Richtung) (Strom)  (Licht)  ╱        Richtung | Strom | Licht
               └───────────────────────┘
```

### Farblogik:
* **Cyan / Blau:** Zug fährt vorwärts (`▲ VOR`).
* **Bernstein / Orange:** Zug fährt rückwärts (`▼ ZUR`).
* **Rot pulsierend:** Zug oder Anlage im Halt (`🛑 HALT`).
* **Grünes ⚡ Icon:** Fahrstrom eingeschaltet.

---

## 📡 4. Kommunikation mit TrainMaster (Kabellos oder USB)

* **WLAN-Betrieb (Wireless Handregler):**
  * Der ESP32-S3 verbindet sich mit deinem Heim-WLAN.
  * Öffnet einen direkten WebSocket zu TrainMaster (`ws://<PC-IP>:3001`).
  * Sobald du am Drehregler drehst, sendet er:
    ```json
    { "type": "SET_LOCO_SPEED", "payload": { "locoId": "loco-br-218", "speed": 45, "direction": "FWD" } }
    ```
  * TrainMaster spiegelt Geschwindigkeiten von Automatikfahrten oder dem Stream Deck in Echtzeit auf das Display zurück!
* **USB-Betrieb (Desktop-Puck am PC):**
  * Kann alternativ auch einfach per USB am PC bleiben und serielle Steuerkommandos senden.

---

## 🚀 5. Nächster Schritt bei Ankunft
Sobald das Paket da ist, brauchst du es nur per USB anzuschließen:
1. Wir stellen einen fertigen PlatformIO-Ordner `firmware/crowpanel_rotary/` bereit.
2. 1-Klick Flash über VS Code / PlatformIO.
3. WLAN-Zugangsdaten eingeben – und dein Pult-Display läuft!
