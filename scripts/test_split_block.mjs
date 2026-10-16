// Tests für die 50/50-Gleisaufteilung (Spec: .kiro/specs/split-block-haltepunkt)
// Ausführen: npm run build && npm run test:split
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { SplitBlockEngine, planStop } from '../server/dist/engine/SplitBlockEngine.js';
import { BlockManager } from '../server/dist/engine/BlockManager.js';
import { BBTEngine } from '../server/dist/engine/BBTEngine.js';
import { LocoManager } from '../server/dist/engine/LocoManager.js';
import { TrackTopology } from '../server/dist/engine/TrackTopology.js';

const noop = () => {};
const SA = 'sensor-A'; // belegt 0..50 %
const SB = 'sensor-B'; // belegt 50..100 %

function makeBlock(over = {}) {
  return {
    id: 'blk', name: 'Bf Gleis 1', type: 'STATION', lengthCm: 200, state: 'RESERVED',
    currentLocoId: null, reservedForLocoId: 'L', direction: '+',
    sensorsPlus: { enter: SA, in: SB }, sensorsMinus: { enter: SB, in: SA },
    stopMode: 'SPLIT', ...over
  };
}
function makeLoco(over = {}) {
  return {
    id: 'L', name: 'Testzug', dccAddress: 3, speed: 55, targetSpeed: 55, direction: 'FWD', functions: {},
    vMin: 10, vMid: 55, vMax: 100, lengthCm: 25, trainType: 'PASSENGER', currentBlockId: null, ...over
  };
}

/**
 * Verdrahtet die echten Engines wie server/src/index.ts und simuliert die Fahrphysik:
 * Geschwindigkeit = K × Fahrstufe. Melder lösen aus, sobald die Zugspitze ihren Abschnitt erreicht.
 */
function setupRig({ block = makeBlock(), loco = makeLoco(), K = 0.0004, prevBlock = true } = {}) {
  const log = [];
  const ins = [];
  let split, bbt, bm;
  const lm = new LocoManager([loco], {
    onLocoUpdated: noop, onFunctionChanged: noop, onLog: noop,
    onSpeedChanged: (l) => split.notifySpeed(l.id, l.speed)
  });
  bbt = new BBTEngine([], { onSpeedStep: (id, s) => lm.setSpeed(id, s), onBBTUpdated: noop, onLog: noop });
  split = new SplitBlockEngine({
    onSpeedStep: (id, s) => lm.setSpeed(id, s),
    onVirtualIn: (id, blockId) => bm.triggerVirtualIn(blockId, lm.getLoco(id)),
    onLog: (m, lvl) => log.push(`${lvl}: ${m}`)
  });
  const blocks = [block];
  if (prevBlock) {
    blocks.push({ id: 'prev', name: 'Strecke', lengthCm: 100, state: 'OCCUPIED', currentLocoId: 'L', reservedForLocoId: null,
      direction: '+', sensorsPlus: { enter: '', in: '' }, sensorsMinus: { enter: '', in: '' } });
  }
  bm = new BlockManager(blocks, {
    onBlockUpdated: noop, onGhostDetected: noop, onLog: noop,
    onEnterTriggered: (b, l) => {
      const r = split.onFirstSensor(b, l, b.direction);
      if (r.mode === 'SPLIT' && (r.duplicate || r.target === 'SIGNAL')) return;
      bbt.startBraking(l, b.id, b.direction);
    },
    onInTriggered: (b, l) => { ins.push(b.id); bbt.handleInEvent(l, b.id, b.direction); },
    onSplitSecondSensor: (b, l, dir) => {
      bbt.handleInEvent(l, b.id, dir, { stop: false });
      return split.onSecondSensor(b, l, dir, bbt.getEntry(l.id, b.id, dir));
    }
  });

  const getLoco = (id) => lm.getLoco(id);
  const blk = bm.getBlock(block.id);
  const splitCm = block.lengthCm * (block.trackSplitRatio ?? 0.5);
  // Melder A/B je nach Fahrtrichtung (A = ENTER der Richtung)
  const first = block.direction === '+' ? block.sensorsPlus.enter : block.sensorsMinus.enter;
  const second = block.direction === '+' ? block.sensorsPlus.in : block.sensorsMinus.in;

  function drive({ startX = -20, maxMs = 60000, dt = 5 } = {}) {
    let x = startX; // Zugspitze in cm ab Blockanfang (in Fahrtrichtung)
    let firedA = false, firedB = false, stillMs = 0;
    for (let t = 0; t < maxMs; t += dt) {
      mock.timers.tick(dt);
      const l = lm.getLoco('L');
      x += K * l.speed * dt;
      if (!firedA && x >= 0) { firedA = true; bm.handleSensorTrigger(first, true, getLoco); }
      if (!firedB && x >= splitCm) { firedB = true; bm.handleSensorTrigger(second, true, getLoco); }
      if (l.speed === 0) { stillMs += dt; if (stillMs > 500) break; } else stillMs = 0;
    }
    return { x, firedA, firedB };
  }
  return { lm, bbt, split, bm, blk, ins, log, drive, getLoco, first, second };
}

/** Uhr in kleinen Schritten vorstellen, damit auch in Callbacks neu geplante Timer laufen. */
function advance(ms, dt = 5) {
  for (let t = 0; t < ms; t += dt) mock.timers.tick(dt);
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 }));
afterEach(() => mock.timers.reset());

describe('planStop (reine Planung)', () => {
  test('geplante Strecke entspricht der Reststrecke', () => {
    const k = 0.0004;
    const p = planStop({ startSpeed: 55, vMin: 10, cmPerStepMs: k, distanceCm: 92, rampSteps: 45, rampIntervalMs: 80 });
    assert.equal(p.steps.at(-1), 10);
    assert.ok(Math.abs(p.plannedDistanceCm - 92) < 0.5, `geplant ${p.plannedDistanceCm}`);
  });
  test('zu kurze Reststrecke verkürzt das Rampenintervall', () => {
    const p = planStop({ startSpeed: 80, vMin: 10, cmPerStepMs: 0.0004, distanceCm: 20, rampSteps: 60, rampIntervalMs: 120 });
    assert.ok(p.intervalMs < 120);
    assert.ok(p.plannedDistanceCm <= 20.5);
  });
  test('bereits auf Kriechstufe: nur Kriechen', () => {
    const p = planStop({ startSpeed: 10, vMin: 10, cmPerStepMs: 0.0004, distanceCm: 22.5, rampSteps: 10, rampIntervalMs: 80 });
    assert.deepEqual(p.steps, []);
    assert.equal(p.creepMs, Math.round(22.5 / (0.0004 * 10)));
  });
});

describe('Konfiguration & Strategie', () => {
  test('ohne stopMode = Punktmelder (Req 1.1)', () => {
    assert.equal(SplitBlockEngine.resolveConfig(makeBlock({ stopMode: undefined }), '+'), null);
    assert.equal(SplitBlockEngine.resolveConfig(makeBlock({ stopMode: 'POINT' }), '+'), null);
  });
  test('ungültige SPLIT-Konfiguration liefert Grund (Req 1.5)', () => {
    assert.ok(SplitBlockEngine.resolveConfig(makeBlock({ sensorsPlus: { enter: SA, in: '' } }), '+').reason);
    assert.ok(SplitBlockEngine.resolveConfig(makeBlock({ sensorsPlus: { enter: SA, in: SA } }), '+').reason);
    assert.ok(SplitBlockEngine.resolveConfig(makeBlock({ lengthCm: 0 }), '+').reason);
  });
  test('Werte werden begrenzt (Req 7.5)', () => {
    const { config } = SplitBlockEngine.resolveConfig(makeBlock({ trackSplitRatio: 0.95, centerStopMarginCm: -5, signalStopMarginCm: 500, stopPolicy: 'XYZ' }), '+');
    assert.equal(config.ratio, 0.8);
    assert.equal(config.centerStopMarginCm, 0);
    assert.equal(config.signalStopMarginCm, 100);
    assert.equal(config.policy, 'AUTO_BY_LENGTH');
  });
  test('Strategie nach Zuglänge und Overrides (Req 2)', () => {
    const { config } = SplitBlockEngine.resolveConfig(makeBlock(), '+');
    assert.equal(SplitBlockEngine.resolveTarget(config, makeLoco({ lengthCm: 25 })), 'CENTER');
    assert.equal(SplitBlockEngine.resolveTarget(config, makeLoco({ lengthCm: 100 })), 'CENTER');
    assert.equal(SplitBlockEngine.resolveTarget(config, makeLoco({ lengthCm: 101 })), 'SIGNAL');
    assert.equal(SplitBlockEngine.resolveTarget(config, makeLoco({ lengthCm: 0 })), 'SIGNAL');
    assert.equal(SplitBlockEngine.resolveTarget({ ...config, policy: 'PLATFORM_CENTER' }, makeLoco({ lengthCm: 160 })), 'CENTER');
    assert.equal(SplitBlockEngine.resolveTarget({ ...config, policy: 'SIGNAL' }, makeLoco({ lengthCm: 25 })), 'SIGNAL');
  });
});

describe('Fahrsimulation (Akzeptanzkriterien)', () => {
  test('Kurzzug 25 cm hält mit Zugmitte bei 100…115 cm (Req 3.3)', (t) => {
    const rig = setupRig({ loco: makeLoco({ lengthCm: 25 }) });
    const { x } = rig.drive();
    const center = x - 25 / 2;
    t.diagnostic(`Zugmitte ${center.toFixed(1)} cm`);
    assert.ok(center >= 100 && center <= 115, `Zugmitte bei ${center.toFixed(1)} cm`);
    assert.deepEqual(rig.ins, ['blk'], 'genau ein (virtueller) IN');
    assert.equal(rig.blk.state, 'OCCUPIED');
    assert.equal(rig.bm.getBlock('prev').state, 'FREE', 'vorheriger Block freigegeben (Req 7.4)');
  });

  test('Langzug 160 cm hält mit Spitze bei 190…195 cm, Zugende im Block (Req 4.3)', (t) => {
    const rig = setupRig({ loco: makeLoco({ lengthCm: 160 }) });
    const { x } = rig.drive();
    t.diagnostic(`Zugspitze ${x.toFixed(1)} cm, Zugende ${(x - 160).toFixed(1)} cm`);
    assert.ok(x >= 190 && x <= 195, `Spitze bei ${x.toFixed(1)} cm`);
    assert.ok(x - 160 >= 0, 'Zugende innerhalb des Blocks (Einfahrweiche frei)');
    assert.deepEqual(rig.ins, ['blk']);
  });

  test('Langzug fährt bis Melder B ohne Bremsung (Req 4.1)', () => {
    const rig = setupRig({ loco: makeLoco({ lengthCm: 160 }) });
    rig.lm.setSpeed('L', 55);
    rig.bm.handleSensorTrigger(rig.first, true, rig.getLoco);
    advance(2000);
    assert.equal(rig.lm.getLoco('L').speed, 55);
  });

  test('Gegenrichtung: gleiche Logik spiegelverkehrt (Req 6)', () => {
    const rig = setupRig({ block: makeBlock({ direction: '-' }), loco: makeLoco({ lengthCm: 160 }) });
    assert.equal(rig.first, SB);
    assert.equal(rig.second, SA);
    const { x } = rig.drive();
    assert.ok(x >= 190 && x <= 195, `Spitze bei ${x.toFixed(1)} cm`);
  });

  test('Messung passt sich langsameren und schnelleren Loks an (Req 5)', (t) => {
    for (const K of [0.0002, 0.0007]) {
      mock.timers.reset(); mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
      const rig = setupRig({ loco: makeLoco({ lengthCm: 160 }), K });
      const { x } = rig.drive({ maxMs: 120000 });
      t.diagnostic(`K=${K}: Zugspitze ${x.toFixed(1)} cm`);
      assert.ok(x >= 190 && x <= 195, `K=${K}: Spitze bei ${x.toFixed(1)} cm`);
    }
  });

  test('Punktmelder-Block unverändert: Halt sofort an Melder B (Req 1.2)', () => {
    const rig = setupRig({ block: makeBlock({ stopMode: undefined }), loco: makeLoco({ lengthCm: 160 }) });
    const { x } = rig.drive();
    assert.ok(Math.abs(x - 100) < 1, `Spitze bei ${x.toFixed(1)} cm`);
  });

  test('Ungültige SPLIT-Konfiguration fällt auf Punktmelder zurück (Req 1.5)', () => {
    const rig = setupRig({ block: makeBlock({ lengthCm: 0 }), loco: makeLoco({ lengthCm: 160 }) });
    rig.lm.setSpeed('L', 55);
    rig.bm.handleSensorTrigger(rig.first, true, rig.getLoco);
    assert.ok(rig.log.some((l) => l.startsWith('warn') && l.includes('Punktmelder')));
  });
});

describe('Sicherheit & Robustheit', () => {
  test('Not-Halt bricht den Halteplan ab, kein virtueller IN (Req 7.1)', () => {
    const rig = setupRig({ loco: makeLoco({ lengthCm: 160 }) });
    rig.lm.setSpeed('L', 55);
    rig.bm.handleSensorTrigger(rig.first, true, rig.getLoco);
    advance(3000);
    rig.bm.handleSensorTrigger(rig.second, true, rig.getLoco);
    assert.equal(rig.split.isRunning('L'), true);
    rig.split.cancelAll(); // wie triggerEmergencyStop
    rig.lm.setSpeed('L', 0);
    advance(60000);
    assert.deepEqual(rig.ins, []);
    assert.equal(rig.lm.getLoco('L').speed, 0);
  });

  test('Prellen von Melder A/B während des Plans wird ignoriert (Req 7.2)', () => {
    const rig = setupRig({ loco: makeLoco({ lengthCm: 160 }) });
    rig.lm.setSpeed('L', 55);
    rig.bm.handleSensorTrigger(rig.first, true, rig.getLoco);
    advance(3000);
    rig.bm.handleSensorTrigger(rig.second, true, rig.getLoco);
    rig.bm.handleSensorTrigger(rig.second, true, rig.getLoco);
    rig.bm.handleSensorTrigger(rig.first, true, rig.getLoco);
    assert.equal(rig.split.isRunning('L'), true);
    advance(60000);
    assert.deepEqual(rig.ins, ['blk'], 'genau ein IN');
  });

  test('Melder B ohne Melder A: sofortiger Halt + Warnung (Req 5.2)', () => {
    const rig = setupRig({ loco: makeLoco({ lengthCm: 160 }) });
    rig.lm.setSpeed('L', 55);
    rig.bm.handleSensorTrigger(rig.second, true, rig.getLoco);
    assert.deepEqual(rig.ins, ['blk']);
    assert.equal(rig.lm.getLoco('L').speed, 0);
    assert.ok(rig.log.some((l) => l.startsWith('warn')));
  });

  test('Prellen von Melder A bei stehendem Zug fährt ihn nicht wieder an', () => {
    const rig = setupRig({ loco: makeLoco({ lengthCm: 160 }) });
    rig.drive();
    assert.equal(rig.lm.getLoco('L').speed, 0);
    rig.bm.handleSensorTrigger(rig.first, true, rig.getLoco);
    advance(10000);
    assert.equal(rig.lm.getLoco('L').speed, 0);
    assert.equal(rig.ins.length, 1);
  });

  test('BBT: stehende Lok wird im Punktmelder-Modus nicht angefahren', () => {
    const steps = [];
    const bbt = new BBTEngine([], { onSpeedStep: (_, s) => steps.push(s), onBBTUpdated: noop, onLog: noop });
    bbt.startBraking(makeLoco({ speed: 0 }), 'blk', '+');
    advance(10000);
    assert.deepEqual(steps, []);
  });

  test('cancel(locoId) bricht nur den Plan dieser Lok ab (Req 7.3)', () => {
    const rig = setupRig({ loco: makeLoco({ lengthCm: 160 }) });
    rig.lm.setSpeed('L', 55);
    rig.bm.handleSensorTrigger(rig.first, true, rig.getLoco);
    advance(3000);
    rig.bm.handleSensorTrigger(rig.second, true, rig.getLoco);
    rig.split.cancel('L');
    advance(60000);
    assert.equal(rig.split.isRunning('L'), false);
    assert.deepEqual(rig.ins, []);
  });
});

describe('Automatische Melderzuordnung (Gleisplan)', () => {
  test('Gleisschleife ohne Weiche: Melder des Nachbarblocks werden nicht übernommen', () => {
    // Nachbau des realen Plans: oberes Gleis B2 (y1), unteres Gleis B1 (y3), rechts per Schleife verbunden
    const L = (type, x, y, rotation = 0, linkedId) => ({ id: `${type}-${x}-${y}`, type, x, y, rotation, linkedId });
    const layout = [
      L('CURVE', 2, 0, 270), L('STRAIGHT', 3, 0), L('STRAIGHT', 4, 0), L('STRAIGHT', 5, 0), L('STRAIGHT', 6, 0), L('CURVE', 7, 0, 0),
      L('CURVE', 2, 1, 180), L('SENSOR', 3, 1, 0, 'S2A'), L('BLOCK', 4, 1, 0, 'B2'), L('SENSOR', 5, 1, 0, 'S2E'), L('BUFFER', 6, 1),
      L('STRAIGHT', 7, 1, 90), L('STRAIGHT', 7, 2, 90),
      L('BUFFER', 2, 3, 180), L('SENSOR', 3, 3, 0, 'S1E'), L('BLOCK', 4, 3, 0, 'B1'), L('SENSOR', 5, 3, 0, 'S1A'),
      L('STRAIGHT', 6, 3), L('CURVE', 7, 3, 90)
    ];
    const blk = (id) => ({ id, name: id, lengthCm: 100, sensorsPlus: { enter: '', in: '' }, sensorsMinus: { enter: '', in: '' } });
    const res = Object.fromEntries(new TrackTopology(layout).autoAssignBlocks([blk('B1'), blk('B2')], [], []).map((a) => [a.blockId, a]));
    assert.deepEqual(res.B1.detectedSensorIds, ['S1E', 'S1A']);
    assert.deepEqual(res.B2.detectedSensorIds, ['S2A', 'S2E']);
    assert.deepEqual(res.B1.sensorsPlus, { enter: 'S1E', in: 'S1A' });
    assert.deepEqual(res.B2.sensorsPlus, { enter: 'S2A', in: 'S2E' });
  });
});
