import { Block, Direction, Locomotive, Route, SignalAspect } from '../types.js';
import { BlockManager } from './BlockManager.js';
import { LocoManager } from './LocoManager.js';
import { TurnoutManager } from './TurnoutManager.js';

export interface RouteEvents {
  onRouteUpdated: (route: Route) => void;
  onBlockUpdated?: (block: Block) => void;
  onSignalSet?: (signalId: string, aspect: SignalAspect) => void;
  onSoundTriggered?: (block: Block, soundType: 'DEPARTURE' | 'ARRIVAL') => void;
  isEmergencyStop?: () => boolean;
  isBlockSensorsConfigured?: (blockId: string, direction: '+' | '-') => boolean;
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

  // Richtungsspeicher der Loks auf der Modellbahnanlage ('+' oder '-')
  private locoArrivalDirection: Map<string, '+' | '-'> = new Map();

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
   * Prüft, ob ein Block gerade der Startblock einer aktiven Fahrstraße ist (Zug fährt aus).
   */
  isBlockDeparting(blockId: string): boolean {
    for (const r of this.routes.values()) {
      if (r.fromBlockId === blockId && r.active) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gibt die aktive Fahrstraße zurück, die von diesem Block ausgeht (falls vorhanden).
   */
  getActiveRouteFromBlock(blockId: string): Route | undefined {
    for (const r of this.routes.values()) {
      if (r.fromBlockId === blockId && r.active) {
        return r;
      }
    }
    return undefined;
  }

  /**
   * Prüft, ob überhaupt mindestens eine Fahrstraße aktiv ist.
   */
  isAnyRouteActive(): boolean {
    for (const r of this.routes.values()) {
      if (r.active) return true;
    }
    return false;
  }

  /**
   * Prüft, ob ein Sensor zu einem Block gehört, der Teil einer aktiven Fahrstraße ist
   * (Startblock in Ausfahrt oder Zielblock in Reservierung/Anfahrt).
   */
  isSensorInActiveRoute(sensorId: string): boolean {
    if (!sensorId) return false;
    for (const r of this.routes.values()) {
      if (!r.active) continue;
      const fromBlock = this.blockManager.getBlock(r.fromBlockId);
      if (fromBlock) {
        if (
          fromBlock.sensorsPlus.enter === sensorId ||
          fromBlock.sensorsPlus.in === sensorId ||
          fromBlock.sensorsMinus.enter === sensorId ||
          fromBlock.sensorsMinus.in === sensorId
        ) {
          return true;
        }
      }
      const toBlock = this.blockManager.getBlock(r.toBlockId);
      if (toBlock) {
        if (
          toBlock.sensorsPlus.enter === sensorId ||
          toBlock.sensorsPlus.in === sensorId ||
          toBlock.sensorsMinus.enter === sensorId ||
          toBlock.sensorsMinus.in === sensorId
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Click & Drive: Startet eine Fahrstraße zwischen zwei Blöcken
   */
  requestRoute(fromBlockId: string, toBlockId: string): boolean {
    if (this.events.isEmergencyStop?.()) {
      this.events.onLog('Fahrstraße abgelehnt: GENERAL-NOTHALT ist aktiv!', 'warn');
      return false;
    }

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

    // 1. Fahrtrichtung für Abfahrt bestimmen & Richtungswechsel prüfen
    const prevArrivalDir = this.locoArrivalDirection.get(loco.id);
    let targetDirection: Direction = loco.direction;

    // Falls die neue Fahrstraße in Gegenrichtung zur vorigen Fahrtrichtung verläuft:
    if (prevArrivalDir && route.direction !== prevArrivalDir) {
      targetDirection = loco.direction === 'FWD' ? 'REV' : 'FWD';
      this.locoManager.setSpeed(loco.id, 0, targetDirection);
      this.events.onLog(
        `[Automatik] 🔄 Richtungswechsel für ${loco.name}: Fahrstraße "${route.name}" führt in Gegenrichtung (${route.direction} vs Vorfahrt ${prevArrivalDir}). Fahrtrichtung von ${loco.direction} auf ${targetDirection} gewechselt.`,
        'info'
      );
    }

    // Zug bewegt sich nun in Richtung dieser Fahrstraße
    this.locoArrivalDirection.set(loco.id, route.direction);

    // Timer des Startblocks löschen (Zug fährt nun ab)
    this.clearBlockTimer(fromBlockId);

    // Zielblock reservieren und Zielblock-Fahrrichtung mit Route synchronisieren
    this.blockManager.reserveBlock(toBlockId, loco.id, route.direction);

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

    // Zug beschleunigen (unter Beibehaltung/Setzen der korrekten Ziel-Richtung targetDirection)
    setTimeout(() => {
      // Spitzenlicht (F0 / F1) vor/bei Abfahrt automatisch einschalten
      this.ensureLocoLights(loco.id);
      this.locoManager.setSpeed(loco.id, loco.vMid, targetDirection);
      this.events.onLog(`Zug ${loco.name} fährt ab (${targetDirection}) mit Reisegeschwindigkeit (${loco.vMid}) [💡 Licht an]`, 'info');
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

        // Ankunftsrichtung der angekommenen Lokomotive im Zielblock merken
        const destBlock = this.blockManager.getBlock(toBlockId);
        const locoId = destBlock?.currentLocoId || destBlock?.reservedForLocoId;
        if (locoId) {
          this.locoArrivalDirection.set(locoId, r.direction);
        }

        // Falls voriger Block noch belegt war, freigeben
        this.blockManager.freeBlock(r.fromBlockId);
        this.clearBlockTimer(r.fromBlockId);

        // Signale wieder auf Halt (HP0) zurückstellen
        if (r.signalSettings) {
          for (const ss of r.signalSettings) {
            this.events.onSignalSet?.(ss.signalId, 'HP0');
          }
        }
      }
    }
  }

  /**
   * Wird aufgerufen, wenn ein Zug das IN-Ereignis im Zielblock ausgelöst hat.
   * Prüft Block-Typ, Zug-Typ, plant Haltezeiten oder veranlasst Durchfahrten.
   */
  notifyTrainArrival(blockId: string, locoId: string): void {
    const block = this.blockManager.getBlock(blockId);
    const loco = this.locoManager.getLoco(locoId);
    if (!block || !loco) return;

    // Kopfbahnhof- / Stumpfgleis-Erkennung:
    // Wenn alle Ausfahrten aus diesem Block in die Gegenrichtung der Ankunft führen,
    // führen wir sofort am Bahnsteig / Haltepunkt einen Richtungswechsel durch!
    const arrivalDir = this.locoArrivalDirection.get(loco.id);
    const outgoingRoutes = Array.from(this.routes.values()).filter((r) => r.fromBlockId === blockId);

    if (arrivalDir && outgoingRoutes.length > 0) {
      const oppositeLayoutDir: '+' | '-' = arrivalDir === '+' ? '-' : '+';
      const allRoutesOpposite = outgoingRoutes.every((r) => r.direction === oppositeLayoutDir);

      if (allRoutesOpposite) {
        const oldDccDir = loco.direction;
        const newDccDir: Direction = oldDccDir === 'FWD' ? 'REV' : 'FWD';
        this.locoManager.setSpeed(loco.id, 0, newDccDir);
        // Spitzenlicht (F0 / F1) sicherstellen/auffrischen für die neue Fahrtrichtung
        this.ensureLocoLights(loco.id);
        this.locoArrivalDirection.set(loco.id, oppositeLayoutDir);
        this.events.onLog(
          `[Automatik] 🔄 Richtungswechsel am Bahnsteig (${block.name}): ${loco.name} wechselt Fahrtrichtung von ${oldDccDir} auf ${newDccDir} (Kopfbahnhof/Stumpfgleis - Spitzenlicht F0 umgeschaltet).`,
          'info'
        );
      }
    }

    if (!this.automaticModeActive) return;

    // Falls bereits ein Halte-/Abfahrts-Countdown für diesen Block läuft, nicht neu starten
    if (this.departureTimers.has(blockId)) return;

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

  resetActiveRoutes(): void {
    for (const r of this.routes.values()) {
      if (r.active) {
        r.active = false;
        this.turnoutManager.unlockTurnouts(r.id);
        this.events.onRouteUpdated(r);
        this.events.onLog(`[Fahrstraße] ${r.name} aufgelöst / zurückgesetzt.`, 'info');
      }
    }
    this.turnoutManager.unlockAll();
  }

  toggleAutomaticMode(active?: boolean): boolean {
    this.automaticModeActive = active !== undefined ? active : !this.automaticModeActive;

    if (this.automaticModeActive) {
      this.events.onLog('AUTOGARIUM / AUTOMATIK-MODUS AKTIVIERT.', 'info');
      // Für alle Züge, die aktuell auf der Anlage aufgestellt sind, das Licht (F0 / F1) einschalten
      for (const block of this.blockManager.getAllBlocks()) {
        if (block.currentLocoId) {
          this.ensureLocoLights(block.currentLocoId);
        }
      }
      this.startAutoLoop();
    } else {
      this.events.onLog('AUTOGARIUM / AUTOMATIK-MODUS GESTOPPT.', 'warn');
      if (this.autoLoopTimer) {
        clearInterval(this.autoLoopTimer);
        this.autoLoopTimer = undefined;
      }
      this.clearAllTimers();
      this.resetActiveRoutes();
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
    if (!this.automaticModeActive) return;
    if (this.events.isEmergencyStop?.()) return;

    const blocks = this.blockManager.getAllBlocks();
    for (const block of blocks) {
      if (block.state === 'OCCUPIED' && block.currentLocoId) {
        const loco = this.locoManager.getLoco(block.currentLocoId);
        const isRouteActive = Array.from(this.routes.values()).some((r) => r.fromBlockId === block.id && r.active);
        // Zug darf nur abgefertigt werden wenn:
        // 1. Lok steht (speed === 0)
        // 2. Lok ist tatsächlich diesem Block zugeordnet (currentBlockId === block.id)
        // 3. Kein aktiver Abfahrtstimer läuft
        // 4. Keine Fahrstraße von diesem Block aktiv ist
        if (
          loco &&
          loco.speed === 0 &&
          loco.currentBlockId === block.id &&
          !this.departureTimers.has(block.id) &&
          !isRouteActive
        ) {
          this.tryDispatchNext(block.id);
        }
      }
    }
  }

  private tryDispatchNext(fromBlockId: string): boolean {
    if (!this.automaticModeActive) return false;
    if (this.events.isEmergencyStop?.()) return false;

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
          // Sensorprüfung: Der Zielblock MUSS für diese Fahrtrichtung reale, konfigurierte Sensoren haben!
          const sensors = r.direction === '+' ? toBlock.sensorsPlus : toBlock.sensorsMinus;
          if (!sensors.enter || !sensors.in) {
            continue;
          }
          if (this.events.isBlockSensorsConfigured && !this.events.isBlockSensorsConfigured(toBlock.id, r.direction)) {
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

  /**
   * Schaltet für eine Lokomotive das Spitzenlicht ein (F0 und ggf. F1 / konfigurierte Lichtfunktionen)
   */
  private ensureLocoLights(locoId: string): void {
    const loco = this.locoManager.getLoco(locoId);
    if (!loco) return;

    // F0 ist der NMRA-Standard für Spitzenlicht
    this.locoManager.setFunction(loco.id, 0, true);

    // Prüfen, ob weitere Funktionen als Licht konfiguriert sind (z.B. F1) oder aktiv gespeichert waren
    if (loco.functionLabels) {
      for (const [fnStr, label] of Object.entries(loco.functionLabels)) {
        const fnIdx = parseInt(fnStr, 10);
        if (!isNaN(fnIdx) && /licht|light|spitze|scheinwerfer/i.test(label)) {
          this.locoManager.setFunction(loco.id, fnIdx, true);
        }
      }
    } else if (loco.functions[1] === true) {
      // Falls keine Labels definiert sind, aber F1 aktiv hinterlegt war (z.B. Amori701)
      this.locoManager.setFunction(loco.id, 1, true);
    }
  }
}
