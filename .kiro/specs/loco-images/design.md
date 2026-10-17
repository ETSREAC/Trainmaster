# Design: Lokbilder

## Server

### `LocoImageStore` (`server/src/storage/LocoImageStore.ts`)

Reine Dateilogik, ohne Express, direkt testbar.

```ts
class LocoImageStore {
  constructor(dir: string)
  static detectFormat(buf: Buffer): 'webp' | 'jpg' | 'png' | null   // Magic Bytes
  save(locoId: string, buf: Buffer): string                          // liefert URL, wirft LocoImageError
  remove(url: string | undefined): void                              // ignoriert fremde/ungültige URLs
  resolve(fileName: string): string | null                           // absoluter Pfad nur bei gültigem Namen
  static isValidUrl(url: unknown): url is string
}
```

- Ablage: `server/data/loco-images/` (über `.gitignore` bereits durch `server/data/*.local*` nicht abgedeckt → eigener Eintrag).
- Dateiname: `<safeLocoId>.<sha256[0..12]>.<ext>`, `safeLocoId` = ID mit allem außer `[A-Za-z0-9_-]` ersetzt durch `_`.
- URL: `/api/loco-images/<dateiname>`.
- Signaturen: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF????WEBP`.
- Max. 1 MB (`LocoImageStore.MAX_BYTES`).

### Endpunkte (`index.ts`)

| Methode | Pfad | Verhalten |
|---|---|---|
| POST | `/api/locos/:id/image` | `express.raw({ type: () => true, limit: '1mb' })`; 404 unbekannte Lok, 415 falsches Format, 413 zu groß; alte Datei löschen, `locoManager.setImage` |
| DELETE | `/api/locos/:id/image` | Datei löschen, `setImage(id, undefined)` |
| GET | `/api/loco-images/:file` | `resolve()`, sonst 404; Cache-/nosniff-Header; `res.sendFile` |

`DELETE_LOCO` ruft `imageStore.remove(loco.image)`.

### `LocoManager`

- `addLoco`: `image` verwerfen.
- `updateLoco`: vorhandenes `image` übernehmen, Client-Wert ignorieren.
- `setImage(id, url | undefined)`: setzt Feld, löst `onLocoUpdated` aus (einmalige Broadcast + Speichern).

## Client

### `client/src/locoImage.ts`

- `locoImageSrc(loco)`: liefert absolute URL `http(s)://<host>:3001/api/loco-images/...` oder `null`, prüft Schema per Regex.
- `locoPlaceholderIcon(trainType, size)`: Icon aus `icons.ts`.
- `resizeImageFile(file)`: `createImageBitmap` → Canvas (max. 640 × 360, Seitenverhältnis bleibt) → `toBlob('image/webp', 0.8)`; liefert der Browser kein WebP, JPEG 0,82.
- `uploadLocoImage(locoId, blob)` / `deleteLocoImage(locoId)`: `fetch` gegen Port 3001; bei 404 (Lok noch nicht angelegt) bis zu 10 × 300 ms erneut versuchen.

### Lok-Dialog

Neuer Block oberhalb des Formular-Footers: Vorschau (16:9), „Bild wählen“ (`accept="image/jpeg,image/png,image/webp"`), „Entfernen“, Hinweistext. Zustand `pendingImage: Blob | null`, `pendingRemove: boolean`. Beim Speichern nach dem WS-Befehl hochladen bzw. löschen. Fehler → `alert` mit Servermeldung.

### Anzeige

- **Throttle:** `<div class="loco-photo">` als erstes Kind der Karte, enthält `<img loading="lazy">` oder Platzhalter; `LocoCardRef.photoEl` + `photoSrc` für Änderungserkennung.
- **TrackCanvas Block-Badge:** Lok = `currentLocoId` oder (bei RESERVED) `reservedForLocoId`. Mit Bild: Badge um 46 px breiter, `<image>` 40 × 24 links mit `clipPath` (rx 4), Texte um +23 px verschoben; RESERVED → `opacity 0.55`. Im gegenläufig rotierten Label-Gruppe, damit das Bild aufrecht bleibt. `onerror` entfernt das Bild.
- **Kontextmenü:** `<img>` 64 × 36 vor „Belegt von“.
- **Depot:** `<img>` 96 × 54 bzw. Platzhalter in `loco-card-top`; Drag-Ghost mit 32 × 18 Vorschau (Name dabei escapen).

## Tests (`scripts/test_loco_images.mjs`)

- `detectFormat`: JPEG/PNG/WebP erkannt, SVG/GIF/Text/leer abgelehnt.
- `save`: schreibt Datei, URL-Schema, gleiche Daten → gleicher Name; zu groß → Fehler; Lok-ID mit `../` wird entschärft.
- `resolve`: gültig → Pfad im Verzeichnis; `../x`, absolute Pfade, falsche Endung → `null`.
- `remove`: löscht eigene Datei, ignoriert fremde URLs.
- `LocoManager`: `addLoco`/`updateLoco` ignorieren Client-`image`, `setImage` setzt es.
- HTTP-Ende-zu-Ende gegen isolierten Server: Upload, Abruf mit Headern, 415/413/404, Löschen der Lok entfernt Datei.
