// Tests für Lebenszeichen und Spannungsmeldungen des DCC-EX-Treibers
// Ausführen: npm run build && node --test scripts/test_dccex_driver.mjs
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { DccExDriver } from '../server/dist/hal/DccExDriver.js';

function makeDriver(isSerial) {
  const d = new DccExDriver(isSerial, 'x');
  const sent = [];
  const power = [];
  const conn = [];
  d.sendRaw = (c) => sent.push(c);
  d.callbacks = {
    onSensorChanged: () => {},
    onPowerChanged: (p) => power.push(p),
    onConnectionChanged: (c) => conn.push(c),
    onLog: () => {}
  };
  d.connected = true;
  // Kein echter Port/Socket im Test: Wiederverbindung nur zählen
  let reconnects = 0;
  d.connectSerial = async () => { reconnects++; return false; };
  d.connectTcp = async () => { reconnects++; return false; };
  return { d, sent, power, conn, reconnects: () => reconnects };
}

beforeEach(() => mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 0 }));
afterEach(() => mock.timers.reset());

describe('DCC-EX Lebenszeichen', () => {
  test('TCP: kein periodisches Polling (Socket-Keepalive übernimmt)', () => {
    const { d, sent } = makeDriver(false);
    d.startHeartbeat();
    mock.timers.tick(120000);
    assert.deepEqual(sent, []);
  });

  test('Seriell: alle 30 s <#> statt <s>', () => {
    const { d, sent } = makeDriver(true);
    d.startHeartbeat();
    mock.timers.tick(30000); d.handleIncomingData('<# 50>');
    mock.timers.tick(30000); d.handleIncomingData('<# 50>');
    assert.deepEqual(sent, ['<#>', '<#>']);
  });

  test('Seriell: ohne Antwort > 75 s wird die Verbindung als getrennt gemeldet', () => {
    const { d, conn, reconnects } = makeDriver(true);
    d.startHeartbeat();
    mock.timers.tick(90000);
    assert.equal(d.connected, false);
    assert.deepEqual(conn, [false]);
    mock.timers.tick(4000);
    assert.equal(reconnects(), 1, 'Auto-Reconnect wird angestoßen');
  });
});

describe('DCC-EX Gleisspannung', () => {
  test('Mehrfache gleiche Meldungen (je Gleisausgang) lösen nur ein Ereignis aus', () => {
    const { d, power } = makeDriver(false);
    d.handleIncomingData('<p1 MAIN><p1 PROG><p1><p1 A><p1 B>');
    d.handleIncomingData('<p1 MAIN><p1 PROG>');
    assert.deepEqual(power, [true]);
  });

  test('Echte Wechsel werden weitergegeben', () => {
    const { d, power } = makeDriver(false);
    d.handleIncomingData('<p1 MAIN><p0 MAIN><p0 PROG><p1 MAIN>');
    assert.deepEqual(power, [true, false, true]);
  });

  test('Nach Trennung wird der Zustand erneut gemeldet', () => {
    const { d, power } = makeDriver(false);
    d.handleIncomingData('<p1 MAIN>');
    d.handleDisconnected('Test');
    d.connected = true;
    d.handleIncomingData('<p1 MAIN>');
    assert.deepEqual(power, [true, true]);
  });
});
