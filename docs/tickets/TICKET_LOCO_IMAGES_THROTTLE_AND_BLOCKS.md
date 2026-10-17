# [Feature] Lokbilder im Fahrregler, in belegten Blöcken und im Depot

**Typ:** Feature / Frontend UX & Fleet Management  
**Status:** ✅ Umgesetzt in v1.9.0 (Spec: `.kiro/specs/loco-images/`), auf der Anlage abgenommen  
**Priorität:** Hoch (Wunsch des Anlagenbetreibers)  
**Komponenten:** `server/src/index.ts` (Upload-/Bild-Endpunkte), `server/src/storage/StorageManager.ts`, `server/src/types.ts`, `client/src/components/Throttle.ts`, `client/src/components/TrackCanvas.ts`, `client/src/components/TrainDepotDrawer.ts`, `client/src/i18n.ts`  
**Labels:** `ui`, `throttle`, `trackplan`, `loco-management`, `images`

---

## 1. Problembeschreibung & Motivation

Loks werden im Fahrregler, im Gleisplan und im Depot nur über Namen und DCC-Adresse dargestellt. Bei mehreren ähnlich benannten Fahrzeugen (z. B. „BR 218“ und „BR 218 Ersatz“) ist das im Betrieb schwer zu unterscheiden. Ein Foto der eigenen Lok erkennt man auf einen Blick, gerade auf dem Tablet am Anlagenrand.

Das Feld `Locomotive.image?: string` existiert bereits im Datenmodell, wird aber nirgends gesetzt oder angezeigt.

---

## 2. Ziel

1. **Fahrregler:** Jede Lok-Karte zeigt oben ein Bild der Lok (Seitenansicht, Breitformat).
2. **Belegte Blöcke im Gleisplan:** Ein belegter oder reservierter Block zeigt ein kleines Vorschaubild der Lok neben bzw. statt des 🚂-Symbols.
3. **Depot (TrainDepotDrawer):** Lok-Karten zeigen das Bild als Vorschau, auch beim Ziehen auf den Gleisplan.
4. **Ohne Bild:** Neutrales Platzhalter-Symbol passend zur Zugart (`trainType`), keine leeren Flächen.

---

## 3. Lösungsansatz

### 3.1 Speicherung: Bilddateien statt Base64 im Datenmodell

Bilder werden **nicht** als Base64 in `layout.local.json` abgelegt. Begründung:
- `saveAllData()` schreibt die komplette Datei bei jeder Änderung (auch bei jedem Fahrstufenwechsel über `onLocoUpdated`).
- `LOCO_UPDATED` wird bei jeder Fahrstufe an alle Clients gesendet; ein 200-KB-Bild pro Nachricht würde das WebSocket-Netz und Tablets massiv belasten.
- Die WebSocket-Payload ist auf 2 MB begrenzt (TM-03).

Stattdessen:
- Ablage unter `server/data/loco-images/<locoId>.<hash>.webp` (git-ignoriert wie die übrigen lokalen Daten).
- `Locomotive.image` enthält nur den relativen Pfad, z. B. `/api/loco-images/loco-br-218.3f9a.webp`. Der Hash im Dateinamen sorgt dafür, dass Browser nach einem Bildwechsel nicht das alte Bild aus dem Cache zeigen.

### 3.2 Upload

- Im Lok-Dialog (Anlegen/Bearbeiten) ein Bildfeld mit Vorschau, „Bild wählen“ (Datei oder Handykamera via `accept="image/*" capture`) und „Entfernen“.
- **Clientseitig verkleinern** vor dem Upload: Canvas, max. 640 × 360 px, WebP (Fallback JPEG), Qualität ~0,8. Ziel: < 80 KB pro Bild.
- Optional: einfacher Zuschnitt (Ausschnitt verschieben) für Seitenansicht im Format 16:9.
- `POST /api/locos/:id/image` (Body: Binärdaten), `DELETE /api/locos/:id/image`.
- Nach erfolgreichem Upload setzt der Server `image` und sendet einmalig `LOCO_UPDATED`.

### 3.3 Server-Validierung (Sicherheit)

- Erlaubte Formate nur **WebP, JPEG, PNG**, geprüft anhand der Dateisignatur (Magic Bytes), nicht nur am MIME-Typ. **Kein SVG** (kann Skripte enthalten).
- Größenlimit z. B. 1 MB pro Upload (`express.raw({ limit: '1mb' })`), Lok-ID gegen bestehende Loks prüfen, Dateiname ausschließlich serverseitig erzeugen (kein Pfad aus Benutzereingabe → kein Path Traversal).
- Beim Löschen einer Lok (`DELETE_LOCO`) wird das Bild mitgelöscht; beim Bildwechsel die alte Datei entfernen.
- Hinweis: Die REST-API ist wie der Rest von TrainMaster im LAN **ohne Authentifizierung** erreichbar. Jedes Gerät im Netz könnte Bilder hochladen oder ersetzen. Für den Heimgebrauch akzeptabel, muss aber in der Doku erwähnt werden.

### 3.4 Darstellung

| Ort | Größe | Verhalten |
| :--- | :--- | :--- |
| Fahrregler-Karte | volle Kartenbreite, ~16:9, max. 140 px hoch | `object-fit: cover`; aktive Lok zusätzlich hervorgehoben |
| Belegter Block (SVG) | ~40 × 24 px Vorschau im Blockfeld | per `<image>` mit `clipPath` (abgerundet); bei reserviertem Block halbtransparent |
| Depot-Karte | ~96 × 54 px | auch im Drag-Ghost |
| Kontextmenü Block | ~64 × 36 px | neben „Belegt von: …“ |

- Bilder per `loading="lazy"` und mit festen Abmessungen, damit beim Laden nichts springt.
- `alt`-Text = Lokname (Barrierefreiheit).
- Bei Ladefehler automatisch auf den Platzhalter zurückfallen.
- Bild-URLs werden nur aus `Locomotive.image` übernommen, wenn sie mit `/api/loco-images/` beginnen (kein Einschleusen externer URLs).

### 3.5 Performance

- Der Gleisplan wird bei jeder Serverchange neu gerendert. Das `<image>`-Element darf dabei kein neues Laden auslösen: gleiche URL beibehalten, Browser-Cache greift (`Cache-Control: public, max-age=31536000, immutable` dank Hash im Dateinamen).
- Fahrregler: `updateLocoCard` setzt `src` nur, wenn sich `image` geändert hat.

---

## 4. Geplante Datenmodell-Änderungen

Keine neuen Felder nötig, `Locomotive.image?: string` wird genutzt (Semantik: relativer Server-Pfad oder leer).

Optional für später:

```typescript
imageFocusX?: number; // 0..1, horizontaler Bildausschnitt für kleine Vorschauen
```

---

## 5. Implementierungs-Schritte

- [x] **Server:** Endpunkte `POST/DELETE /api/locos/:id/image`, statische Auslieferung `/api/loco-images/*` mit Cache-Headern, Validierung (Magic Bytes, Größe, Lok-ID).
- [x] **Server:** Bild beim Löschen der Lok bzw. beim Ersetzen entfernen; `server/data/loco-images/` in `.gitignore`.
- [x] **Client:** Bildfeld im Lok-Dialog inkl. Verkleinerung/WebP-Konvertierung und Vorschau.
- [x] **Client:** Anzeige im Fahrregler (`Throttle.ts`, `createLocoCard`/`updateLocoCard`).
- [x] **Client:** Anzeige in belegten/reservierten Blöcken und im Block-Kontextmenü (`TrackCanvas.ts`).
- [x] **Client:** Anzeige im Depot inkl. Drag-Ghost (`TrainDepotDrawer.ts`).
- [x] **Client:** Platzhalter je `trainType`, Fallback bei Ladefehler, DE/EN-Texte in `i18n.ts`.
- [x] **Tests:** Upload-Validierung (falsches Format, SVG, zu groß, unbekannte Lok, Path-Traversal-Versuch), Aufräumen beim Löschen.

---

## 6. Akzeptanzkriterien

1. Ein Handyfoto (z. B. 4 MB JPEG) lässt sich im Lok-Dialog hochladen; gespeichert wird eine verkleinerte Datei < 100 KB.
2. Das Bild erscheint ohne Neuladen der Seite auf allen verbundenen Geräten im Fahrregler, im Depot und im belegten Block.
3. Fahrstufenänderungen übertragen kein Bild erneut (WebSocket-Nachrichten bleiben klein).
4. SVG-, zu große oder beschädigte Dateien werden mit verständlicher Meldung abgelehnt.
5. Loks ohne Bild zeigen einen Platzhalter passend zur Zugart.
6. Beim Löschen einer Lok wird auch ihr Bild vom Server entfernt.
7. Auf einem Tablet (≥ 768 px) bleibt der Gleisplan mit 5 belegten Blöcken flüssig bedienbar.
