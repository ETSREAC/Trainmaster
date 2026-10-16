# Requirements: 50/50-Gleisaufteilung mit dynamischem Haltepunkt

Quelle: `docs/tickets/TICKET_50_50_BLOCK_HALTEPUNKT.md`

## Einführung

Bahnhofsgleise können entweder mit **Punktmeldern** (kurze Kontakte: ENTER = Bremsbeginn, IN = Halt) oder mit **zwei Belegtmeldern** ausgestattet sein, die das Gleis an einer Teilungsmarke (Standard 50 %) aufteilen. Für die zweite Variante soll TrainMaster den Haltepunkt abhängig von der Zuglänge wählen: kurze Züge halten in Bahnsteigmitte, lange Züge ziehen bis vor das Signal vor.

Die 50/50-Logik ist **pro Block optional** (Checkbox). Ohne Häkchen verhält sich ein Block exakt wie bisher.

## Glossar

- **Punktmelder-Modus (POINT):** heutiges Verhalten. ENTER-Melder startet die BBT-Bremsrampe, IN-Melder hält die Lok sofort an.
- **50/50-Modus (SPLIT):** Der ENTER-Melder der jeweiligen Fahrtrichtung ist *Melder A* (erste Gleishälfte), der IN-Melder ist *Melder B* (ab Teilungsmarke).
- **Teilungsmarke:** Position `lengthCm × trackSplitRatio`, ab der Melder B belegt meldet.
- **Haltestrategie:** `AUTO_BY_LENGTH`, `PLATFORM_CENTER` oder `SIGNAL`.
- **Virtueller IN:** zeitgesteuertes Halt-Ereignis, das ohne physischen Melder ausgelöst wird.

## Requirement 1: Opt-in pro Block

**User Story:** Als Anlagenbetreiber möchte ich die 50/50-Logik pro Block ankreuzen, weil manche Gleise nur Punktmelder haben.

1. WHEN ein Block kein `stopMode` besitzt THEN SHALL das System ihn im Punktmelder-Modus betreiben.
2. WHEN ein Block `stopMode = 'POINT'` hat THEN SHALL sich das Brems- und Halteverhalten gegenüber Version 1.7.9 nicht ändern.
3. WHEN der Benutzer im Block-Editor „50/50-Gleisaufteilung“ ankreuzt und speichert THEN SHALL der Block mit `stopMode = 'SPLIT'` gespeichert werden und Neustarts überdauern.
4. WHEN die Checkbox nicht gesetzt ist THEN SHALL der Block-Editor die 50/50-Einstellungen ausblenden.
5. IF ein Block im SPLIT-Modus für die aktuelle Fahrtrichtung keinen oder denselben Sensor als ENTER und IN hat, ODER keine gültige Länge besitzt, THEN SHALL das System für diese Fahrt auf den Punktmelder-Modus zurückfallen und eine Warnung protokollieren.

## Requirement 2: Haltestrategie

1. WHEN `stopPolicy` fehlt THEN SHALL `AUTO_BY_LENGTH` gelten.
2. WHEN `AUTO_BY_LENGTH` gilt UND `loco.lengthCm ≤ block.lengthCm × trackSplitRatio` THEN SHALL der Zug in Bahnsteigmitte halten.
3. WHEN `AUTO_BY_LENGTH` gilt UND die Zuglänge größer ist THEN SHALL der Zug am Signal halten.
4. IF die Zuglänge unbekannt oder ≤ 0 ist THEN SHALL der Zug am Signal halten (Einfahrweichen werden sicher geräumt).
5. WHEN `PLATFORM_CENTER` bzw. `SIGNAL` gesetzt ist THEN SHALL unabhängig von der Zuglänge in der Mitte bzw. am Signal gehalten werden.

## Requirement 3: Halt in Bahnsteigmitte

1. WHEN Melder A auslöst UND die Strategie „Mitte“ ergibt THEN SHALL die BBT-Bremsrampe wie im Punktmelder-Modus starten.
2. WHEN Melder B auslöst THEN SHALL der Zug nach einer Auslaufstrecke von `lengthCm / 2 + centerStopMarginCm` hinter der Teilungsmarke anhalten (Zugmitte ≈ Teilungsmarke + Marge).
3. Akzeptanz: Ein 25-cm-Zug in einem 200-cm-Block (Marge 10 cm) hält mit der Zugmitte im Bereich 100…115 cm (im Modell ±5 cm).

## Requirement 4: Halt am Signal

1. WHEN Melder A auslöst UND die Strategie „Signal“ ergibt THEN SHALL der Zug ohne Bremsung mit seiner aktuellen Geschwindigkeit weiterfahren.
2. WHEN Melder B auslöst THEN SHALL das System eine Bremsrampe planen, sodass die Zugspitze `signalStopMarginCm` vor dem Blockende anhält, und am Ende einen virtuellen IN auslösen.
3. Akzeptanz: Ein 160-cm-Zug in einem 200-cm-Block (Signalmarge 8 cm) hält mit der Spitze im Bereich 190…195 cm (im Modell); das Zugende liegt innerhalb des Blocks.
4. IF der Zug nach Planung nicht vollständig in den Block passt THEN SHALL eine Warnung protokolliert werden.

## Requirement 5: Geschwindigkeitsmessung ohne Einmessen

1. WHEN Melder A und danach Melder B auslösen THEN SHALL das System aus der gefahrenen ersten Gleishälfte und den gesendeten Fahrstufen über die Zeit einen Umrechnungsfaktor (cm pro Fahrstufe·ms) bestimmen.
2. IF keine gültige Messung vorliegt (Melder A fehlte, Zeit ≤ 0) THEN SHALL der Zug sofort an Melder B halten (Verhalten des Punktmelder-Modus) und eine Warnung protokolliert werden.

## Requirement 6: Zweirichtungsbetrieb

1. WHEN ein Zug in Richtung `-` einfährt THEN SHALL `sensorsMinus.enter` als Melder A und `sensorsMinus.in` als Melder B gelten, mit identischer Logik.

## Requirement 7: Sicherheit & Robustheit

1. WHEN ein Not-Halt ausgelöst wird THEN SHALL jeder laufende 50/50-Halteplan sofort abgebrochen werden und kein virtueller IN mehr erfolgen.
2. WHEN Melder A oder B erneut auslösen, während für diese Lok ein Halteplan läuft, THEN SHALL das Ereignis ignoriert werden (Prellen, Wagen-Achsen).
3. WHEN eine Lok gelöscht oder ihre Bremsung abgebrochen wird THEN SHALL ihr Halteplan ebenfalls abgebrochen werden.
4. Der virtuelle IN SHALL dieselben Folgen wie ein physischer IN haben (Block belegt, vorherige Blöcke frei, Fahrstraße aufgelöst, Automatik-Ankunft).
5. Ungültige Konfigurationswerte SHALL beim Lesen auf zulässige Bereiche begrenzt werden (`trackSplitRatio` 0,2…0,8; Margen 0…100 cm).
