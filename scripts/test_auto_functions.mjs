// Tests: Welche Lokfunktionen schaltet der Automatikbetrieb ein? (Lok-Editor, Tab "Funktionen")
// Ausfuehren: npm run build && node --test scripts/test_auto_functions.mjs
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { getAutoFunctions, sanitizeAutoFunctions, sanitizeFunctionLabels } from '../server/dist/engine/locoFunctions.js';
import { LocoManager } from '../server/dist/engine/LocoManager.js';
import { BlockManager } from '../server/dist/engine/BlockManager.js';
import { TurnoutManager } from '../server/dist/engine/TurnoutManager.js';
import { RouteEngine } from '../server/dist/engine/RouteEngine.js';

const noop = () => {};

// Funktionsnamen wie bei der Gueterzuglok in server/data/layout.json
const BR_LABELS = {
  0: '💡 F0 Licht (Spitzenlicht)', 1: '🔊 F1 Sound ein (Motor/Aufrüsten)', 2: '🎺 F2 Lokpfeife hoch-lang',
  4: '🔦 F4 Fernlicht', 8: '🚨 F8 Spitzenlicht hinten', 9: '🐢 F9 Rangiergang',
  11: '💡 F11 Licht FS2', 12: '💡 F12 Licht FS1'
};

function makeLoco(over = {}) {
  return {
    id: 'L', name: 'BR 218', dccAddress: 3, speed: 0, targetSpeed: 0, direction: 'FWD', functions: {},
    vMin: 10, vMid: 55, vMax: 100, lengthCm: 25, trainType: 'FREIGHT', currentBlockId: 'blk', ...over
  };
}

/** Echte Engines verdrahten, Lok steht in einem Block, Automatik einschalten. */
function startAutomatic(loco) {
  const switched = [];
  const lm = new LocoManager([loco], {
    onLocoUpdated: noop, onSpeedChanged: noop, onLog: noop,
    onFunctionChanged: (l, fn, on) => switched.push([fn, on])
  });
  const bm = new BlockManager([{
    id: 'blk', name: 'Bf Gleis 1', type: 'STATION', lengthCm: 200, state: 'OCCUPIED',
    currentLocoId: loco.id, reservedForLocoId: null, direction: '+',
    sensorsPlus: { enter: 'sA', in: 'sB' }, sensorsMinus: { enter: 'sB', in: 'sA' }
  }], { onBlockUpdated: noop, onEnterTriggered: noop, onInTriggered: noop, onGhostDetected: noop, onLog: noop });
  const tm = new TurnoutManager([], { onTurnoutUpdated: noop, onLog: noop });
  const re = new RouteEngine([], bm, tm, lm, { onRouteUpdated: noop, onLog: noop });
  re.toggleAutomaticMode(true);
  re.toggleAutomaticMode(false);
  return { switched, lm };
}

beforeEach(() => mock.timers.enable({ apis: ['setInterval', 'setTimeout'] }));
afterEach(() => mock.timers.reset());

describe('Automatik-Funktionen: Regeln', () => {
  test('ohne Einstellung nur F0', () => {
    assert.deepEqual(getAutoFunctions({}), [0]);
  });
  test('leere Liste = Automatik schaltet nichts', () => {
    assert.deepEqual(getAutoFunctions({ autoFunctions: [] }), []);
  });
  test('Eingaben werden bereinigt (Bereich, ganze Zahlen, Doppelte, Sortierung)', () => {
    assert.deepEqual(sanitizeAutoFunctions([12, 0, 0, -1, 29, 1.5, '3', 4, null]), [0, 4, 12]);
    assert.equal(sanitizeAutoFunctions(undefined), undefined);
    assert.equal(sanitizeAutoFunctions('0,1'), undefined);
  });
  test('Funktionsnamen: Klammern entfernt, Laenge begrenzt, leere/ungueltige entfallen', () => {
    assert.deepEqual(
      sanitizeFunctionLabels({ 0: ' 💡 Licht ', 1: '<b>Sound</b>', 2: '   ', 40: 'zu hoch', x: 'kein Index', 3: 'x'.repeat(80) }),
      { 0: '💡 Licht', 1: 'bSound/b', 3: 'x'.repeat(64) }
    );
    assert.equal(sanitizeFunctionLabels({ 0: '' }), undefined);
    assert.equal(sanitizeFunctionLabels(null), undefined);
  });
});

describe('Automatik-Funktionen: RouteEngine beim Start der Automatik', () => {
  test('Fehlerbild von vorher: Lok mit vielen "Licht"-Namen bekommt nur F0', () => {
    const { switched } = startAutomatic(makeLoco({ functionLabels: BR_LABELS }));
    assert.deepEqual(switched, [[0, true]], 'Fernlicht, Spitzenlicht hinten, Licht FS1/FS2 duerfen nicht angehen');
  });

  test('im Lok-Editor gewaehlte Funktionen werden eingeschaltet, sonst keine', () => {
    const { switched } = startAutomatic(makeLoco({ functionLabels: BR_LABELS, autoFunctions: [0, 1, 12] }));
    assert.deepEqual(switched, [[0, true], [1, true], [12, true]]);
  });

  test('keine Automatik-Funktionen gewaehlt: nichts wird geschaltet', () => {
    const { switched } = startAutomatic(makeLoco({ functionLabels: BR_LABELS, autoFunctions: [] }));
    assert.deepEqual(switched, []);
  });

  test('Lok ohne Funktionsnamen: nur F0 (frueher zusaetzlich F1, wenn F1 gespeichert an war)', () => {
    const { switched } = startAutomatic(makeLoco({ functions: { 0: true, 1: true } }));
    assert.deepEqual(switched, [[0, true]]);
  });
});

describe('Automatik-Funktionen: Speichern ueber den Lok-Editor', () => {
  test('UPDATE_LOCO uebernimmt Namen und Automatik-Tasten bereinigt', () => {
    const { lm } = startAutomatic(makeLoco());
    lm.updateLoco({ ...makeLoco(), functionLabels: { 0: 'Licht', 4: '<i>Fernlicht</i>' }, autoFunctions: [4, 0, 99] });
    const l = lm.getLoco('L');
    assert.deepEqual(l.functionLabels, { 0: 'Licht', 4: 'iFernlicht/i' });
    assert.deepEqual(l.autoFunctions, [0, 4]);
  });

  test('alte Loks ohne Feld bleiben beim Laden beim Standard (kein Feld = nur F0)', () => {
    const lm = new LocoManager([makeLoco()], { onLocoUpdated: noop, onSpeedChanged: noop, onFunctionChanged: noop, onLog: noop });
    assert.equal(lm.getLoco('L').autoFunctions, undefined);
    assert.equal(JSON.stringify(lm.getLoco('L')).includes('autoFunctions'), false, 'layout.json bleibt unveraendert');
  });
});
