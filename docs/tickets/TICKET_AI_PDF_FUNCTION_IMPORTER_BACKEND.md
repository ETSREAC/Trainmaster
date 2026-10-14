# [Feature] Smart Function Parser: Automatisches Auslesen von Funktionstasten (F0–F28) aus PDF-Anleitungen & Screenshots

**Typ:** Feature / Automation & Usability  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/services/FunctionExtractorService.ts`, `server/src/routes/importRouter.ts`, `server/src/types.ts`  
**Labels:** `enhancement`, `loco-management`, `ai-import`, `pdf-ocr`

---

## 1. Problemstellung & Motivation

Beim Kauf und Einrichten einer digitalen Modellbahn-Lokomotive (z. B. von Roco, Piko, ESU, Fleischmann, Märklin oder Brawa) liegt in der Verpackung stets eine gedruckte Bedienungsanleitung bzw. ein Ersatzteil-/Funktionsblatt bei (oder steht als PDF-Download bereit).

In diesen Dokumenten befindet sich ausnahmslos eine **Funktionstasten-Tabelle (F0 bis F28)**:

| F-Taste | Funktion / Sound | Typ |
| :--- | :--- | :--- |
| **F0** | Dreilicht-Spitzensignal / Schlusslicht weiß/rot | Dauer (Schalter) |
| **F1** | Motor- / Betriebsgeräusch (Sound ein/aus) | Dauer (Schalter) |
| **F2** | Hochton-Makrofon / Lokpfeife | Moment (Taster) |
| **F3** | Tiefton-Makrofon | Moment (Taster) |
| **F4** | Rangiergang & Rangierlicht | Dauer (Schalter) |
| **F5** | Führerstandsbeleuchtung (fahrtrichtungsabhängig) | Dauer (Schalter) |
| **F6** | Fernlicht | Dauer (Schalter) |
| **F7** | Schaffnerpfiff | Moment (Taster) |
| **F8** | Digitale Kupplung vorne/hinten | Moment (Taster) |
| ... | ... | ... |
| **F28** | Bremsenquietschen deaktivieren | Dauer (Schalter) |

### Das aktuelle Problem:
Bislang muss der Modellbahner für jede einzelne Lokomotive bis zu 29 Funktionen **von Hand am Bildschirm abtippen**, Bezeichnungen eintippen und Tasten konfigurieren. Bei einem Fuhrpark von 10–20 Loks ist das extrem zeitaufwendig, monoton und fehleranfällig.

---

## 2. Zielsetzung: Der „Smart Function Importer“

Der Nutzer soll lediglich:
1. Das **PDF der Anleitung** in TrainMaster hineinziehen (oder ein **Handyfoto / Screenshot** des Beipackzettels hochladen / per `Strg+V` einfügen).
2. Der Server analysiert das Dokument, lokalisiert die Tabelle der F-Tasten, extrahiert Bezeichnungen und ermittelt automatisch:
   - Die F-Nummer (`0` bis `28`)
   - Den Funktionsnamen (z. B. *"Lokpfeife lang"*, *"Führerstandslicht"*)
   - Die Kategorie (Sound, Licht, Mechanik, Rangieren)
   - Das passende Icon (z. B. 🎺 Horn, 💡 Licht, 🪝 Kupplung, 🔊 Sound)
   - Das Schaltverhalten: **Taster (Momentary)** für Pfeifen/Kupplungen vs. **Schalter (Latching)** für Motor und Dauerlicht.
3. Die Daten werden strukturiert als JSON an das Frontend zurückgegeben.

---

## 3. Architektur & Parsing-Strategie

Da Anleitungen in zwei Formen vorkommen (digitale Vektor-PDFs vs. abfotografierte/gescannte Zettel), setzt die Backend-Engine auf ein mehrstufiges Erkennungskonzept (**Multi-Engine Fallback Pipeline**):

```text
[ Upload: PDF oder Bild ]
          │
          ├── Ist es ein PDF mit Text-Layer? (Vektor-PDF)
          │        ├── JA ➔ Stufe 1: Schneller PDF-Text-Parser (pdf-parse / pypdf)
          │        │       └── Tabellen-Regex-Normalizer
          │        └── NEIN / Scan ➔ Stufe 2: OCR-Engine
          │
          └── Bild-Upload / Scan / Screenshot
                   ├── Stufe 2: Lokale OCR-Engine (z. B. Tesseract.js / pdf2img)
                   └── Stufe 3: Intelligente Heuristik & AI-Vision-Kompaktprompt
                                (Extrahiert F0..F28 tabellarisch)
```

### Stufe 1: Vektor-PDF Text-Extraktion (Schnell & Offline)
* Bibliothek: `pdf-parse` (Node.js)
* Suchmuster (Regex):
  * Erkennt Tabellenzeilen wie `F0\s+Licht`, `F1:\s*Fahrgeräusch`, `F 2\s+\|\s+Horn\s+\|\s+Tastfunktion`
  * Filtert mehrsprachige Anleitungen (DE / EN / FR) und priorisiert die gewählte TrainMaster-Sprache.

### Stufe 2: Bild- / Foto-Erkennung (OCR)
* Wenn der Nutzer den Beipackzettel mit dem Smartphone abfotografiert:
  * Automatische Kontrastoptimierung und Binarisierung (Grayscale).
  * Zeilenbasierte OCR zur Erkennung der F-Ziffern und Beschreibungstexte.

### Stufe 3: Semantische Klassifizierung & Icon-Zuweisung
Die extrahierten Textbausteine werden über ein Regelwerk gemappt:
* **Horn / Pfeife / Makrofon / Signalhorn:**  
  ➔ Icon: `icon-horn` | `isMomentary = true` (Taster)
* **Kupplung / Entkuppeln / Telex:**  
  ➔ Icon: `icon-coupler` | `isMomentary = true` (Taster)
* **Pfiff / Schaffner / Glocke:**  
  ➔ Icon: `icon-bell` | `isMomentary = true`
* **Licht / Spitzensignal / Fernlicht / Führerstand / Innenbeleuchtung:**  
  ➔ Icon: `icon-light` | `isMomentary = false` (Schalter)
* **Fahrgeräusch / Sound / Diesel / Dampf / Motor:**  
  ➔ Icon: `icon-sound` | `isMomentary = false` (Schalter)
* **Rangiergang / ABV / Bremsverzögerung:**  
  ➔ Icon: `icon-shunter` | `isMomentary = false`

---

## 4. API Endpunkte

### `POST /api/import/functions-from-file`
* **Payload:** `multipart/form-data` (Datei: `file`, Parameter: `lang?: 'de' | 'en'`)
* **Response (JSON):**
```json
{
  "success": true,
  "confidence": 0.94,
  "detectedLoco": "DB BR 101 (Roco 70415)",
  "functions": [
    { "index": 0, "label": "Licht weiß/rot", "icon": "light", "isMomentary": false },
    { "index": 1, "label": "Fahrgeräusch", "icon": "sound", "isMomentary": false },
    { "index": 2, "label": "Lokpfeife hoch", "icon": "horn", "isMomentary": true },
    { "index": 3, "label": "Lokpfeife tief", "icon": "horn", "isMomentary": true },
    { "index": 4, "label": "Rangiergang", "icon": "shunter", "isMomentary": false },
    { "index": 5, "label": "Führerstandsbeleuchtung", "icon": "light", "isMomentary": false }
  ]
}
```

---

## 5. Akzeptanzkriterien

- [ ] PDF-Dateien von mindestens 3 großen Herstellern (Roco, Piko, ESU) werden fehlerfrei eingelesen.
- [ ] Screenshot / PNG-Fotos von Beipackzetteln werden erkannt.
- [ ] Taster- vs. Schalter-Funktionen werden anhand von Signalwörtern ("Tast", "Moment", "Horn", "Pfiff") automatisch korrekt vorausgewählt.
- [ ] Parsing bricht bei ungültigen Dokumenten mit sauberer Fehlermeldung ab (kein Server-Absturz).
