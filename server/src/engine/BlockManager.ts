import { Block, BlockState, Locomotive } from '../types.js';

export interface BlockEvents {
  onBlockUpdated: (block: Block) => void;
  onEnterTriggered: (block: Block, loco: Locomotive) => void;
  onInTriggered: (block: Block, loco: Locomotive) => void;
  onGhostDetected: (block: Block, sensorId: string) => void;
  isAutomaticMode?: () => boolean;
  isBlockDeparting?: (blockId: string) => boolean;
  isSensorInActiveRoute?: (sensorId: string) => boolean;
  isAnyRouteActive?: () => boolean;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

export class BlockManager {
  private blocks: Map<string, Block> = new Map();
  private sensorToBlockMap: Map<string, Array<{ blockId: string; role: 'enter' | 'in'; direction: '+' | '-' }>> = new Map();
  private recentlyFreedBlocks: Map<string, number> = new Map();
  private events: BlockEvents;

  constructor(initialBlocks: Block[], events: BlockEvents) {
    this.events = events;
    for (const b of initialBlocks) {
      const type = b.type || (b.name.toLowerCase().includes('strecke') ? 'MAINLINE' : 'STATION');
      const minWait = b.minWaitTimeSec !== undefined ? b.minWaitTimeSec : (type === 'MAINLINE' ? 0 : 10);
      const maxWait = b.maxWaitTimeSec !== undefined ? b.maxWaitTimeSec : (type === 'MAINLINE' ? 0 : 25);
      this.blocks.set(b.id, {
        ...b,
        type,
        minWaitTimeSec: minWait,
        maxWaitTimeSec: maxWait
      });
    }
    this.rebuildSensorMapping();
  }

  private rebuildSensorMapping(): void {
    this.sensorToBlockMap.clear();

    const addMapping = (sensorId: string, blockId: string, role: 'enter' | 'in', direction: '+' | '-') => {
      if (!sensorId) return;
      let list = this.sensorToBlockMap.get(sensorId);
      if (!list) {
        list = [];
        this.sensorToBlockMap.set(sensorId, list);
      }
      list.push({ blockId, role, direction });
    };

    for (const block of this.blocks.values()) {
      if (block.sensorsPlus.enter) addMapping(block.sensorsPlus.enter, block.id, 'enter', '+');
      if (block.sensorsPlus.in) addMapping(block.sensorsPlus.in, block.id, 'in', '+');
      if (block.sensorsMinus.enter) addMapping(block.sensorsMinus.enter, block.id, 'enter', '-');
      if (block.sensorsMinus.in) addMapping(block.sensorsMinus.in, block.id, 'in', '-');
    }
  }

  getBlock(blockId: string): Block | undefined {
    return this.blocks.get(blockId);
  }

  getAllBlocks(): Block[] {
    return Array.from(this.blocks.values());
  }

  updateBlock(updatedBlock: Block): void {
    this.blocks.set(updatedBlock.id, { ...updatedBlock });
    this.rebuildSensorMapping();
    this.events.onBlockUpdated(updatedBlock);
  }

  setBlockState(blockId: string, state: BlockState, currentLocoId?: string | null): void {
    const block = this.blocks.get(blockId);
    if (!block) return;
    block.state = state;
    if (currentLocoId !== undefined) {
      block.currentLocoId = currentLocoId;
    }
    this.events.onBlockUpdated(block);
  }

  assignLocoToBlock(locoId: string, blockId: string | null): void {
    // Falls die Lok vorher in einem anderen Block war, diesen freigeben
    for (const block of this.blocks.values()) {
      if (block.currentLocoId === locoId) {
        block.currentLocoId = null;
        block.state = 'FREE';
        this.events.onBlockUpdated(block);
      }
    }

    if (blockId) {
      const targetBlock = this.blocks.get(blockId);
      if (targetBlock) {
        targetBlock.currentLocoId = locoId;
        targetBlock.state = 'OCCUPIED';
        this.events.onBlockUpdated(targetBlock);
        this.events.onLog(`Lok ${locoId} Block ${targetBlock.name} zugewiesen.`, 'info');
      }
    }
  }

  reserveBlock(blockId: string, locoId: string, direction?: '+' | '-'): boolean {
    const block = this.blocks.get(blockId);
    if (!block) return false;
    if (block.state !== 'FREE') return false;

    block.state = 'RESERVED';
    block.reservedForLocoId = locoId;
    if (direction) {
      block.direction = direction;
    }
    this.events.onBlockUpdated(block);
    this.events.onLog(`Block ${block.name} für Lok ${locoId} reserviert (Richtung: ${block.direction}).`, 'info');
    return true;
  }

  freeBlock(blockId: string): void {
    const block = this.blocks.get(blockId);
    if (!block) return;
    block.state = 'FREE';
    block.currentLocoId = null;
    block.reservedForLocoId = null;
    this.recentlyFreedBlocks.set(blockId, Date.now());
    this.events.onBlockUpdated(block);
    this.events.onLog(`Block ${block.name} freigegeben.`, 'info');
  }

  isBlockRecentlyFreed(blockId: string, gracePeriodMs = 12000): boolean {
    const ts = this.recentlyFreedBlocks.get(blockId);
    if (!ts) return false;
    return Date.now() - ts < gracePeriodMs;
  }

  handleSensorTrigger(sensorId: string, active: boolean, getLocoById: (id: string) => Locomotive | undefined): void {
    if (!active) return; // Wir reagieren auf High-Flanke (Zug fährt ein)

    const mappings = this.sensorToBlockMap.get(sensorId);
    if (!mappings || mappings.length === 0) return;

    // Finde den passenden Block: Bevorzuge Blöcke, die RESERVED oder OCCUPIED sind
    let chosenMapping: { blockId: string; role: 'enter' | 'in'; direction: '+' | '-' } | null = null;
    let chosenBlock: Block | null = null;

    // 1. Suche nach einem Block im Zustand RESERVED (Zug nähert sich)
    for (const m of mappings) {
      const b = this.blocks.get(m.blockId);
      if (b && b.state === 'RESERVED') {
        if (m.direction === b.direction) {
          chosenMapping = m;
          chosenBlock = b;
          break;
        } else if (!chosenMapping) {
          chosenMapping = m;
          chosenBlock = b;
        }
      }
    }

    // 2. Falls kein RESERVED gefunden wurde, suche nach OCCUPIED (z.B. für IN-Event)
    if (!chosenBlock) {
      for (const m of mappings) {
        const b = this.blocks.get(m.blockId);
        if (b && b.state === 'OCCUPIED') {
          if (m.direction === b.direction) {
            chosenMapping = m;
            chosenBlock = b;
            break;
          } else if (!chosenMapping) {
            chosenMapping = m;
            chosenBlock = b;
          }
        }
      }
    }

    // 3. Wenn weder RESERVED noch OCCUPIED: nimm den ersten Eintrag (Geisterzug-Prüfung)
    if (!chosenBlock) {
      const m = mappings[0];
      chosenMapping = m;
      chosenBlock = this.blocks.get(m.blockId) || null;
    }

    if (!chosenBlock || !chosenMapping) return;

    // Prüfe Geisterzug vs. manuelle Gleisbelegung vs. Ausfahr-/Nachlauf-Ereignisse
    if (chosenBlock.state === 'FREE') {
      const isAuto = this.events.isAutomaticMode ? this.events.isAutomaticMode() : false;
      if (isAuto) {
        // 1. War dieser Block kürzlich freigegeben (z. B. nachfolgende Wagen/Achsen überrollen noch Kontakte)?
        if (this.isBlockRecentlyFreed(chosenBlock.id)) {
          this.events.onLog(
            `[Ausfahr-Nachlauf] Rückmelder "${sensorId}" in kürzlich freigegebenem Block "${chosenBlock.name}" ausgelöst (Freigabe-Toleranz aktiv, kein Geisterzug).`,
            'info'
          );
          return;
        }

        // 2. Gehört der Sensor zu einem Block in einer aktiven Fahrstraße (Ausfahrt oder Zielanfahrt)?
        if (this.events.isSensorInActiveRoute?.(sensorId)) {
          this.events.onLog(
            `[Fahrstraße] Rückmelder "${sensorId}" gehört zu einer aktiven Zugfahrt (Geisterzug unterdrückt).`,
            'info'
          );
          return;
        }

        // 3. Fährt gerade ein Zug von diesem Block ab (oder wurde gerade abgefertigt)?
        if (this.events.isBlockDeparting?.(chosenBlock.id)) {
          this.events.onLog(
            `[Ausfahrt] Rückmelder "${sensorId}" in abfahrendem Block "${chosenBlock.name}" ausgelöst (Ausfahrmaske aktiv, kein Geisterzug).`,
            'info'
          );
          return;
        }

        chosenBlock.state = 'GHOST';
        this.events.onBlockUpdated(chosenBlock);
        this.events.onGhostDetected(chosenBlock, sensorId);
        this.events.onLog(`GEISTERZUG ERKANNT in Block ${chosenBlock.name}! Unangemeldeter Sensor ${sensorId} ausgelöst!`, 'error');
        return;
      } else {
        // Im manuellen / Einrichtbetrieb: Block einfach auf OCCUPIED setzen ohne Not-Halt
        chosenBlock.state = 'OCCUPIED';
        this.events.onBlockUpdated(chosenBlock);
        this.events.onLog(`[Sensor] Rückmelder "${sensorId}" in Block ${chosenBlock.name} aktiv -> Gleis als BELEGT markiert.`, 'info');
        return;
      }
    }

    const locoId = chosenBlock.reservedForLocoId || chosenBlock.currentLocoId;
    if (!locoId) {
      return;
    }

    const loco = getLocoById(locoId);
    if (!loco) return;

    // AUSFAHRMASKE (Departure Masking):
    // Nur wenn dieser Block der STARTBLOCK einer aktiven Fahrstraße ist (Zug fährt aus diesem Block ab):
    // Dürfen Trigger auf den Kontakten dieses Startblocks KEIN erneutes IN (Stoppen!) oder ENTER auslösen!
    const isDeparting = this.events.isBlockDeparting ? this.events.isBlockDeparting(chosenBlock.id) : false;

    if (isDeparting) {
      this.events.onLog(
        `[Ausfahrt] Zug "${loco.name}" passiert Ausfahrkontakt / Rückmelder "${sensorId}" (Rolle: ${chosenMapping.role.toUpperCase()}) in Block "${chosenBlock.name}" (Ausfahrmaske aktiv - Weiterfahrt unbeeinflusst).`,
        'info'
      );
      return;
    }

    if (chosenMapping.role === 'enter') {
      chosenBlock.state = 'OCCUPIED';
      chosenBlock.currentLocoId = loco.id;
      chosenBlock.reservedForLocoId = null;
      this.events.onBlockUpdated(chosenBlock);
      this.events.onEnterTriggered(chosenBlock, loco);
      this.events.onLog(`[ENTER] Lok ${loco.name} in Block ${chosenBlock.name} eingefahren.`, 'info');
    } else if (chosenMapping.role === 'in') {
      const wasMoving = loco.speed > 0;
      chosenBlock.state = 'OCCUPIED';
      chosenBlock.currentLocoId = loco.id;
      chosenBlock.reservedForLocoId = null;

      // Automatische Block-Freigabe: Wenn die Lok im Zielblock am Haltepunkt (IN) angekommen ist,
      // darf kein vorheriger Block mehr als durch diese Lok belegt gelten
      for (const [bId, b] of this.blocks.entries()) {
        if (bId !== chosenBlock.id && b.currentLocoId === loco.id) {
          b.currentLocoId = null;
          b.state = 'FREE';
          this.recentlyFreedBlocks.set(bId, Date.now());
          this.events.onBlockUpdated(b);
          this.events.onLog(`[Block] Vorheriger Block ${b.name} freigegeben (Lok ${loco.name} hat Haltepunkt in ${chosenBlock.name} erreicht).`, 'info');
        }
      }

      this.events.onBlockUpdated(chosenBlock);
      this.events.onInTriggered(chosenBlock, loco);
      if (wasMoving) {
        this.events.onLog(`[IN] Lok ${loco.name} hat Haltepunkt in Block ${chosenBlock.name} erreicht (Stopp).`, 'info');
      }
    }
  }
}
