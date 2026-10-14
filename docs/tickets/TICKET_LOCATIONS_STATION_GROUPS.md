# [Feature] Ortschaften & Bahnhofs-Gleisgruppen: Dynamische Gleiswahl im Automatikbetrieb

**Typ:** Core Automation & Dispatcher Enhancement  
**Status:** Open / Konzipiert  
**Komponenten:** `server/src/engine/BlockManager.ts`, `server/src/engine/RouteEngine.ts`, `server/src/types.ts`, `client/src/components/TrackCanvas.ts`  
**Labels:** `enhancement`, `automation`, `dispatcher`, `routing`

---

## 1. Problemstellung & Motivation

Aktuell definiert TrainMaster Routen und Fahrstraßen streng von **Block A nach Block B**:
* Wenn ein Zug im Automatikbetrieb nach Gleis 1 fahren möchte, Gleis 1 jedoch belegt ist, **bleibt der Zug stehen (Deadlock)** oder blockiert die Zufahrtsstrecke, selbst wenn Gleis 2 und Gleis 3 direkt daneben völlig frei sind.
* Auf Vorbildbahnen und Modellbahnen fährt ein Zug jedoch nicht primär in einen festen *Block*, sondern in einen **Bahnhof / eine Ortschaft** (z. B. *"Hauptbahnhof"* oder *"Schattenbahnhof Süd"*).
* Der Fahrdienstleiter wählt dynamisch das **nächste freie und passende Bahnsteiggleis** aus.

---

## 2. Konzept: Das Ortschaften-Modell (Locations)

Eine **Ortschaft (Location)** ist ein logischer Container, der mehrere Blöcke zusammenfasst:

```text
[ Ortschaft "Bahnhof Neustadt" ]
  ├── Block 1: Gleis 1 (Länge 180cm, Bahnsteig, Güter+Personen)
  ├── Block 2: Gleis 2 (Länge 220cm, Bahnsteig, Personen)
  └── Block 3: Gleis 3 (Länge 120cm, Kurzzüge / Nahverkehr)
```

### Dynamische Gleiswahl-Strategie:
Wenn ein Zug eine Route zur Ortschaft *"Bahnhof Neustadt"* anfordert:
1. **Verfügbarkeit:** Prüfe, welche Blöcke der Ortschaft aktuell frei und nicht für andere Fahrstraßen reserviert sind.
2. **Zuglängen-Prüfung:** Blocklänge muss $\ge$ Zuglänge sein (`block.lengthCm >= loco.lengthCm`).
3. **Zugtyp-Filter:** Z. B. Güterzüge dürfen nicht an reine Personen-Bahnsteige; ICEs nur auf Gleise mit passender Länge.
4. **Priorisierung:** 
   - *Zufall (Random)* für abwechslungsreichen Betrieb ("Aquarium").
   - *Feste Priorität (Gleis 1 bevorzugen, Gleis 2 als Ausweichgleis)*.
   - *Minimale Wartezeit (Gleis wählen, das am längsten leer stand)*.

---

## 3. Datenmodell-Spezifikation (`types.ts`)

```typescript
export interface Location {
  id: string;                      // z. B. "loc-neustadt"
  name: string;                    // z. B. "Bf Neustadt"
  blockIds: string[];              // ["block-1", "block-2", "block-3"]
  selectionStrategy: 'RANDOM' | 'PRIORITY' | 'LEAST_RECENT';
  allowFreight: boolean;
  allowPassenger: boolean;
}

// Erweiterung des Block-Interfaces:
export interface Block {
  // ... bestehende Felder ...
  locationId?: string | null;      // Zugeordnete Ortschaft
  priority?: number;               // 1 = Höchste Prio für Gleiswahl
}
```

---

## 4. Dispatcher- & Routing-Integration (`RouteEngine.ts`)

```typescript
public findRouteToLocation(loco: Locomotive, targetLocationId: string): Route | null {
  const location = this.locations.get(targetLocationId);
  if (!location) return null;

  // Freie und passende Blöcke filtern:
  const candidateBlocks = location.blockIds
    .map(id => this.blockManager.getBlock(id))
    .filter(b => b && !b.occupied && !b.reserved)
    .filter(b => !b.lengthCm || b.lengthCm >= (loco.lengthCm || 0));

  if (candidateBlocks.length === 0) return null;

  // Suche nach einer gültigen Fahrstraße zu einem der Kandidaten
  for (const block of candidateBlocks) {
    const route = this.findPath(loco.currentBlockId, block.id, loco);
    if (route) return route;
  }
  return null;
}
```

---

## 5. UI-Integration

* **Gleisplan-Anzeige:** Blöcke derselben Ortschaft erhalten im Gleisplan auf Wunsch eine dezente gemeinsame Umrandung oder Farbcodierung.
* **Click-to-Drive:** Klick auf einen Zug ➔ Klick auf den Ortschaften-Badge im Header ➔ TrainMaster wählt das freie Gleis und stellt die Weichenstraße automatisch.
* **Ortschaften-Manager:** Einfacher Dialog in den Einstellungen oder im Stellwerk zum Anlegen von Bahnhöfen und Zuweisen von Blöcken per Checkbox.

---

## 6. Akzeptanzkriterien

- [ ] Blöcke können im Stellwerk zu Ortschaften gruppiert werden.
- [ ] Automatikbetrieb wählt bei Anfahrt einer Ortschaft automatisch ein freies Alternativgleis, wenn das Hauptgleis belegt ist.
- [ ] Züge fahren niemals in Blöcke ein, die kürzer als der Zug sind.
- [ ] Wenn alle Gleise der Ortschaft belegt sind, wartet der Zug am letzten Signal vor der Einfahrt ohne Deadlock.
