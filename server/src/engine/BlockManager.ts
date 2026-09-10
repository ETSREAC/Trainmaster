import { Block, BlockState, Locomotive } from '../types.js';

export interface BlockEvents {
  onBlockUpdated: (block: Block) => void;
  onEnterTriggered: (block: Block, loco: Locomotive) => void;
  onInTriggered: (block: Block, loco: Locomotive) => void;
  onGhostDetected: (block: Block, sensorId: string) => void;
  isAutomaticMode?: () => boolean;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

export class BlockManager {
  private blocks: Map<string, Block> = new Map();
  private sensorToBlockMap: Map<string, Array<{ blockId: string; role: 'enter' | 'in'; direction: '+' | '-' }>> = new Map();
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

  reserveBlock(blockId: string, locoId: string): boolean {
    const block = this.blocks.get(blockId);
    if (!block) return false;
    if (block.state !== 'FREE') return false;

    block.state = 'RESERVED';
    block.reservedForLocoId = locoId;
    this.events.onBlockUpdated(block);
    this.events.onLog(`Block ${block.name} für Lok ${locoId} reserviert.`, 'info');
    return true;
  }

  freeBlock(blockId: string): void {
    const block = this.blocks.get(blockId);
    if (!block) return;
    block.state = 'FREE';
    block.currentLocoId = null;
    block.reservedForLocoId = null;
    this.events.onBlockUpdated(block);
    this.events.onLog(`Block ${block.name} freigegeben.`, 'info');
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

    // Prüfe Geisterzug vs. manuelle Gleisbelegung
    if (chosenBlock.state === 'FREE') {
      const isAuto = this.events.isAutomaticMode ? this.events.isAutomaticMode() : false;
      if (isAuto) {
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

    if (chosenMapping.role === 'enter') {
      chosenBlock.state = 'OCCUPIED';
      chosenBlock.currentLocoId = loco.id;
      chosenBlock.reservedForLocoId = null;
      this.events.onBlockUpdated(chosenBlock);
      this.events.onEnterTriggered(chosenBlock, loco);
      this.events.onLog(`[ENTER] Lok ${loco.name} in Block ${chosenBlock.name} eingefahren.`, 'info');
    } else if (chosenMapping.role === 'in') {
      // Auch bei IN sicherstellen, dass der Block OCCUPIED ist und die Lok fest zugeordnet ist
      chosenBlock.state = 'OCCUPIED';
      chosenBlock.currentLocoId = loco.id;
      chosenBlock.reservedForLocoId = null;
      this.events.onBlockUpdated(chosenBlock);
      this.events.onInTriggered(chosenBlock, loco);
      this.events.onLog(`[IN] Lok ${loco.name} hat Haltepunkt in Block ${chosenBlock.name} erreicht.`, 'info');
    }
  }
}
