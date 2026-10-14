# [Feature] TrackPlan CAD Importer & Topology Solver: AnyRail, SCARM, WinTrack & Auto-Routing

**Typ:** Core Engine / Tools / Usability Revolution  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/importers/TrackPlanImporter.ts`, `server/src/importers/AnyRailParser.ts`, `server/src/importers/ScarmParser.ts`, `server/src/engine/TopologySolver.ts`, `client/src/components/TrackPlanImportModal.ts`  
**Labels:** `trackplan`, `cad`, `anyrail`, `scarm`, `wintrack`, `topology`, `auto-routing`, `importer`

---

## 1. Problemstellung & Motivation

Der größte Zeitfresser und Frustfaktor bei Modellbahn-Steuerungen (Rocrail, TrainController, iTrain) ist der manuelle Aufbau des Gleisplans:
* Ein Nutzer muss jede Gerade, jede Kurve, jede Weiche einzeln zeichnen, Weichenadressen verknüpfen, Blöcke anlegen, Rückmelder zuweisen und Dutzende Fahrstraßen manuell durchklicken.
* Fast jeder Modellbahner hat seine Anlage jedoch bereits in einer CAD-Planungssoftware millimetergenau durchkonstruiert:
  * **AnyRail** (extrem populär, exportiert sauberes XML)
  * **SCARM** (Simple Computer Aided Railway Modeller)
  * **WinTrack** (Standard im deutschsprachigen Raum)
  * **TraX Editor** (moderner Web-Gleisplaner)
* **TrainMaster-Revolution:** Datei per Drag & Drop in TrainMaster ziehen -> In **unter 5 Minuten** steht der Gleisplan, die Blöcke sind platziert und der **Topology Solver hat alle Fahrstraßen vollautomatisch berechnet**!

---

## 2. Technische Architektur

### 2.1 Unterstützte Formate & Parser
1. **AnyRail (`.xml` / `.any`):**
   * AnyRail bietet eine offizielle XML-Exportfunktion (`Export -> XML`).
   * Beinhaltet: Gleisgeometrie, Weichen-Typen (Märklin C/K, Roco Line, Peco, Fleischmann), Koordinaten, Ebenen/Höhen und Beschriftungen.
2. **SCARM (`.scarm` / `.dxf`):**
   * Liest Gleisabschnitte, Radien, Längen und Weichenverbindungen ein.
3. **WinTrack (`.tra` / `.xml`):**
   * Liest Gleiselemente, Artikelnummern der Hersteller und Magnetartikel-Adressen ein.

### 2.2 Schematische Normalisierung (CAD zu Stellwerk-Raster)
CAD-Pläne sind millimetergenau mit geschwungenen Kurven und Winkeln gezeichnet. Ein Stellwerk (SpDrS60) benötigt ein schematisches Kachel-Raster:
* **Gitter-Rasterung (Grid Snap):**
  * Erkennung von Richtungsvektoren (horizontal, vertikal, diagonal 45°).
  * Zusammenfassen von Kurvenbögen zu 90°- oder 45°-Stellwerkselementen.
  * Automatische Skalierung auf das TrainMaster-Canvas.

---

## 3. Der automatische Topology Solver (Graph-basierte Fahrstraßengenerierung)

Sobald die Gleiselemente importiert sind, baut der `TopologySolver` einen mathematischen gerichteten Graphen (Directed Graph) auf:
1. **Knoten (Nodes):** Weichen, Kreuzungen, Prellböcke, Signalstandorte.
2. **Kanten (Edges):** Gleisabschnitte mit Längenangabe.
3. **Block-Erkennung:**
   * Jeder durch Signale oder Rückmelder begrenzte Gleisabschnitt wird automatisch als `Block` definiert.
4. **Fahrstraßen-Generierung (Pathfinding via DFS/BFS):**
   * Findet alle fahrbaren Wege von Block A nach Block B.
   * Prüft Weichenkonflikte und stellt Weichenlagen (Gerade/Abzweig) für jede Route automatisch ein.
   * Vergibt verständliche Namen: `[Gleis 1] -> [Ausfahrt West] -> [Strecke Nord]`.

---

## 4. UI & Workflow im Frontend

1. **Button im Gleisplan-Editor:** *„CAD-Gleisplan importieren“*.
2. **Drag & Drop Modal:**
   * Datei hineinziehen (`.xml`, `.any`, `.scarm`).
   * Vorschau der erkannten Elemente: *„Erkannt: 48 Gleise, 14 Weichen, 8 Puffer, Hersteller: Märklin C-Gleis“*.
3. **Optionen:**
   * [x] *Automatisch Blöcke zwischen Weichen anlegen*
   * [x] *Signale an Blockgrenzen vorschlagen*
   * [x] *Alle Fahrstraßen automatisch generieren*
4. **Ergebnis:** Fertig befahrbarer Gleisplan mit voll einsatzbereiter Automatik.

---

## 5. Akzeptanzkriterien

- [ ] Parser für AnyRail XML-Exportdateien implementiert und getestet.
- [ ] Koordinaten-Rasterung wandelt CAD-Vektoren sauber in TrainMaster-Stellwerkssymbole um.
- [ ] Weichen, Dreiwegweichen und Kreuzungsweichen (DKW) werden korrekt mit ihren Zweigen erkannt.
- [ ] `TopologySolver` errechnet alle fahrbaren Fahrstraßen ohne Zyklen-Endlosschleifen.
- [ ] Generierte Blöcke und Fahrstraßen können im Editor normal editiert und nachjustiert werden.
- [ ] Beispieldateien (AnyRail Test-Layouts für H0 und N) in `tests/fixtures/cad/` hinterlegt.
