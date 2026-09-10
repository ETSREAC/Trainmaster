import { Route, SignalAspect } from '../types.js';
import { BlockManager } from './BlockManager.js';
import { LocoManager } from './LocoManager.js';
import { TurnoutManager } from './TurnoutManager.js';

export interface RouteEvents {
  onRouteUpdated: (route: Route) => void;
  onSignalSet?: (signalId: string, aspect: SignalAspect) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

export class RouteEngine {
  private routes: Map<string, Route> = new Map();
  private blockManager: BlockManager;
  private turnoutManager: TurnoutManager;
  private locoManager: LocoManager;
  private events: RouteEvents;

  private automaticModeActive: boolean = false;
  private autoLoopTimer?: NodeJS.Timeout;

  constructor(
    initialRoutes: Route[],
    blockManager: BlockManager,
    turnoutManager: TurnoutManager,
    locoManager: LocoManager,
    events: RouteEvents
  ) {
    this.blockManager = blockManager;
    this.turnoutManager = turnoutManager;
    this.locoManager = locoManager;
    this.events = events;

    for (const r of initialRoutes) {
      this.routes.set(r.id, { ...r });
    }
  }

  getAllRoutes(): Route[] {
    return Array.from(this.routes.values());
  }

  setRoutes(newRoutes: Route[]): void {
    this.routes.clear();
    for (const r of newRoutes) {
      this.routes.set(r.id, { ...r });
    }
  }

  getRoute(id: string): Route | undefined {
    return this.routes.get(id);
  }

  findRoute(fromBlockId: string, toBlockId: string): Route | undefined {
    for (const r of this.routes.values()) {
      if (r.fromBlockId === fromBlockId && r.toBlockId === toBlockId) {
        return r;
      }
    }
    return undefined;
  }

  /**
   * Click & Drive: Startet eine Fahrstraße zwischen zwei Blöcken
   */
  requestRoute(fromBlockId: string, toBlockId: string): boolean {
    const route = this.findRoute(fromBlockId, toBlockId);
    if (!route) {
      this.events.onLog(`Keine gültige Fahrstraße von Block ${fromBlockId} nach ${toBlockId} gefunden!`, 'warn');
      return false;
    }

    const fromBlock = this.blockManager.getBlock(fromBlockId);
    const toBlock = this.blockManager.getBlock(toBlockId);

    if (!fromBlock || !toBlock) return false;

    if (!fromBlock.currentLocoId) {
      this.events.onLog(`Im Startblock ${fromBlock.name} befindet sich keine Lokomotive!`, 'warn');
      return false;
    }

    const loco = this.locoManager.getLoco(fromBlock.currentLocoId);
    if (!loco) return false;

    if (toBlock.state !== 'FREE') {
      this.events.onLog(`Zielblock ${toBlock.name} ist nicht frei (${toBlock.state})!`, 'warn');
      return false;
    }

    // Weichen verriegeln
    const locked = this.turnoutManager.lockTurnouts(route.turnoutSettings, route.id);
    if (!locked) {
      this.events.onLog(`Konnte Fahrstraße ${route.name} nicht verriegeln (Weichen belegt)!`, 'warn');
      return false;
    }

    // Zielblock reservieren
    this.blockManager.reserveBlock(toBlockId, loco.id);

    // Fahrstraße aktivieren
    route.active = true;
    this.events.onRouteUpdated(route);
    this.events.onLog(`Fahrstraße ${route.name} erfolgreich gestellt und gesichert!`, 'info');

    // Signale stellen (z.B. auf HP1 / HP2)
    if (route.signalSettings) {
      for (const ss of route.signalSettings) {
        this.events.onSignalSet?.(ss.signalId, ss.aspect);
      }
    }

    // Zug beschleunigen (z.B. auf vMid)
    setTimeout(() => {
      this.locoManager.setSpeed(loco.id, loco.vMid, 'FWD');
      this.events.onLog(`Zug ${loco.name} fährt ab mit Reisegeschwindigkeit (${loco.vMid})`, 'info');
    }, 500);

    return true;
  }

  /**
   * Löst eine Fahrstraße auf (nachdem Zug im Zielblock IN erreicht hat)
   */
  releaseRoute(toBlockId: string): void {
    for (const r of this.routes.values()) {
      if (r.toBlockId === toBlockId && r.active) {
        r.active = false;
        this.turnoutManager.unlockTurnouts(r.id);
        this.events.onRouteUpdated(r);
        this.events.onLog(`Fahrstraße ${r.name} aufgelöst.`, 'info');

        // Signale wieder auf Halt (HP0) zurückstellen
        if (r.signalSettings) {
          for (const ss of r.signalSettings) {
            this.events.onSignalSet?.(ss.signalId, 'HP0');
          }
        }

        // Falls voriger Block noch belegt war, freigeben
        this.blockManager.freeBlock(r.fromBlockId);
      }
    }
  }

  toggleAutomaticMode(active?: boolean): boolean {
    this.automaticModeActive = active !== undefined ? active : !this.automaticModeActive;

    if (this.automaticModeActive) {
      this.events.onLog('AUTOGARIUM / AUTOMATIK-MODUS AKTIVIERT.', 'info');
      this.startAutoLoop();
    } else {
      this.events.onLog('AUTOGARIUM / AUTOMATIK-MODUS GESTOPPT.', 'warn');
      if (this.autoLoopTimer) {
        clearInterval(this.autoLoopTimer);
        this.autoLoopTimer = undefined;
      }
    }
    return this.automaticModeActive;
  }

  isAutomaticMode(): boolean {
    return this.automaticModeActive;
  }

  private startAutoLoop(): void {
    if (this.autoLoopTimer) clearInterval(this.autoLoopTimer);

    // Prüfe alle 3 Sekunden nach abfahrbereiten Zügen
    this.autoLoopTimer = setInterval(() => {
      if (!this.automaticModeActive) return;

      const blocks = this.blockManager.getAllBlocks();
      for (const block of blocks) {
        if (block.state === 'OCCUPIED' && block.currentLocoId) {
          const loco = this.locoManager.getLoco(block.currentLocoId);
          // Wenn der Zug steht (Speed 0), suche nach freiem Zielblock
          if (loco && loco.speed === 0) {
            this.tryDispatchNext(block.id);
          }
        }
      }
    }, 3000);
  }

  private tryDispatchNext(fromBlockId: string): void {
    const candidateRoutes: Route[] = [];
    for (const r of this.routes.values()) {
      if (r.fromBlockId === fromBlockId && !r.active) {
        const toBlock = this.blockManager.getBlock(r.toBlockId);
        if (toBlock && toBlock.state === 'FREE') {
          candidateRoutes.push(r);
        }
      }
    }

    if (candidateRoutes.length > 0) {
      // Zufällige Route auswählen (Aquarium-Modus)
      const selected = candidateRoutes[Math.floor(Math.random() * candidateRoutes.length)];
      this.events.onLog(`[Automatik] Wähle Route für Abfahrt: ${selected.name}`, 'info');
      this.requestRoute(selected.fromBlockId, selected.toBlockId);
    }
  }
}
