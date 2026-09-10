import { Block, Locomotive, Route, SignalAspect } from '../types.js';
import { BlockManager } from './BlockManager.js';
import { LocoManager } from './LocoManager.js';
import { TurnoutManager } from './TurnoutManager.js';

export interface RouteEvents {
  onRouteUpdated: (route: Route) => void;
  onBlockUpdated?: (block: Block) => void;
  onSignalSet?: (signalId: string, aspect: SignalAspect) => void;
  onSoundTriggered?: (block: Block, soundType: 'DEPARTURE' | 'ARRIVAL') => void;
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

  // Zeitpläne für geplante Abfahrten und Soundtrigger
  private departureTimers: Map<string, NodeJS.Timeout> = new Map();
  private soundTimers: Map<string, NodeJS.Timeout> = new Map();

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

    // Timer des Startblocks löschen (Zug fährt nun ab)
    this.clearBlockTimer(fromBlockId);

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
        this.clearBlockTimer(r.fromBlockId);
      }
    }
  }

  /**
   * Wird aufgerufen, wenn ein Zug das IN-Ereignis im Zielblock ausgelöst hat.
   * Prüft Block-Typ, Zug-Typ, plant Haltezeiten oder veranlasst Durchfahrten.
   */
  notifyTrainArrival(blockId: string, locoId: string): void {
    if (!this.automaticModeActive) return;

    const block = this.blockManager.getBlock(blockId);
    const loco = this.locoManager.getLoco(locoId);
    if (!block || !loco) return;

    const blockType = block.type || (block.name.toLowerCase().includes('strecke') ? 'MAINLINE' : 'STATION');

    // 1. Freie Strecke: Durchfahrt ohne planmäßigen Halt
    if (blockType === 'MAINLINE') {
      this.events.onLog(`[Automatik] 🛤️ Durchfahrt auf Freier Strecke: ${loco.name} in ${block.name}`, 'info');
      setTimeout(() => {
        if (!this.automaticModeActive) return;
        const dispatched = this.tryDispatchNext(block.id);
        if (!dispatched) {
          this.events.onLog(`[Automatik] Folgeblock belegt, Zug ${loco.name} wartet vor Signal auf der Strecke (${block.name}).`, 'info');
        }
      }, 500);
      return;
    }

    // 2. Regionalbahnhof / Haltepunkt: Durchfahrt für HIGH_SPEED & FREIGHT
    if (blockType === 'LOCAL_STATION') {
      if (loco.trainType === 'HIGH_SPEED' || loco.trainType === 'FREIGHT') {
        this.events.onLog(
          `[Automatik] 🚄 Durchfahrt ohne Halt: ${loco.name} (${loco.trainType}) passiert Regionalhalt ${block.name}!`,
          'info'
        );
        setTimeout(() => {
          if (!this.automaticModeActive) return;
          const dispatched = this.tryDispatchNext(block.id);
          if (!dispatched) {
            this.events.onLog(`[Automatik] Folgeblock belegt, ${loco.name} muss am Signal in ${block.name} warten.`, 'info');
          }
        }, 500);
        return;
      }
    }

    // 3. Planmäßiger Halt (STATION, LOCAL_STATION für Regios, SHADOW_STATION, SIDING)
    const minWait = block.minWaitTimeSec !== undefined ? block.minWaitTimeSec : (blockType === 'SHADOW_STATION' ? 45 : 12);
    const maxWait = block.maxWaitTimeSec !== undefined ? block.maxWaitTimeSec : (blockType === 'SHADOW_STATION' ? 90 : 25);
    const waitSec = Math.max(3, Math.round(minWait + Math.random() * Math.max(0, maxWait - minWait)));

    this.events.onLog(
      `[Automatik] 🛑 Planmäßiger Halt für ${loco.name} in ${block.name} (${blockType}, Wartezeit: ${waitSec}s).`,
      'info'
    );

    this.scheduleDeparture(block, loco, waitSec);
  }

  private scheduleDeparture(block: Block, loco: Locomotive, waitSec: number): void {
    this.clearBlockTimer(block.id);

    const soundConfig = block.soundConfig;
    const leadTimeSec = Math.max(1, soundConfig?.departureLeadTimeSec ?? 3);
    const soundDelayMs = Math.max(0, (waitSec - leadTimeSec) * 1000);
    const departureDelayMs = waitSec * 1000;

    // WaitTimer auf dem Block setzen und an Clients senden
    block.waitTimer = {
      departureTimestamp: Date.now() + departureDelayMs,
      totalWaitSec: waitSec,
      status: 'WAITING'
    };
    this.events.onBlockUpdated?.(block);

    // Sound-Trigger vor Abfahrt
    if (soundConfig?.departureFKey !== undefined && soundConfig.departureFKey > 0) {
      const fKey = soundConfig.departureFKey;
      const durationMs = soundConfig.departureFKeyDurationMs ?? 1500;

      const soundTimer = setTimeout(() => {
        if (!this.automaticModeActive) return;
        this.events.onLog(`[Sound] 📢 Abfahrtssignal / Pfiff für ${loco.name} in ${block.name} (F${fKey})`, 'info');
        this.locoManager.setFunction(loco.id, fKey, true);
        this.events.onSoundTriggered?.(block, 'DEPARTURE');

        setTimeout(() => {
          this.locoManager.setFunction(loco.id, fKey, false);
        }, durationMs);
      }, soundDelayMs);

      this.soundTimers.set(block.id, soundTimer);
    }

    // Abfahrts-Timer
    const departureTimer = setTimeout(() => {
      this.departureTimers.delete(block.id);
      if (!this.automaticModeActive) return;

      this.events.onLog(`[Automatik] 🟢 Wartezeit in ${block.name} abgelaufen. Suche freie Ausfahrt für ${loco.name}...`, 'info');
      const dispatched = this.tryDispatchNext(block.id);
      if (!dispatched) {
        // Timer abgelaufen, aber Ausfahrt blockiert
        block.waitTimer = {
          departureTimestamp: 0,
          totalWaitSec: waitSec,
          status: 'DISPATCH_BLOCKED'
        };
        this.events.onBlockUpdated?.(block);
        this.events.onLog(`[Automatik] Ausfahrt aus ${block.name} aktuell blockiert. Zug wartet auf freies Gleis.`, 'info');
      } else {
        block.waitTimer = null;
        this.events.onBlockUpdated?.(block);
      }
    }, departureDelayMs);

    this.departureTimers.set(block.id, departureTimer);
  }

  clearBlockTimer(blockId: string): void {
    if (this.departureTimers.has(blockId)) {
      clearTimeout(this.departureTimers.get(blockId)!);
      this.departureTimers.delete(blockId);
    }
    if (this.soundTimers.has(blockId)) {
      clearTimeout(this.soundTimers.get(blockId)!);
      this.soundTimers.delete(blockId);
    }
    const block = this.blockManager.getBlock(blockId);
    if (block && block.waitTimer) {
      block.waitTimer = null;
      this.events.onBlockUpdated?.(block);
    }
  }

  private clearAllTimers(): void {
    for (const t of this.departureTimers.values()) clearTimeout(t);
    for (const t of this.soundTimers.values()) clearTimeout(t);
    this.departureTimers.clear();
    this.soundTimers.clear();
    for (const block of this.blockManager.getAllBlocks()) {
      if (block.waitTimer) {
        block.waitTimer = null;
        this.events.onBlockUpdated?.(block);
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
      this.clearAllTimers();
    }
    return this.automaticModeActive;
  }

  isAutomaticMode(): boolean {
    return this.automaticModeActive;
  }

  private startAutoLoop(): void {
    if (this.autoLoopTimer) clearInterval(this.autoLoopTimer);

    // Sofortige Prüfung beim Einschalten
    setTimeout(() => {
      if (this.automaticModeActive) {
        const blocks = this.blockManager.getAllBlocks();
        const occupiedWithTrain = blocks.filter((b) => b.state === 'OCCUPIED' && b.currentLocoId);
        if (occupiedWithTrain.length === 0) {
          this.events.onLog('[Automatik] Keine Züge in Blöcken aufgestellt! Bitte zuerst über das Gleis-Kontextmenü oder Depot einen Zug in einen Block setzen.', 'warn');
        } else {
          this.events.onLog(`[Automatik] Überwache ${occupiedWithTrain.length} aufgestellte(n) Zug/Züge auf der Anlage.`, 'info');
          this.checkAndDispatchAll();
        }
      }
    }, 200);

    // Prüfe alle 3 Sekunden nach abfahrbereiten Zügen, die nicht bereits in einem Abfahrtstimer hängen
    this.autoLoopTimer = setInterval(() => {
      if (!this.automaticModeActive) return;
      this.checkAndDispatchAll();
    }, 3000);
  }

  private checkAndDispatchAll(): void {
    const blocks = this.blockManager.getAllBlocks();
    for (const block of blocks) {
      if (block.state === 'OCCUPIED' && block.currentLocoId) {
        const loco = this.locoManager.getLoco(block.currentLocoId);
        const isRouteActive = Array.from(this.routes.values()).some((r) => r.fromBlockId === block.id && r.active);
        // Wenn der Zug steht und kein aktiver Timer oder aktive Route läuft, suche Route
        if (loco && loco.speed === 0 && !this.departureTimers.has(block.id) && !isRouteActive) {
          this.tryDispatchNext(block.id);
        }
      }
    }
  }

  private tryDispatchNext(fromBlockId: string): boolean {
    const fromBlock = this.blockManager.getBlock(fromBlockId);
    if (!fromBlock || !fromBlock.currentLocoId) return false;

    // Keine neue Route anfordern wenn von diesem Block bereits eine Fahrstraße aktiv ist
    for (const r of this.routes.values()) {
      if (r.fromBlockId === fromBlockId && r.active) return false;
    }

    const loco = this.locoManager.getLoco(fromBlock.currentLocoId);
    if (!loco) return false;

    const candidateRoutes: Route[] = [];
    for (const r of this.routes.values()) {
      if (r.fromBlockId === fromBlockId && !r.active) {
        const toBlock = this.blockManager.getBlock(r.toBlockId);
        if (toBlock && toBlock.state === 'FREE') {
          // Längenprüfung: Passt der Zug in den Zielblock?
          if (toBlock.lengthCm && loco.lengthCm && loco.lengthCm > toBlock.lengthCm) {
            continue;
          }
          candidateRoutes.push(r);
        }
      }
    }

    if (candidateRoutes.length > 0) {
      // Zufällige Route auswählen (Aquarium-Modus)
      const selected = candidateRoutes[Math.floor(Math.random() * candidateRoutes.length)];
      this.events.onLog(`[Automatik] Wähle Route für Abfahrt: ${selected.name}`, 'info');
      const ok = this.requestRoute(selected.fromBlockId, selected.toBlockId);
      if (ok) {
        fromBlock.waitTimer = null;
        this.events.onBlockUpdated?.(fromBlock);
      }
      return ok;
    }
    return false;
  }

  dispatchBlockNow(blockId: string): boolean {
    const block = this.blockManager.getBlock(blockId);
    if (!block || !block.currentLocoId) return false;

    this.clearBlockTimer(blockId);
    const dispatched = this.tryDispatchNext(blockId);
    if (!dispatched) {
      block.waitTimer = {
        departureTimestamp: 0,
        totalWaitSec: 0,
        status: 'DISPATCH_BLOCKED'
      };
      this.events.onBlockUpdated?.(block);
    }
    return dispatched;
  }
}
