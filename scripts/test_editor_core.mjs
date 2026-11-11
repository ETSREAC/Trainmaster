// Tests: Gleisplan-Editor gegen Fehlklicks absichern (Auswahl statt Ersetzen, Undo/Redo,
// Doppelklick-Schutz, kein Neuzeichnen während gedrückter Maustaste).
// Ausfuehren: npm run test:editor  (laedt .ts ueber tsx, auch unter Node 20)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LayoutHistory, RenderScheduler, decideGridClick, isRepeatClick, rotateBy90
} from '../client/src/editor/editorCore.ts';

const el = (id, x, y, type = 'STRAIGHT', rotation = 0) => ({ id, x, y, type, rotation });

describe('decideGridClick: kein stilles Ersetzen oder Drehen', () => {
  test('leeres Feld + Platzier-Werkzeug -> setzen', () => {
    assert.deepEqual(decideGridClick(null, 'CURVE', null), { kind: 'place' });
  });

  test('vorhandenes Element + anderes Werkzeug -> nur auswählen, nicht ersetzen', () => {
    assert.deepEqual(decideGridClick(el('a', 1, 1, 'BLOCK'), 'CURVE', null), { kind: 'select', elemId: 'a' });
  });

  test('vorhandenes Element + gleiches Werkzeug -> auswählen, nicht drehen', () => {
    assert.deepEqual(decideGridClick(el('a', 1, 1, 'STRAIGHT'), 'STRAIGHT', null), { kind: 'select', elemId: 'a' });
  });

  test('erneuter Klick auf ausgewähltes Element hebt die Auswahl auf', () => {
    assert.deepEqual(decideGridClick(el('a', 1, 1), 'STRAIGHT', 'a'), { kind: 'deselect' });
  });

  test('Löschen/Drehen/Konfigurieren wirken nur auf vorhandene Elemente', () => {
    assert.deepEqual(decideGridClick(el('a', 0, 0), 'DELETE', null), { kind: 'delete', elemId: 'a' });
    assert.deepEqual(decideGridClick(null, 'DELETE', null), { kind: 'none' });
    assert.deepEqual(decideGridClick(el('a', 0, 0), 'ROTATE', null), { kind: 'rotate', elemId: 'a' });
    assert.deepEqual(decideGridClick(null, 'ROTATE', null), { kind: 'none' });
    assert.deepEqual(decideGridClick(el('a', 0, 0), 'INSPECT', null), { kind: 'inspect', elemId: 'a' });
    assert.deepEqual(decideGridClick(null, 'INSPECT', 'a'), { kind: 'deselect' });
  });
});

describe('LayoutHistory', () => {
  test('undo stellt den Zustand vor der Änderung wieder her, redo die Änderung', () => {
    const h = new LayoutHistory();
    let layout = [el('a', 0, 0)];
    h.record(layout);
    layout = [...layout, el('b', 1, 0)];

    const undone = h.undo(layout);
    assert.deepEqual(undone.map((e) => e.id), ['a']);
    const redone = h.redo(undone);
    assert.deepEqual(redone.map((e) => e.id), ['a', 'b']);
  });

  test('Schnappschuss ist eine Kopie: spätere Mutation (Drehen) verfälscht ihn nicht', () => {
    const h = new LayoutHistory();
    const layout = [el('a', 0, 0, 'STRAIGHT', 0)];
    h.record(layout);
    layout[0].rotation = 90;
    assert.equal(h.undo(layout)[0].rotation, 0);
  });

  test('neue Änderung verwirft den Redo-Verlauf', () => {
    const h = new LayoutHistory();
    h.record([]);
    const after = h.undo([el('a', 0, 0)]);
    assert.ok(h.canRedo);
    h.record(after);
    assert.equal(h.canRedo, false);
  });

  test('Limit begrenzt die Anzahl der Schritte', () => {
    const h = new LayoutHistory(3);
    for (let i = 0; i < 10; i++) h.record([el(`e${i}`, i, 0)]);
    let n = 0;
    let cur = [];
    while ((cur = h.undo(cur))) n++;
    assert.equal(n, 3);
  });

  test('leerer Verlauf liefert null', () => {
    const h = new LayoutHistory();
    assert.equal(h.undo([]), null);
    assert.equal(h.redo([]), null);
  });
});

describe('RenderScheduler', () => {
  function setup() {
    const frames = [];
    let renders = 0;
    const s = new RenderScheduler(() => renders++, (cb) => frames.push(cb), 10_000);
    const runFrames = () => { while (frames.length) frames.shift()(); };
    return { s, runFrames, renders: () => renders };
  }

  test('viele Anfragen in einem Frame -> genau ein Neuzeichnen', () => {
    const { s, runFrames, renders } = setup();
    for (let i = 0; i < 50; i++) s.request();
    runFrames();
    assert.equal(renders(), 1);
  });

  test('während gedrückter Maustaste wird nicht neu gezeichnet, danach genau einmal', () => {
    const { s, runFrames, renders } = setup();
    s.hold();
    s.request();
    s.request();
    runFrames();
    assert.equal(renders(), 0);
    s.release();
    runFrames();
    assert.equal(renders(), 1);
  });

  test('hold zwischen Anfrage und Frame verschiebt das Neuzeichnen', () => {
    const { s, runFrames, renders } = setup();
    s.request();
    s.hold();
    runFrames();
    assert.equal(renders(), 0);
    s.release();
    runFrames();
    assert.equal(renders(), 1);
  });

  test('release ohne hold ist harmlos', () => {
    const { s, runFrames, renders } = setup();
    s.release();
    s.request();
    runFrames();
    assert.equal(renders(), 1);
    assert.equal(s.isHeld, false);
  });

  test('Sicherheits-Timeout gibt das Neuzeichnen frei, falls pointerup verloren geht', async () => {
    const frames = [];
    let renders = 0;
    const s = new RenderScheduler(() => renders++, (cb) => frames.push(cb), 20);
    s.hold();
    s.request();
    await new Promise((r) => setTimeout(r, 40));
    while (frames.length) frames.shift()();
    assert.equal(renders, 1);
  });
});

describe('Hilfsfunktionen', () => {
  test('isRepeatClick: nur der erste Klick einer Serie zählt', () => {
    assert.equal(isRepeatClick({ detail: 1 }), false);
    assert.equal(isRepeatClick({ detail: 2 }), true);
    assert.equal(isRepeatClick({ detail: 0 }), false); // Tastatur-"Klick"
    assert.equal(isRepeatClick({}), false);
  });

  test('rotateBy90 läuft im Kreis', () => {
    assert.equal(rotateBy90(0), 90);
    assert.equal(rotateBy90(270), 0);
  });
});
