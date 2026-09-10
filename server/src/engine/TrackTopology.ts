import {
  TrackElement,
  Block,
  Signal,
  Sensor,
  Turnout,
  LayoutIssue,
  BlockAssignmentPreview,
  LayoutInspectionResult,
  BlockSensors,
  Route
} from '../types.js';

export type PortDirection = 'N' | 'E' | 'S' | 'W';

export const ALL_PORTS: PortDirection[] = ['N', 'E', 'S', 'W'];

export function oppositePort(port: PortDirection): PortDirection {
  switch (port) {
    case 'N': return 'S';
    case 'S': return 'N';
    case 'E': return 'W';
    case 'W': return 'E';
  }
}

export function rotatePort(port: PortDirection, rotation: 0 | 90 | 180 | 270): PortDirection {
  const ports: PortDirection[] = ['N', 'E', 'S', 'W'];
  const idx = ports.indexOf(port);
  const steps = (rotation / 90) % 4;
  return ports[(idx + steps) % 4];
}

export function getNeighborCoords(x: number, y: number, exitPort: PortDirection): { x: number; y: number } {
  switch (exitPort) {
    case 'E': return { x: x + 1, y };
    case 'W': return { x: x - 1, y };
    case 'S': return { x, y: y + 1 };
    case 'N': return { x, y: y - 1 };
  }
}

export interface CellPorts {
  ports: PortDirection[];
  isDeadEnd?: boolean;
  // Für Weichen
  turnoutInfo?: {
    rootPort: PortDirection;
    straightPort: PortDirection;
    branchPort: PortDirection;
  };
}

export class TrackTopology {
  private grid: Map<string, TrackElement> = new Map();
  private elements: TrackElement[] = [];

  constructor(elements: TrackElement[]) {
    this.setElements(elements);
  }

  setElements(elements: TrackElement[]): void {
    this.elements = elements;
    this.grid.clear();
    for (const el of elements) {
      this.grid.set(`${el.x},${el.y}`, el);
    }
  }

  getElementAt(x: number, y: number): TrackElement | undefined {
    return this.grid.get(`${x},${y}`);
  }

  /**
   * Berechnet die aktiven Tore (Ports) eines Gleiselements basierend auf Typ und Rotation
   */
  getCellPorts(elem: TrackElement): CellPorts {
    const rot = elem.rotation || 0;

    switch (elem.type) {
      case 'STRAIGHT':
      case 'BLOCK':
      case 'SIGNAL':
      case 'SENSOR': {
        const p1 = rotatePort('W', rot);
        const p2 = rotatePort('E', rot);
        return { ports: [p1, p2] };
      }

      case 'CURVE': {
        // Bei Rotation 0 verbindet die Kurve West (-40, 0) mit Süd (0, 40)
        const p1 = rotatePort('W', rot);
        const p2 = rotatePort('S', rot);
        return { ports: [p1, p2] };
      }

      case 'BUFFER': {
        // Prellbock: Offenes Tor bei Rotation 0 ist West (-40, 0)
        const openPort = rotatePort('W', rot);
        return { ports: [openPort], isDeadEnd: true };
      }

      case 'CROSSING': {
        return { ports: ['N', 'E', 'S', 'W'] };
      }

      case 'TURNOUT_RIGHT': {
        // Wurzel: West, Geradeaus: Ost, Abzweig: Süd
        const root = rotatePort('W', rot);
        const straight = rotatePort('E', rot);
        const branch = rotatePort('S', rot);
        return {
          ports: [root, straight, branch],
          turnoutInfo: { rootPort: root, straightPort: straight, branchPort: branch }
        };
      }

      case 'TURNOUT_LEFT': {
        // Wurzel: West, Geradeaus: Ost, Abzweig: Nord
        const root = rotatePort('W', rot);
        const straight = rotatePort('E', rot);
        const branch = rotatePort('N', rot);
        return {
          ports: [root, straight, branch],
          turnoutInfo: { rootPort: root, straightPort: straight, branchPort: branch }
        };
      }

      default:
        return { ports: [] };
    }
  }

  /**
   * Ermittelt den Ausgangsport, wenn man über inPort in die Kachel einfährt
   */
  getNextPort(
    elem: TrackElement,
    inPort: PortDirection,
    turnoutState?: 'STRAIGHT' | 'DIVERGENT'
  ): { outPort: PortDirection; requiredTurnoutState?: 'STRAIGHT' | 'DIVERGENT' } | null {
    const info = this.getCellPorts(elem);

    if (elem.type === 'BUFFER') {
      // Prellbock hat keinen Ausgang
      return null;
    }

    if (elem.type === 'TURNOUT_LEFT' || elem.type === 'TURNOUT_RIGHT') {
      const to = info.turnoutInfo!;
      // Spitz befahrene Weiche (Einfahrt über Wurzel)
      if (inPort === to.rootPort) {
        if (turnoutState === 'DIVERGENT') {
          return { outPort: to.branchPort, requiredTurnoutState: 'DIVERGENT' };
        } else {
          return { outPort: to.straightPort, requiredTurnoutState: 'STRAIGHT' };
        }
      }
      // Stumpf befahren über geraden Ast
      if (inPort === to.straightPort) {
        return { outPort: to.rootPort, requiredTurnoutState: 'STRAIGHT' };
      }
      // Stumpf befahren über abzweigenden Ast
      if (inPort === to.branchPort) {
        return { outPort: to.rootPort, requiredTurnoutState: 'DIVERGENT' };
      }
      return null;
    }

    if (elem.type === 'CROSSING') {
      return { outPort: oppositePort(inPort) };
    }

    // Bei 2-Port Elementen (STRAIGHT, CURVE, BLOCK, SIGNAL, SENSOR)
    if (info.ports.includes(inPort)) {
      const otherPort = info.ports.find((p) => p !== inPort);
      if (otherPort) {
        return { outPort: otherPort };
      }
    }

    return null;
  }

  /**
   * Validiert den Gleisplan auf offene Enden, lose Weichen und fehlende Links
   */
  validateLayout(
    blocks: Block[],
    turnouts: Turnout[],
    signals: Signal[],
    sensors: Sensor[]
  ): LayoutIssue[] {
    const issues: LayoutIssue[] = [];
    const blockIds = new Set(blocks.map((b) => b.id));
    const turnoutIds = new Set(turnouts.map((t) => t.id));
    const signalIds = new Set(signals.map((s) => s.id));
    const sensorIds = new Set(sensors.map((s) => s.id));

    for (const elem of this.elements) {
      const cellPorts = this.getCellPorts(elem);

      // Verknüpfungsprüfung
      if (elem.type === 'BLOCK' && (!elem.linkedId || !blockIds.has(elem.linkedId))) {
        issues.push({
          type: 'MISSING_LINK',
          message: `Block bei (${elem.x}, ${elem.y}) ist keinem konfigurierten Block zugeordnet.`,
          x: elem.x,
          y: elem.y,
          elementId: elem.id
        });
      }

      if ((elem.type === 'TURNOUT_LEFT' || elem.type === 'TURNOUT_RIGHT') && (!elem.linkedId || !turnoutIds.has(elem.linkedId))) {
        issues.push({
          type: 'MISSING_LINK',
          message: `Weiche bei (${elem.x}, ${elem.y}) besitzt keine verknüpfte Weichen-ID.`,
          x: elem.x,
          y: elem.y,
          elementId: elem.id
        });
      }

      if (elem.type === 'SIGNAL' && (!elem.linkedId || !signalIds.has(elem.linkedId))) {
        issues.push({
          type: 'MISSING_LINK',
          message: `Signal bei (${elem.x}, ${elem.y}) ist keinem konfigurierten Signal zugeordnet.`,
          x: elem.x,
          y: elem.y,
          elementId: elem.id
        });
      }

      if (elem.type === 'SENSOR' && (!elem.linkedId || !sensorIds.has(elem.linkedId))) {
        issues.push({
          type: 'MISSING_LINK',
          message: `Rückmelder bei (${elem.x}, ${elem.y}) ist keinem konfigurierten Sensor zugeordnet.`,
          x: elem.x,
          y: elem.y,
          elementId: elem.id
        });
      }

      // Anschlussprüfung für alle aktiven Ports der Kachel
      for (const port of cellPorts.ports) {
        const neighborCoords = getNeighborCoords(elem.x, elem.y, port);
        const neighbor = this.getElementAt(neighborCoords.x, neighborCoords.y);
        const expectedNeighborPort = oppositePort(port);

        if (!neighbor) {
          // Kein Nachbargleis vorhanden
          if (elem.type !== 'BUFFER') {
            issues.push({
              type: 'OPEN_END',
              message: `Offenes Gleisende bei (${elem.x}, ${elem.y}) Richtung ${port} (Prellbock fehlt?).`,
              x: elem.x,
              y: elem.y,
              elementId: elem.id
            });
          }
        } else {
          // Nachbar vorhanden - hat er das passende Gegentor?
          const neighborPorts = this.getCellPorts(neighbor);
          if (!neighborPorts.ports.includes(expectedNeighborPort)) {
            issues.push({
              type: 'OPEN_END',
              message: `Fehlausrichtung bei (${elem.x}, ${elem.y}) -> Nachbar (${neighbor.x}, ${neighbor.y}) schließt Richtung ${port} nicht an.`,
              x: elem.x,
              y: elem.y,
              elementId: elem.id
            });
          }
        }
      }

      // Weichenanschluss-Prüfung (sind alle 3 Tore angeschlossen?)
      if (cellPorts.turnoutInfo) {
        let missingCount = 0;
        for (const p of cellPorts.ports) {
          const nCoords = getNeighborCoords(elem.x, elem.y, p);
          const n = this.getElementAt(nCoords.x, nCoords.y);
          if (!n || !this.getCellPorts(n).ports.includes(oppositePort(p))) {
            missingCount++;
          }
        }
        if (missingCount > 0) {
          issues.push({
            type: 'DANGLING_TURNOUT',
            message: `Weiche bei (${elem.x}, ${elem.y}) hat ${missingCount} nicht angeschlossene Abzweige.`,
            x: elem.x,
            y: elem.y,
            elementId: elem.id
          });
        }
      }
    }

    return issues;
  }

  /**
   * Untersucht lineare Gleisabschnitte ausgehend von Blöcken und ordnet Sensoren & Signale zu
   */
  autoAssignBlocks(blocks: Block[], signals: Signal[], sensors: Sensor[]): BlockAssignmentPreview[] {
    const previews: BlockAssignmentPreview[] = [];
    const blockMap = new Map<string, Block>(blocks.map((b) => [b.id, b]));

    // Finde alle BLOCK Kacheln
    const blockElements = this.elements.filter((el) => el.type === 'BLOCK' && el.linkedId);

    for (const bElem of blockElements) {
      const blockId = bElem.linkedId!;
      const blockObj = blockMap.get(blockId);
      const blockName = blockObj?.name || `Block ${blockId}`;

      const rot = bElem.rotation || 0;
      // Konvention TrainMaster:
      // Port W (Minus-Seite) ist der Eingang für Fahrten in Richtung +
      // Port E (Plus-Seite) ist der Ausgang für Fahrten in Richtung +
      const minusPort = rotatePort('W', rot);
      const plusPort = rotatePort('E', rot);

      // Verfolge den Gleisstrang in Richtung Minus (nach außen)
      const minusTrace = this.traceLinearSegment(bElem.x, bElem.y, minusPort, blockId);
      // Verfolge den Gleisstrang in Richtung Plus (nach außen)
      const plusTrace = this.traceLinearSegment(bElem.x, bElem.y, plusPort, blockId);

      // Reihenfolge von Minus nach Plus aufbauen:
      // minusTrace geht von Block weg nach außen -> umkehren für Minus-nach-Plus
      const sensorsOrderedFromMinusToPlus: string[] = [
        ...minusTrace.sensorIds.slice().reverse(),
        ...plusTrace.sensorIds
      ];

      // Signale erfassen
      // Ein Signal auf der Plus-Seite ist das Ausfahrsignal für Richtung +
      const exitSignalPlus = plusTrace.signalIds[0];
      // Ein Signal auf der Minus-Seite ist das Ausfahrsignal für Richtung -
      const exitSignalMinus = minusTrace.signalIds[0];

      let sensorsPlus: BlockSensors = { enter: '', in: '' };
      let sensorsMinus: BlockSensors = { enter: '', in: '' };

      if (sensorsOrderedFromMinusToPlus.length === 1) {
        const sId = sensorsOrderedFromMinusToPlus[0];
        sensorsPlus = { enter: sId, in: sId };
        sensorsMinus = { enter: sId, in: sId };
      } else if (sensorsOrderedFromMinusToPlus.length >= 2) {
        const firstMinus = sensorsOrderedFromMinusToPlus[0];
        const lastPlus = sensorsOrderedFromMinusToPlus[sensorsOrderedFromMinusToPlus.length - 1];

        // Richtung + (Fahrt von Minus nach Plus):
        // Erster Sensor bei Einfahrt ist enter, letzter Sensor vor Ausfahrt ist in
        sensorsPlus = { enter: firstMinus, in: lastPlus };

        // Richtung - (Fahrt von Plus nach Minus):
        // Erster Sensor bei Einfahrt ist enter (lastPlus), letzter Sensor ist in (firstMinus)
        sensorsMinus = { enter: lastPlus, in: firstMinus };
      } else {
        // Bestehende behalten falls vorhanden
        sensorsPlus = blockObj?.sensorsPlus || { enter: '', in: '' };
        sensorsMinus = blockObj?.sensorsMinus || { enter: '', in: '' };
      }

      previews.push({
        blockId,
        blockName,
        sensorsPlus,
        sensorsMinus,
        exitSignalPlus,
        exitSignalMinus,
        detectedSensorIds: sensorsOrderedFromMinusToPlus
      });
    }

    return previews;
  }

  /**
   * Verfolgt einen linearen Gleisabschnitt ausgehend von (startX, startY) über exitPort,
   * bis eine Weiche, ein anderer Block oder ein Prellbock erreicht wird.
   */
  private traceLinearSegment(
    startX: number,
    startY: number,
    exitPort: PortDirection,
    originalBlockId: string
  ): { sensorIds: string[]; signalIds: string[] } {
    const sensorIds: string[] = [];
    const signalIds: string[] = [];
    const visited = new Set<string>();

    let curX = startX;
    let curY = startY;
    let curExitPort = exitPort;

    while (true) {
      const nextCoords = getNeighborCoords(curX, curY, curExitPort);
      const key = `${nextCoords.x},${nextCoords.y}`;
      if (visited.has(key)) break;
      visited.add(key);

      const nextElem = this.getElementAt(nextCoords.x, nextCoords.y);
      if (!nextElem) break;

      const inPort = oppositePort(curExitPort);
      const portsInfo = this.getCellPorts(nextElem);
      if (!portsInfo.ports.includes(inPort)) break;

      // Wenn wir auf eine Weiche treffen: Weichen gehören zur Weichenstraße / Fahrstraße, nicht mehr zum Block
      if (nextElem.type === 'TURNOUT_LEFT' || nextElem.type === 'TURNOUT_RIGHT') {
        break;
      }

      // Wenn wir auf einen anderen Block treffen
      if (nextElem.type === 'BLOCK' && nextElem.linkedId !== originalBlockId) {
        break;
      }

      // Wenn wir auf einen Prellbock treffen
      if (nextElem.type === 'BUFFER') {
        break;
      }

      // Sensor erfassen
      if (nextElem.type === 'SENSOR' && nextElem.linkedId) {
        sensorIds.push(nextElem.linkedId);
      }

      // Signal erfassen
      if (nextElem.type === 'SIGNAL' && nextElem.linkedId) {
        signalIds.push(nextElem.linkedId);
      }

      // Ausgangsport ermitteln
      const nextStep = this.getNextPort(nextElem, inPort);
      if (!nextStep) break;

      curX = nextCoords.x;
      curY = nextCoords.y;
      curExitPort = nextStep.outPort;
    }

    return { sensorIds, signalIds };
  }
}
