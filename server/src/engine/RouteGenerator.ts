import {
  TrackTopology,
  PortDirection,
  getNeighborCoords,
  oppositePort,
  rotatePort
} from './TrackTopology.js';
import {
  Block,
  Turnout,
  Signal,
  Route,
  RouteTurnoutSetting,
  SignalAspect
} from '../types.js';

interface PathState {
  curX: number;
  curY: number;
  inPort: PortDirection;
  turnoutSettings: RouteTurnoutSetting[];
  signalsEncountered: string[];
  visitedKeys: Set<string>;
  pathLength: number;
}

export class RouteGenerator {
  private topology: TrackTopology;
  private blocks: Block[];
  private turnouts: Turnout[];
  private signals: Signal[];

  constructor(
    topology: TrackTopology,
    blocks: Block[],
    turnouts: Turnout[],
    signals: Signal[]
  ) {
    this.topology = topology;
    this.blocks = blocks;
    this.turnouts = turnouts;
    this.signals = signals;
  }

  /**
   * Generiert alle möglichen Fahrstraßen von Block zu Block über das Gleisnetz
   */
  generateAllRoutes(): Route[] {
    const routes: Route[] = [];
    const blockMap = new Map<string, Block>(this.blocks.map((b) => [b.id, b]));
    const turnoutMap = new Map<string, Turnout>(this.turnouts.map((t) => [t.id, t]));
    const signalMap = new Map<string, Signal>(this.signals.map((s) => [s.id, s]));

    // Finde alle BLOCK Kacheln auf dem Gleisplan
    const blockElements = this.topology
      .validateLayout(this.blocks, this.turnouts, this.signals, [])
      .length >= 0 // Nur Initialisierungsreferenz
      ? this.blocks.map((b) => {
          // Finde Kachel im Raster
          for (let x = -10; x <= 50; x++) {
            for (let y = -10; y <= 50; y++) {
              const el = this.topology.getElementAt(x, y);
              if (el && el.type === 'BLOCK' && el.linkedId === b.id) {
                return { block: b, elem: el };
              }
            }
          }
          return null;
        }).filter((x): x is { block: Block; elem: any } => x !== null)
      : [];

    for (const { block: startBlock, elem: startElem } of blockElements) {
      const rot = startElem.rotation || 0;
      // Zwei mögliche Abfahrtsrichtungen:
      // Plus-Richtung: Abfahrt über Port E (nach Rotation)
      // Minus-Richtung: Abfahrt über Port W (nach Rotation)
      const departureDirs: Array<{ dir: '+' | '-'; exitPort: PortDirection }> = [
        { dir: '+', exitPort: rotatePort('E', rot) },
        { dir: '-', exitPort: rotatePort('W', rot) }
      ];

      for (const dep of departureDirs) {
        const foundPaths = this.findPathsFromBlock(startBlock, startElem.x, startElem.y, dep.exitPort);

        for (const p of foundPaths) {
          const destBlock = blockMap.get(p.destBlockId);
          if (!destBlock) continue;

          // Deduplizieren von Weichenstellungen
          const consolidatedTurnouts = this.consolidateTurnoutSettings(p.turnoutSettings);
          if (!consolidatedTurnouts) {
            // Widersprüchliche Weichenstellung auf demselben Pfad -> illegal
            continue;
          }

          // Signal-Begriffe bestimmen je nach Signal-Bauart (Blocksignal vs. Mehrabschnittssignal)
          const hasDivergent = consolidatedTurnouts.some((ts) => ts.state === 'DIVERGENT');

          const signalSettings = p.signalsEncountered
            .filter((sigId) => signalMap.has(sigId))
            .map((sigId) => {
              const sig = signalMap.get(sigId);
              // Reines 2-begriffiges Blocksignal (oder kein Gelb-Pin): kann NIEMALS HP2 anzeigen!
              const isBlockSignal = !sig || sig.kind === 'BLOCK' || (!sig.kind && sig.wioPins?.yellow === undefined);
              let signalAspect: SignalAspect;
              if (sig?.kind === 'SHUNTING') {
                signalAspect = 'SH1';
              } else if (hasDivergent && !isBlockSignal) {
                // Nur wenn das Signal Gelb unterstützt (3- oder 4-begriffig)
                signalAspect = 'HP2';
              } else {
                // Reines Blocksignal (oder Geradeaus-Fahrt) -> Hp1 (Grün)
                signalAspect = 'HP1';
              }

              return {
                signalId: sigId,
                aspect: signalAspect
              };
            });

          // Routen-Namen und ID generieren
          const baseId = `route-${startBlock.id}-to-${destBlock.id}`;
          const existingWithSamePair = routes.filter(
            (r) => r.fromBlockId === startBlock.id && r.toBlockId === destBlock.id
          );

          // Prüfe, ob exakt diese Weichenkombination bereits existiert
          const isDuplicate = existingWithSamePair.some((r) =>
            this.areTurnoutsEqual(r.turnoutSettings, consolidatedTurnouts)
          );
          if (isDuplicate) continue;

          let routeId = baseId;
          let routeName = `Fahrstraße ${startBlock.name} -> ${destBlock.name}`;

          if (existingWithSamePair.length > 0) {
            const variantIdx = existingWithSamePair.length + 1;
            routeId = `${baseId}-var${variantIdx}`;
            const turnoutDesc = consolidatedTurnouts
              .map((t) => {
                const toObj = turnoutMap.get(t.turnoutId);
                const toName = toObj ? toObj.name : t.turnoutId;
                return `${toName} (${t.state === 'STRAIGHT' ? 'Gerade' : 'Abzweig'})`;
              })
              .join(', ');
            routeName = `Fahrstraße ${startBlock.name} -> ${destBlock.name} [Weg ${variantIdx}: ${turnoutDesc}]`;
          }

          routes.push({
            id: routeId,
            name: routeName,
            fromBlockId: startBlock.id,
            toBlockId: destBlock.id,
            direction: dep.dir,
            turnoutSettings: consolidatedTurnouts,
            signalSettings: signalSettings.length > 0 ? signalSettings : undefined,
            active: false
          });
        }
      }
    }

    return routes;
  }

  private findPathsFromBlock(
    startBlock: Block,
    startX: number,
    startY: number,
    startExitPort: PortDirection
  ): Array<{ destBlockId: string; turnoutSettings: RouteTurnoutSetting[]; signalsEncountered: string[] }> {
    const results: Array<{
      destBlockId: string;
      turnoutSettings: RouteTurnoutSetting[];
      signalsEncountered: string[];
    }> = [];

    const firstNeighbor = getNeighborCoords(startX, startY, startExitPort);
    const firstInPort = oppositePort(startExitPort);

    const queue: PathState[] = [
      {
        curX: firstNeighbor.x,
        curY: firstNeighbor.y,
        inPort: firstInPort,
        turnoutSettings: [],
        signalsEncountered: [],
        visitedKeys: new Set<string>([`${startX},${startY}`]),
        pathLength: 1
      }
    ];

    while (queue.length > 0) {
      const state = queue.shift()!;
      const elem = this.topology.getElementAt(state.curX, state.curY);
      if (!elem) continue; // Offenes Ende

      const nodeKey = `${state.curX},${state.curY},${state.inPort}`;
      if (state.visitedKeys.has(nodeKey) || state.pathLength > 60) {
        continue; // Schleife oder Überlänge
      }
      const nextVisited = new Set(state.visitedKeys);
      nextVisited.add(nodeKey);

      // Prellbock erreicht
      if (elem.type === 'BUFFER') {
        continue;
      }

      // Block erreicht
      if (elem.type === 'BLOCK') {
        if (elem.linkedId && elem.linkedId !== startBlock.id) {
          results.push({
            destBlockId: elem.linkedId,
            turnoutSettings: [...state.turnoutSettings],
            signalsEncountered: [...state.signalsEncountered]
          });
        }
        // In jedem Fall Pfad hier beenden (Fahrstraßen enden am Block)
        continue;
      }

      // Signal erfassen
      const currentSignals = [...state.signalsEncountered];
      if (elem.type === 'SIGNAL' && elem.linkedId) {
        if (!currentSignals.includes(elem.linkedId)) {
          currentSignals.push(elem.linkedId);
        }
      }

      // Weiche behandeln
      if (elem.type === 'TURNOUT_LEFT' || elem.type === 'TURNOUT_RIGHT') {
        const portsInfo = this.topology.getCellPorts(elem);
        const toInfo = portsInfo.turnoutInfo;
        const turnoutId = elem.linkedId;

        if (!toInfo || !turnoutId) continue;

        // Fall 1: Spitz befahren (über Wurzel) -> Verzweigung in GERADE und ABZWEIGEND
        if (state.inPort === toInfo.rootPort) {
          // Ast 1: STRAIGHT
          const nextStraightCoords = getNeighborCoords(state.curX, state.curY, toInfo.straightPort);
          queue.push({
            curX: nextStraightCoords.x,
            curY: nextStraightCoords.y,
            inPort: oppositePort(toInfo.straightPort),
            turnoutSettings: [...state.turnoutSettings, { turnoutId, state: 'STRAIGHT' }],
            signalsEncountered: currentSignals,
            visitedKeys: nextVisited,
            pathLength: state.pathLength + 1
          });

          // Ast 2: DIVERGENT
          const nextBranchCoords = getNeighborCoords(state.curX, state.curY, toInfo.branchPort);
          queue.push({
            curX: nextBranchCoords.x,
            curY: nextBranchCoords.y,
            inPort: oppositePort(toInfo.branchPort),
            turnoutSettings: [...state.turnoutSettings, { turnoutId, state: 'DIVERGENT' }],
            signalsEncountered: currentSignals,
            visitedKeys: nextVisited,
            pathLength: state.pathLength + 1
          });
          continue;
        }

        // Fall 2: Stumpf befahren über geraden Ast -> Weiche MUSS auf STRAIGHT stehen
        if (state.inPort === toInfo.straightPort) {
          const nextCoords = getNeighborCoords(state.curX, state.curY, toInfo.rootPort);
          queue.push({
            curX: nextCoords.x,
            curY: nextCoords.y,
            inPort: oppositePort(toInfo.rootPort),
            turnoutSettings: [...state.turnoutSettings, { turnoutId, state: 'STRAIGHT' }],
            signalsEncountered: currentSignals,
            visitedKeys: nextVisited,
            pathLength: state.pathLength + 1
          });
          continue;
        }

        // Fall 3: Stumpf befahren über abzweigenden Ast -> Weiche MUSS auf DIVERGENT stehen
        if (state.inPort === toInfo.branchPort) {
          const nextCoords = getNeighborCoords(state.curX, state.curY, toInfo.rootPort);
          queue.push({
            curX: nextCoords.x,
            curY: nextCoords.y,
            inPort: oppositePort(toInfo.rootPort),
            turnoutSettings: [...state.turnoutSettings, { turnoutId, state: 'DIVERGENT' }],
            signalsEncountered: currentSignals,
            visitedKeys: nextVisited,
            pathLength: state.pathLength + 1
          });
          continue;
        }

        // Ungültiger Weichen-Eingang
        continue;
      }

      // Lineare Gleise (STRAIGHT, CURVE, CROSSING, SENSOR, SIGNAL)
      const nextStep = this.topology.getNextPort(elem, state.inPort);
      if (!nextStep) continue;

      const nextCoords = getNeighborCoords(state.curX, state.curY, nextStep.outPort);
      queue.push({
        curX: nextCoords.x,
        curY: nextCoords.y,
        inPort: oppositePort(nextStep.outPort),
        turnoutSettings: [...state.turnoutSettings],
        signalsEncountered: currentSignals,
        visitedKeys: nextVisited,
        pathLength: state.pathLength + 1
      });
    }

    return results;
  }

  /**
   * Prüft und konsolidiert Weichenstellungen: Schließt Widersprüche aus und dedupliziert
   */
  private consolidateTurnoutSettings(settings: RouteTurnoutSetting[]): RouteTurnoutSetting[] | null {
    const map = new Map<string, 'STRAIGHT' | 'DIVERGENT'>();
    for (const s of settings) {
      if (map.has(s.turnoutId)) {
        if (map.get(s.turnoutId) !== s.state) {
          // Widerspruch: dieselbe Weiche müsste gleichzeitig gerade und abzweigend stehen
          return null;
        }
      } else {
        map.set(s.turnoutId, s.state);
      }
    }
    return Array.from(map.entries()).map(([turnoutId, state]) => ({ turnoutId, state }));
  }

  private areTurnoutsEqual(a: RouteTurnoutSetting[], b: RouteTurnoutSetting[]): boolean {
    if (a.length !== b.length) return false;
    const mapA = new Map(a.map((x) => [x.turnoutId, x.state]));
    for (const item of b) {
      if (mapA.get(item.turnoutId) !== item.state) return false;
    }
    return true;
  }
}
