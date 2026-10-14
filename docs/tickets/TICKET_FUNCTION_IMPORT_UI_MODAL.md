# [Feature] Lok-Editor: Drag & Drop Dropzone für PDFs & Screenshots mit Live-Review & Icon-Mapping

**Typ:** Feature / Frontend UX & UI  
**Status:** Open / Konzipiert  
**Komponenten:** `client/src/components/LocoModal.ts`, `client/src/components/FunctionImportModal.ts`, `client/index.html`, `client/src/i18n.ts`  
**Labels:** `ui`, `frontend`, `usability`, `loco-management`

---

## 1. Problemstellung & Motivation

Damit die im Backend implementierte Extraktion ([TICKET_AI_PDF_FUNCTION_IMPORTER_BACKEND.md](TICKET_AI_PDF_FUNCTION_IMPORTER_BACKEND.md)) dem Modellbahner einen echten Wow-Effekt bietet, muss die Bedienung in der Benutzeroberfläche extrem schnell und reibungslos sein:
- Niemand möchte Dateien umständlich über verschachtelte Dateidialoge hochladen.
- Nutzer möchten oft direkt einen Screenshot aus dem PDF-Betrachter mit `Strg+V` in den Browser einfügen oder ein Handyfoto per Drag & Drop auf die Lok ziehen.
- Der Nutzer muss die erkannten Funktionen vor der Übernahme **in einer übersichtlichen Vorschau prüfen, anpassen und mit einem Klick übernehmen** können.

---

## 2. Benutzer-Workflow (User Experience)

1. **Lokomotive bearbeiten:**  
   Der Nutzer öffnet das Lok-Bearbeitungs-Modal (`🚂 Lokomotive bearbeiten`).
2. **Neuer Button:**  
   Neben den Funktionstasten befindet sich ein neuer, auffälliger Button:  
   `⚡ Funktionen aus Anleitung / Screenshot importieren (PDF/Foto)`.
3. **Die Import-Dropzone:**  
   Es öffnet sich ein moderner Dialog mit einer gestrichelten Dropzone:
   - *"PDF oder Bild hierher ziehen"*
   - *"Oder Datei auswählen"*
   - *"Oder Screenshot direkt mit Strg+V einfügen"*
   - Auf Tablets/Smartphones: Direkter Zugriff auf die Handykamera (`capture="environment"`), um den gedruckten Zettel auf dem Basteltisch abzufotografieren!
4. **Live-Ladezustand:**  
   Während der Analyse: dezente Ladeanimation (`🔍 Analysiere Anleitung & extrahiere F-Tasten...`).
5. **Der interaktive Review-Dialog:**  
   Eine interaktive Tabelle zeigt die erkannten Funktionen:
   - Checkbox zum Deaktivieren einzelner nicht gewünschter Funktionen
   - F-Taste (`F0`, `F1`, ..., `F28`)
   - Textfeld für den Namen (bereits ausgefüllt, frei editierbar)
   - Icon-Vorschau mit schnellem Dropdown-Picker (💡 Licht, 🔊 Motor, 🎺 Horn, 🪝 Kupplung, 🔔 Glocke, 🐢 Rangiergang)
   - Toggle: `Taster` (Horn) vs. `Schalter` (Dauerlicht/Motor)
6. **1-Klick-Übernahme:**  
   Klick auf `✅ Alle Funktionen übernehmen` schreibt die Konfiguration in das Lok-Formular und speichert die Lokomotive.

---

## 3. UI-Mockup & Layout-Spezifikation

```text
┌────────────────────────────────────────────────────────────────────────┐
│ ⚡ F-Tasten aus Anleitung importieren                        [✕]        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐   │
│     📄 Anleitung (PDF) oder Foto hier ablegen                          │
│     oder [Datei wählen] / [📷 Foto aufnehmen] / [Strg+V Einfügen]       │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘   │
│                                                                        │
│  Erkannte Funktionen (22 gefunden in "Roco BR 101.pdf"):               │
│                                                                        │
│  [✓]  F0   [💡 Licht]    [ Spitzensignal weiß/rot        ]  (◉ Schalter) │
│  [✓]  F1   [🔊 Sound]    [ Betriebsgeräusch              ]  (◉ Schalter) │
│  [✓]  F2   [🎺 Horn]     [ Lokpfeife hoch                ]  (◯ Taster)   │
│  [✓]  F3   [🎺 Horn]     [ Lokpfeife tief                ]  (◯ Taster)   │
│  [✓]  F4   [🐢 Rangier]  [ Rangiergang mit Rangierlicht  ]  (◉ Schalter) │
│  [✓]  F5   [💡 Licht]    [ Führerstandsbeleuchtung FS1   ]  (◉ Schalter) │
│  [✓]  F8   [🪝 Kuppl.]   [ Digitale Kupplung vorne       ]  (◯ Taster)   │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  [Abbrechen]                         [✅ 22 Funktionen übernehmen]     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Technische Komponenten

1. **Clipboard & Drag-Drop Listener:**
   - Event-Listener auf `window.addEventListener('paste', ...)`: Fängt Bilddaten aus der Windows-Zwischenablage ab (z. B. nach `Win + Shift + S`).
   - Drag-Over / Drop Highlights mit CSS-Animation (`border-color: #58a6ff`).
2. **Kamera-Unterstützung (Mobile Web API):**
   - `<input type="file" accept="image/*,application/pdf" capture="environment">` ermöglicht das direkte Abfotografieren der gedruckten Lok-Anleitung am Smartphone/Tablet.
3. **Lokales Client-Fallback (Zero-Cloud Option):**
   - Falls der Nutzer offline ist: Einfache PDFs können clientseitig über das bereits vorhandene `pdfjs-dist` (oder native Web-Worker) im Browser geparst werden.

---

## 5. Mehrsprachigkeit (`i18n.ts`)

Alle neuen Strings werden zweisprachig (Deutsch & Englisch) angelegt:
- `loco.btn_smart_import`: *"⚡ Aus Anleitung / Foto importieren"* / *"⚡ Import from manual / photo"*
- `import.dropzone_title`: *"PDF oder Foto hier ablegen"* / *"Drop manual PDF or photo here"*
- `import.analyzing`: *"Analysiere Dokument..."* / *"Analyzing document..."*
- `import.btn_apply`: *"Funktionen übernehmen"* / *"Apply functions"*
- `import.momentary_hint`: *"Taster (Horn/Kupplung)"* / *"Momentary (Horn/Coupler)"*

---

## 6. Akzeptanzkriterien

- [ ] Drag & Drop von PDF- und Bilddateien (.png, .jpg) funktioniert zuverlässig.
- [ ] Einfügen via `Strg+V` aus der Zwischenablage öffnet direkt die Erkennung.
- [ ] Der Review-Dialog erlaubt das Ändern jedes Texts, Icons und des Taster/Schalter-Status.
- [ ] Nach Klick auf "Übernehmen" sind alle Funktionen sofort im Lok-Fahrregler (Throttle) mit Name und passendem Icon verfügbar.
