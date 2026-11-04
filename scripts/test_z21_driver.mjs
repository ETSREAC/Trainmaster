// Tests fuer die Lokadress-Kodierung des Server-Z21-Treibers (Z21-Spez. §4.1)
// Ausfuehren: npm run build && node --test scripts/test_z21_driver.mjs
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Z21Driver } from '../server/dist/hal/Z21Driver.js';
import { Z21Simulator } from './z21_simulator.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Z21Driver: Adresskodierung', () => {
  const cases = [
    [1, [0x00, 0x01]],
    [3, [0x00, 0x03]],
    [99, [0x00, 0x63]],
    [100, [0x00, 0x64]],   // frueher faelschlich als lange Adresse kodiert
    [127, [0x00, 0x7f]],   // letzte kurze Adresse
    [128, [0xc0, 0x80]],   // erste lange Adresse
    [255, [0xc0, 0xff]],
    [256, [0xc1, 0x00]],
    [1000, [0xc3, 0xe8]],
    [9999, [0xe7, 0x0f]]
  ];
  for (const [addr, expected] of cases) {
    test(`Adresse ${addr}`, () => {
      assert.deepEqual(Z21Driver.encodeLocoAddress(addr), expected);
    });
  }
});

describe('Z21Driver gegen Z21-Simulator', () => {
  let sim;
  let driver;
  before(async () => {
    sim = new Z21Simulator({ port: 0, host: '127.0.0.1' });
    await sim.start();
    driver = new Z21Driver('127.0.0.1', sim.port);
    await driver.connect({ onSensorChanged() {}, onPowerChanged() {}, onConnectionChanged() {}, onLog() {} });
  });
  after(async () => {
    await driver.disconnect();
    await sim.stop();
  });

  test('Fahren und Funktionen fuer kurze und lange Adressen landen bei der richtigen Lok', async () => {
    const addrs = [3, 100, 127, 128, 9999];
    for (const a of addrs) {
      await driver.setLocoSpeed(a, 40, 'FWD');
      await driver.setLocoFunction(a, 0, true);
    }
    await sleep(300);
    assert.deepEqual(sim.errors, [], 'Simulator meldet Protokollfehler');
    for (const a of addrs) {
      const l = sim.loco(a);
      assert.equal(l.speed, 41, `Fahrstufe Lok ${a}`);
      assert.equal(l.fwd, true, `Richtung Lok ${a}`);
      assert.equal(l.functions & 1, 1, `F0 Lok ${a}`);
    }
    // Keine Lok darf unter einer falschen Adresse angelegt worden sein
    assert.deepEqual([...sim.locos.keys()].sort((x, y) => x - y), addrs);
  });
});
