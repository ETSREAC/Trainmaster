# Requirements: Lokbilder im Fahrregler, in Blöcken und im Depot

Quelle: `docs/tickets/TICKET_LOCO_IMAGES_THROTTLE_AND_BLOCKS.md`

## Requirement 1: Bild hochladen und entfernen

**User Story:** Als Anlagenbetreiber möchte ich jeder Lok ein Foto zuordnen, damit ich sie im Betrieb auf einen Blick erkenne.

1. WHEN der Benutzer im Lok-Dialog ein Bild wählt THEN SHALL der Client es vor dem Upload auf max. 640 × 360 px verkleinern und als WebP (Fallback JPEG) kodieren.
2. WHEN der Dialog gespeichert wird THEN SHALL das Bild hochgeladen und der Lok zugeordnet werden, auch bei einer neu angelegten Lok.
3. WHEN der Benutzer „Bild entfernen“ wählt und speichert THEN SHALL das Bild vom Server gelöscht und die Zuordnung entfernt werden.
4. WHEN eine Lok gelöscht wird THEN SHALL ihr Bild vom Server gelöscht werden.
5. WHEN ein Bild ersetzt wird THEN SHALL die alte Datei gelöscht werden.

## Requirement 2: Server-Validierung

1. The server SHALL nur JPEG, PNG und WebP annehmen, erkannt an der Dateisignatur. SVG und alle anderen Formate SHALL abgelehnt werden (HTTP 415).
2. The server SHALL Uploads größer 1 MB ablehnen (HTTP 413).
3. IF die Lok-ID nicht existiert THEN SHALL der Server mit HTTP 404 antworten.
4. The server SHALL Dateinamen ausschließlich selbst erzeugen; Lieferungen SHALL nur Dateinamen akzeptieren, die diesem Schema entsprechen (kein Path Traversal).
5. The server SHALL das Feld `image` aus `CREATE_LOCO`/`UPDATE_LOCO` ignorieren; nur die Upload-Endpunkte dürfen es setzen.
6. The server SHALL Bilder mit `Cache-Control: public, max-age=31536000, immutable` und `X-Content-Type-Options: nosniff` ausliefern.

## Requirement 3: Anzeige

1. WHEN eine Lok ein Bild hat THEN SHALL es im Fahrregler oben auf der Lok-Karte erscheinen.
2. WHEN ein Block belegt oder reserviert ist und die Lok ein Bild hat THEN SHALL ein Vorschaubild im Block-Badge erscheinen (reserviert: halbtransparent).
3. WHEN eine Lok im Depot angezeigt wird THEN SHALL ein Vorschaubild erscheinen, ebenso im Drag-Ghost beim Ziehen per Touch.
4. WHEN das Block-Kontextmenü einen belegten Block zeigt THEN SHALL das Bild neben „Belegt von“ erscheinen.
5. IF eine Lok kein Bild hat oder das Bild nicht lädt THEN SHALL im Fahrregler und Depot ein Platzhalter passend zur Zugart angezeigt werden.
6. The client SHALL nur Bild-URLs verwenden, die dem Server-Schema `/api/loco-images/<datei>` entsprechen.
7. Bilder SHALL einen `alt`-Text mit dem Loknamen haben.

## Requirement 4: Performance

1. Fahrstufenänderungen SHALL keine Bilddaten übertragen (`image` ist nur ein kurzer Pfad).
2. The client SHALL `src` im Fahrregler nur setzen, wenn sich der Pfad geändert hat.
