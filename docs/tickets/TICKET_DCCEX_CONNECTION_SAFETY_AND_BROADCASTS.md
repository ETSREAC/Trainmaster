# [Safety] DCC-EX: Verbindungsabbruch im Automatikbetrieb, Lok-Broadcasts auswerten, aktuelle Befehlsform

**Typ:** Safety / Hardware-Treiber / Protokollkonformität  
**Status:** Open / Konzipiert  
**Priorität:** Hoch (Betriebssicherheit)  
**Komponenten:** `server/src/hal/DccExDriver.ts`, `server/src/hal/ICommandStation.ts`, `server/src/engine/LocoManager.ts`, `server/src/engine/RouteEngine.ts`, `server/src/engine/BBTEngine.ts`, `server/src/engine/SplitBlockEngine.ts`, `server/src/index.ts`, `client/src/main.ts`  
**Labels:** `safety`, `dcc-ex`, `hardware`, `automation`, `protocol`

**Quelle:** Hinweise von Harald (DCC-EX-Team) im Forum, [DCC-EX Technical Reference for Throttle Developers](https://dcc-ex.com/throttles/tech-reference.html)

---

## 1. Problembeschreibung & Motivation

### 1.1 Zentrale merkt nicht, wenn TrainMaster ausfällt

Das DCC-EX-Protokoll kennt laut Doku weder das „Übernehmen“ einer Lok durch einen Regler noch das Trennen eines Reglers. Bricht die Verbindung ab (WLAN weg, USB-Kabel gezogen, PC hängt), wiederholt die Zentrale die letzten Fahrbefehle einfach weiter. Im Automatikbetrieb heißt das:

- Züge fahren mit der letzten Fahrstufe weiter.
- Die ESP32-Melder melden zwar weiter an TrainMaster, aber TrainMaster kann ohne Verbindung keine Bremsung und keinen Halt mehr auslösen.
- Laufende BBT-Rampen und 50/50-Haltepläne senden ins Leere.

Ein Heartbeat wie bei WiThrottle (Zentrale hält Loks an, wenn sich der Regler nicht mehr meldet) existiert im DCC-EX-Protokoll nicht. Das DCC-EX-Team weist darauf hin, dass das wegen fehlender Lok-Zuordnung nicht trivial ist. **Dieses Problem kann TrainMaster nicht vollständig lösen**, aber den Schaden begrenzen und sauber wieder anlaufen.

### 1.2 Fahrbefehle anderer Regler werden ignoriert

Die Zentrale sendet bei jeder Lokänderung eine Broadcast-Meldung `<l cabid slot speedbyte functionMap>` an alle verbundenen Clients. TrainMaster wertet diese nicht aus. Folgen:

- Steuert jemand eine Lok mit dem CrowPanel-Drehregler, Engine Driver o. Ä., zeigt TrainMaster eine falsche Fahrstufe/Richtung/Funktion an.
- BBT-Lernwerte und die 50/50-Geschwindigkeitsmessung basieren auf falschen Fahrstufen.
- Die Automatik kann eine Lok als „steht“ betrachten, obwohl sie fährt.

### 1.3 Veraltete Befehlsform und Wertebereich

- TrainMaster sendet `<t 1 ADRESSE FAHRSTUFE RICHTUNG>`. Laut Doku ist `<t reg cab speed dir>` **als Legacy markiert (deprecated)**; aktuell ist `<t cab speed dir>`.
- Gleiches gilt für den Einzel-Not-Halt: heute `<t 1 ADRESSE -1 1>`, aktuell `<t ADRESSE -1 RICHTUNG>`.
- **Wertebereich:** DCC-EX erwartet `speed` 0–127 (−1 = Not-Halt). `LocoManager.setSpeed` begrenzt aber auf 0–**128**. Fahrstufe 128 ist damit außerhalb des gültigen Bereichs und muss auf 127 begrenzt werden.

### 1.4 Fakten aus der DCC-EX-Doku (geprüft am 16.10.2026)

Quellen: [Technical Reference for Throttle Developers](https://dcc-ex.com/throttles/tech-reference.html), [Native Commands Summary](https://dcc-ex.com/reference/software/command-summary-consolidated.html). Zusammenfassung in eigenen Worten:

- Es gibt kein Konzept „Regler übernimmt Lok“ und keins „Regler trennt sich“.
- Ein Regler muss alles, was er nicht versteht, still ignorieren.
- Gleisspannung hat drei Zustände: Ein, Aus, **Unbekannt**. Zu Beginn gilt „Unbekannt“, bis ein `<p…>` kommt (passt zu `lastPower = null` aus v1.8.0).
- Jeder Lokbefehl von irgendeinem Gerät löst den Broadcast `<l cab reg speedByte functMap>` an alle aus. `reg` hat keine Bedeutung mehr.
- `speedByte` kodiert Richtung und Fahrstufe: rückwärts 0 = Halt, 1 = Not-Halt, 2–127 = Fahrstufe 1–126; vorwärts 128 = Halt, 129 = Not-Halt, 130–255 = Fahrstufe 1–126.
- `functMap` ist eine Bitmaske der aktiven Funktionen (Bit 0 = F0, Bit 1 = F1 …).
- `<t cab>` fordert gezielt den aktuellen Stand einer Lok an (Antwort als `<l …>`).
- `<!>` sendet für jede Lok in der Reminder-Liste ein `<l …>`.
- `<F cab funct state>` unterstützt F0–F68.
- Weitere relevante Befehle: `<- [cab]>` (Lok aus der Reminder-Liste entfernen), `<m …>` (Momentum in der Zentrale), `<JR>` (Roster der Zentrale).

---

## 2. Lösungsansatz

### 2.1 Verhalten bei Verbindungsverlust (Kern dieses Tickets)

Neuer Systemzustand **„Zentrale getrennt“**, ausgelöst durch `onConnectionChanged(false)`:

1. **Automatik sofort stoppen** (keine neuen Abfahrten), laufende Fahrstraßen bleiben verriegelt (wie bei CR-04).
2. **Alle BBT-Rampen und 50/50-Haltepläne abbrechen** (`bbtEngine.cancelAll()`, `splitEngine.cancelAll()`), damit beim Wiederverbinden keine veralteten Schritte nachgesendet werden.
3. **Neue Fahrbefehle blockieren**, solange keine Verbindung besteht (analog zum Not-Halt, mit eigener Meldung).
4. **Deutliche Anzeige in der Oberfläche**: Banner „Verbindung zur Zentrale verloren – Züge fahren evtl. unkontrolliert weiter!“ mit Hinweis, die Gleisspannung an der Zentrale abzuschalten.
5. **Optional, nach Rücksprache mit DCC-EX:** Wenn Melder einen Zug in einen belegten oder nicht reservierten Block melden, Warnung „Geisterzug bei getrennter Zentrale“ statt stiller Annahme.

Beim **Wiederverbinden**:

1. Als Erstes für alle Loks mit gespeicherter Fahrstufe > 0 die Fahrstufe 0 senden (kontrollierter Halt), alternativ globaler Not-Halt `<!>` – Entscheidung in der Spec.
2. Aktuellen Zustand von der Zentrale holen (`<s>` einmalig, `<t cabid>` je bekannter Lok) und mit dem eigenen Zustand abgleichen.
3. Lokfunktionen wiederherstellen (bereits umgesetzt in v1.8.0).
4. Automatik **nicht automatisch fortsetzen**. Der Bediener bestätigt bewusst („Anlage geprüft, weiter“), weil Züge in der Zwischenzeit unbeobachtet gefahren sein können.

Gilt für **TCP und seriell**. USB-Abzug wird heute über das `close`-Event erkannt, eine hängende Zentrale über den seriellen Timeout aus v1.8.0.

### 2.2 `<l>`-Broadcasts auswerten

- Parser im `DccExDriver` für `<l cab reg speedByte functMap>` nach Abschnitt 1.4: Richtung = `speedByte >= 128`, Stufe = `speedByte & 0x7F` mit 0 → Halt, 1 → Not-Halt, 2–127 → Fahrstufe 1–126; `functMap` bitweise auf F0…Fn abbilden.
- Umrechnung DCC-Fahrstufe (1–126) ↔ TrainMaster-Fahrstufe festlegen und testen.
- Neues Callback `onLocoStateReported(address, speed, direction, functions)` in `ICommandStation`.
- `LocoManager.applyExternalState(...)`: übernimmt den Zustand **ohne** ihn erneut an die Zentrale zu senden (keine Echo-Schleife über `onSpeedChanged`).
- Eigene Befehle erzeugen ebenfalls ein Broadcast-Echo. Echos, die dem gerade gesendeten Wert entsprechen, werden ignoriert.
- **Eingriff während der Automatik:** Ändert ein fremder Regler die Fahrstufe einer Lok, die gerade eine Fahrstraße, BBT-Rampe oder einen 50/50-Halteplan fährt, wird der Plan für diese Lok abgebrochen und eine Warnung angezeigt („Manueller Eingriff an Lok X“). Ob die Fahrstraße bestehen bleibt, ist in der Spec zu entscheiden.

### 2.3 Aktuelle Befehlsform

- `setLocoSpeed`: `<t ADRESSE FAHRSTUFE RICHTUNG>` statt `<t 1 …>`, Fahrstufe auf 0–127 begrenzen.
- `emergencyStop(address)`: `<t ADRESSE -1 RICHTUNG>`.
- Mindestversion der DCC-EX-Firmware dokumentieren, ab der die neue Form gilt (Frage an das DCC-EX-Team).

### 2.4 Offene Fragen an das DCC-EX-Team (Discord)

- Gibt es eine empfohlene Vorgehensweise für Automatik-Software bei Verbindungsverlust?
- Stoppt der eingebaute WiThrottle-Server der DCC-EX Loks bei ausbleibendem Heartbeat? (In der Doku nicht gefunden.) Falls ja: Wäre eine Anbindung über WiThrottle statt Native Protocol für den Automatikbetrieb sicherer?
- Ab welcher Firmware-Version ist `<t cabid speed dir>` die empfohlene Form?

### 2.5 Support-Entlastung für DCC-EX

- In README und Einstellungen klarstellen: Fragen zu TrainMaster bitte im TrainMaster-Repo/Forum, nicht beim DCC-EX-Support.
- Beim Verbinden die Firmware-Version (`<iDCC-EX …>`) protokollieren und unbekannte/zu alte Versionen mit Hinweis loggen.

---

## 3. Implementierungs-Schritte

- [ ] **Spec** (`.kiro/specs/dccex-connection-safety/`): Requirements, Design inkl. Entscheidung Halt vs. `<!>` beim Wiederverbinden und Verhalten bei manuellem Eingriff.
- [ ] **Treiber:** `<l>`-Parser, `onLocoStateReported`, neue `<t>`-Form, Einzel-Not-Halt prüfen.
- [ ] **LocoManager:** `applyExternalState` ohne Rücksendung, Echo-Unterdrückung.
- [ ] **index.ts:** Zustand „Zentrale getrennt“, Automatik stoppen, Pläne abbrechen, Fahrbefehle blockieren; Wiederverbinde-Ablauf mit Halt, Abgleich und Bestätigung.
- [ ] **Automatik:** Abbruch von Fahrstraße/BBT/50/50-Plan bei manuellem Eingriff.
- [ ] **Client:** Banner „Zentrale getrennt“, Bestätigungsdialog zum Fortsetzen der Automatik, DE/EN-Texte.
- [ ] **Doku:** README-Hinweis zum Support, Mindest-Firmware.
- [ ] **Tests:** siehe Abschnitt 4.

---

## 4. Tests

**Automatisiert** (Node-Testrunner, simulierter Transport und Uhr):
- `<l>`-Parser: Vorwärts/Rückwärts, Halt, Not-Halt-Wert, Funktionsbits F0–F28, ungültige/teilweise Meldungen.
- Kein Echo: eigener Fahrbefehl + passendes Broadcast erzeugt keinen erneuten Sendebefehl.
- Fremder Fahrbefehl während BBT-Rampe bricht die Rampe ab.
- Verbindungsverlust während Automatik: Automatik aus, Pläne abgebrochen, Fahrbefehle blockiert.
- Wiederverbinden: zuerst Halt für fahrende Loks, dann Abgleich; Automatik bleibt aus bis zur Bestätigung.

**Auf der Anlage** (kontrolliert, eine Lok, niedrige Fahrstufe, Hand an der Gleisspannung):
- WLAN der Zentrale während einer Fahrt trennen und wiederherstellen.
- USB-Kabel während einer Fahrt ziehen und wieder einstecken.
- TrainMaster-Prozess während einer Fahrt beenden und neu starten.
- Lok per CrowPanel-Drehregler steuern und prüfen, ob TrainMaster Fahrstufe/Richtung/Licht korrekt anzeigt.

---

## 5. Akzeptanzkriterien

1. Bei Verbindungsverlust im Automatikbetrieb stoppt TrainMaster innerhalb von 2 s die Automatik, bricht alle Rampen/Pläne ab und zeigt eine deutliche Warnung.
2. Nach dem Wiederverbinden erhalten alle zuvor fahrenden Loks zuerst Fahrstufe 0 (bzw. Not-Halt), bevor irgendein anderer Fahrbefehl gesendet wird.
3. Die Automatik startet nach einem Verbindungsverlust nur nach ausdrücklicher Bestätigung.
4. Fahrstufe, Richtung und Funktionen, die ein anderer Regler setzt, werden in TrainMaster binnen 1 s korrekt angezeigt, ohne dass TrainMaster den Befehl erneut sendet.
5. Ein manueller Eingriff an einer Lok in einer laufenden Automatikfahrt bricht deren Bremsrampe/Halteplan ab und wird protokolliert.
6. Fahrbefehle verwenden die aktuelle Form `<t ADRESSE FAHRSTUFE RICHTUNG>` und senden nie eine Fahrstufe > 127.
