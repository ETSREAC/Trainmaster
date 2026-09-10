import { Block, BlockState, Locomotive } from '../types.js';

export interface BlockEvents {
  onBlockUpdated: (block: Block) => void;
  onEnterTriggered: (block: Block, loco: Locomotive) => void;
  onInTriggered: (block: Block, loco: Locomotive) => void;
  onGhostDetected: (block: Block, sensorId: string) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

export class BlockManager {
  private blocks: Map<string, Block> = new Map();
  private sensorToBlockMap: Map<string, { blockId: string; role: 'enter' | 'in'; direction: '+' | '-' }> = new Map();
  private events: BlockEvents;

  constructor(initialBlocks: Block[], events: BlockEvents) {
    this.events = events;
    for (const b of initialBlocks) {
      this.blocks.set(b.id, { ...b });
    }
    this.rebuildSensorMapping();
  }

  private rebuildSensorMapping(): void {
    this.sensorToBlockMap.clear();
    for (const block of this.blocks.values()) {
      if (block.sensorsPlus.enter) {
        this.sensorToBlockMap.set(block.sensorsPlus.enter, { blockId: block.id, role: 'enter', direction: '+' });
      }
      if (block.sensorsPlus.in) {
        this.sensorToBlockMap.set(block.sensorsPlus.in, { blockId: block.id, role: 'in', direction: '+' });
      }
      if (block.sensorsMinus.enter) {
        this.sensorToBlockMap.set(block.sensorsMinus.enter, { blockId: block.id, role: 'enter', direction: '-' });
      }
      if (block.sensorsMinus.in) {
        this.sensorToBlockMap.set(block.sensorsMinus.in, { blockId: block.id, role: 'in', direction: '-' });
      }
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

    const mapping = this.sensorToBlockMap.get(sensorId);
    if (!mapping) return;

    const block = this.blocks.get(mapping.blockId);
    if (!block) return;

    // Prüfe Geisterzug
    if (block.state === 'FREE') {
      block.state = 'GHOST';
      this.events.onBlockUpdated(block);
      this.events.onGhostDetected(block, sensorId);
      this.events.onLog(`GEISTERZUG ERKANNT in Block ${block.name}! Unangemeldeter Sensor ${sensorId} ausgelöst!`, 'error');
      return;
    }

    const locoId = block.reservedForLocoId || block.currentLocoId;
    if (!locoId) {
      return;
    }

    const loco = getLocoById(locoId);
    if (!loco) return;

    if (mapping.role === 'enter') {
      block.state = 'OCCUPIED';
      block.currentLocoId = loco.id;
      block.reservedForLocoId = null;
      this.events.onBlockUpdated(block);
      this.events.onEnterTriggered(block, loco);
      this.events.onLog(`[ENTER] Lok ${loco.name} in Block ${block.name} eingefahren.`, 'info');
    } else if (mapping.role === 'in') {
      this.events.onInTriggered(block, loco);
      this.events.onLog(`[IN] Lok ${loco.name} hat Haltepunkt in Block ${block.name} erreicht.`, 'info');
    }
  }
}
