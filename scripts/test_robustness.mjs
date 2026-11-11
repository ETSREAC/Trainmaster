// Tests zum Review "Datenverlust, Betriebslogik, Eingabeprüfung" (v1.14.0)
// Ausführen: npm run build && node --test scripts/test_robustness.mjs
import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { StorageManager } from '../server/dist/storage/StorageManager.js';
import { LocoManager } from '../server/dist/engine/LocoManager.js';
import { BBTEngine } from '../server/dist/engine/BBTEngine.js';
import { BlockManager } from '../server/dist/engine/BlockManager.js';
import { TurnoutManager } from '../server/dist/engine/TurnoutManager.js';
import { RouteEngine } from '../server/dist/engine/RouteEngine.js';
import { Z21Driver } from '../server/dist/hal/Z21Driver.js';
import { WioDriver } from '../server/dist/hal/WioDriver.js';
import {
  sanitizeBBTEntry, sanitizeSettingsPatch, sanitizeRoutes, sanitizeTurnout, toNetLabel, toHost
} from '../server/dist/validate.js';
import { Z21Simulator } from './z21_simulator.mjs';

const noop = () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `tm-${name}-`));

const loco = (over = {}) => ({
  id: 'L', name: 'BR 218', dccAddress: 3, speed: 0, targetSpeed: 0, direction: 'FWD', functions: {},
  vMin: 10, vMid: 55, vMax: 100, lengthCm: 25, trainType: 'FREIGHT', currentBlockId: null, ...over
});
const block = (id, over = {}) => ({
  id, name: id, type: 'STATION', lengthCm: 200, state: 'FREE', currentLocoId: null, reservedForLocoId: null,
  direction: '+', sensorsPlus: { enter: `${id}-e`, in: `${id}-i` }, sensorsMinus: { enter: `${id}-i`, in: `${id}-e` }, ...over
});
const locoEvents = (over = {}) => ({ onLocoUpdated: noop, onSpeedChanged: noop, onFunctionChanged: noop, onLog: noop, ...over });
const blockEvents = { onBlockUpdated: noop, onEnterTriggered: noop, onInTriggered: noop, onGhostDetected: noop, onLog: noop };

describe('Layout-Datei: kein Datenverlust', () => {
  test('beschädigte Datei wird nicht überschrieben, die Sicherung wird wiederhergestellt', () => {
    const dir = tmpDir('storage');
    const file = path.join(dir, 'layout.local.json');
    try {
      // 1. Start: Demo-Layout, danach eigene Lok speichern
      let sm = new StorageManager(dir);
      const data = sm.ensureSettings(sm.loadData());
      data.locos = [loco({ id: 'meine-lok', name: 'Meine Lok' })];
      sm.saveData(data);
      // 2. Start: lädt sauber und legt dabei die Sicherung (.bak) an
      sm = new StorageManager(dir);
      assert.equal(sm.loadData().locos[0].id, 'meine-lok');
      assert.ok(fs.existsSync(`${file}.bak`), '.bak fehlt');
      // Datei wird abgeschnitten (Absturz mitten im Schreiben)
      fs.writeFileSync(file, '{"locos":[{"id":"meine-lok","na');
      // 3. Start: Sicherung statt Demo-Layout
      sm = new StorageManager(dir);
      const recovered = sm.loadData();
      assert.equal(recovered.locos[0].id, 'meine-lok', 'eigene Lok muss erhalten bleiben');
      assert.match(sm.loadWarning, /beschädigt/);
      const corrupt = fs.readdirSync(dir).filter((f) => f.includes('.corrupt-'));
      assert.equal(corrupt.length, 1, 'beschädigte Datei muss aufbewahrt werden');
      assert.equal(fs.readFileSync(path.join(dir, corrupt[0]), 'utf8'), '{"locos":[{"id":"meine-lok","na');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Datei mit BOM (Windows-Editor) wird gelesen', () => {
    const dir = tmpDir('bom');
    try {
      fs.writeFileSync(path.join(dir, 'layout.local.json'), String.fromCharCode(0xfeff) + JSON.stringify({ locos: [loco({ id: 'bom-lok' })] }));
      const sm = new StorageManager(dir);
      const data = sm.ensureSettings(sm.loadData());
      assert.equal(data.locos[0].id, 'bom-lok');
      assert.equal(sm.loadWarning, null);
      assert.deepEqual(data.blocks, [], 'fehlende Listen werden ergänzt');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Speichern hinterlässt keine Temp-Datei und WIO-Einstellungen bleiben erhalten', () => {
    const dir = tmpDir('atomic');
    try {
      const sm = new StorageManager(dir);
      const data = sm.ensureSettings(sm.loadData());
      data.settings.wio = { enabled: false, udpPort: 9000 };
      sm.saveData(data);
      assert.ok(!fs.existsSync(path.join(dir, 'layout.local.json.tmp')));
      const again = new StorageManager(dir);
      assert.deepEqual(again.ensureSettings(again.loadData()).settings.wio, { enabled: false, udpPort: 9000 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Lok-Befehle: nur gültige Werte', () => {
  test('ungültige Fahrstufe wird verworfen (kein NaN an die Zentrale)', () => {
    const sent = [];
    const lm = new LocoManager([loco({ speed: 40 })], locoEvents({ onSpeedChanged: (l) => sent.push(l.speed) }));
    for (const bad of ['abc', NaN, null, undefined, {}, Infinity]) {
      assert.equal(lm.setSpeed('L', bad), false);
    }
    assert.equal(lm.getLoco('L').speed, 40);
    assert.deepEqual(sent, []);
    assert.equal(lm.setSpeed('L', 999, 'SIDEWAYS'), true);
    assert.equal(lm.getLoco('L').speed, 128);
    assert.equal(lm.getLoco('L').direction, 'FWD');
  });

  test('ungültige Funktion und ungültige DCC-Adresse werden abgelehnt', () => {
    const lm = new LocoManager([loco()], locoEvents());
    assert.equal(lm.setFunction('L', 'x', true), false);
    assert.equal(lm.setFunction('L', 99, true), false);
    assert.equal(lm.setFunction('L', 2, true), true);
    assert.equal(lm.addLoco(loco({ id: 'neu', dccAddress: '3 1>' })), false);
    assert.equal(lm.addLoco(loco({ id: 'neu', dccAddress: 0 })), false);
    assert.equal(lm.addLoco(loco({ id: 'L' })), false, 'vorhandene ID darf nicht überschrieben werden');
    assert.equal(lm.addLoco(loco({ id: 'neu', dccAddress: 4711, speed: 90, currentBlockId: 'x' })), true);
    assert.equal(lm.getLoco('neu').speed, 0, 'neue Lok startet mit Fahrstufe 0');
    assert.equal(lm.updateLoco(loco({ dccAddress: 'abc' })), false);
    assert.equal(lm.getLoco('L').dccAddress, 3);
  });
});

describe('BBT: erneutes ENTER startet die Rampe nicht neu', () => {
  test('Prellen des ENTER-Melders verlängert die Bremsung nicht', () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
    try {
      const run = (retriggers) => {
        const l = loco({ speed: 60 });
        const speeds = [];
        const bbt = new BBTEngine(
          [{ locoId: 'L', blockId: 'b', direction: '+', steps: 10, intervalMs: 50, vStart: 60, vMin: 10, locked: true, history: [] }],
          { onSpeedStep: (_id, s) => { l.speed = s; speeds.push(s); }, onBBTUpdated: noop, onLog: noop }
        );
        bbt.startBraking(l, 'b', '+');
        let elapsed = 0;
        for (let i = 0; i < 40 && l.speed > 10; i++) {
          mock.timers.tick(50);
          elapsed += 50;
          if (retriggers.includes(i)) bbt.startBraking(l, 'b', '+');
        }
        return elapsed;
      };
      const clean = run([]);
      const bouncing = run([1, 3, 5]);
      assert.equal(bouncing, clean, 'Rampe darf durch Nachtrigger nicht länger dauern');
      assert.equal(clean, 500);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('Bearbeiten überschreibt keinen Live-Zustand', () => {
  test('Block: Belegung bleibt, Objekt bleibt dasselbe', () => {
    const bm = new BlockManager([block('b1', { state: 'OCCUPIED', currentLocoId: 'L' })], blockEvents);
    const ref = bm.getBlock('b1');
    const updated = bm.updateBlock({ ...block('b1'), name: 'Neuer Name', lengthCm: 300 }, true);
    assert.equal(updated, ref, 'Referenz muss gültig bleiben');
    assert.equal(ref.name, 'Neuer Name');
    assert.equal(ref.state, 'OCCUPIED');
    assert.equal(ref.currentLocoId, 'L');
    // Gleiches Objekt als Eingabe darf den Block nicht leeren
    bm.updateBlock(ref, true);
    assert.equal(ref.name, 'Neuer Name');
    assert.deepEqual(ref.sensorsPlus, { enter: 'b1-e', in: 'b1-i' });
  });

  test('Weiche: verriegelte Weiche wird durch "invertiert" nicht umgestellt', () => {
    const commands = [];
    const tm = new TurnoutManager(
      [{ id: 'w1', name: 'W1', address: 5, state: 'STRAIGHT', inverted: false, locked: false }],
      { onTurnoutUpdated: (t) => commands.push(`${t.address}:${t.state}`), onLog: noop }
    );
    assert.equal(tm.lockTurnouts([{ turnoutId: 'w1', state: 'DIVERGENT' }], 'route-1'), true);
    commands.length = 0;
    const cfgOnly = [];
    assert.equal(tm.updateTurnoutConfig({ id: 'w1', name: 'W1', address: 5, inverted: true }, (t) => cfgOnly.push(t.id)), 'LOCKED');
    assert.deepEqual(commands, [], 'kein Stellbefehl');
    assert.equal(tm.getTurnout('w1').inverted, false);
    // Nur der Name: erlaubt, ohne Stellbefehl, Verriegelung bleibt
    assert.equal(tm.updateTurnoutConfig({ id: 'w1', name: 'Einfahrt', address: 5, inverted: false }, (t) => cfgOnly.push(t.id)), 'OK');
    assert.deepEqual(commands, []);
    assert.deepEqual(cfgOnly, ['w1']);
    assert.equal(tm.getTurnout('w1').locked, true);
    assert.equal(tm.getTurnout('w1').state, 'DIVERGENT');
  });

  test('Fahrstraßen ersetzen: aktive bleibt aktiv, entfernte wird aufgelöst', () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    try {
      const lm = new LocoManager([loco({ currentBlockId: 'a' })], locoEvents());
      const bm = new BlockManager([block('a', { state: 'OCCUPIED', currentLocoId: 'L' }), block('b'), block('c')], blockEvents);
      const tm = new TurnoutManager([{ id: 'w1', name: 'W1', address: 1, state: 'STRAIGHT', locked: false }], { onTurnoutUpdated: noop, onLog: noop });
      const routes = [
        { id: 'r-ab', name: 'A-B', fromBlockId: 'a', toBlockId: 'b', direction: '+', turnoutSettings: [{ turnoutId: 'w1', state: 'DIVERGENT' }], active: false },
        { id: 'r-ac', name: 'A-C', fromBlockId: 'a', toBlockId: 'c', direction: '+', turnoutSettings: [], active: false }
      ];
      const signals = [];
      const re = new RouteEngine(routes, bm, tm, lm, { onRouteUpdated: noop, onSignalSet: (id, a) => signals.push(`${id}:${a}`), onLog: noop });
      assert.equal(re.requestRoute('a', 'b'), true);
      const active = re.getRoute('r-ab');

      // Neu generierte Liste enthält dieselbe Fahrstraße (active:false vom Client)
      re.setRoutes([{ ...routes[0], name: 'A nach B', active: false }, routes[1]]);
      assert.equal(re.getRoute('r-ab'), active, 'gleiches Objekt');
      assert.equal(active.active, true);
      assert.equal(active.name, 'A nach B');
      assert.equal(tm.getTurnout('w1').locked, true);

      // Liste ohne die aktive Fahrstraße: Weiche frei, Zielblock frei
      re.setRoutes([routes[1]]);
      assert.equal(tm.getTurnout('w1').locked, false);
      assert.equal(bm.getBlock('b').state, 'FREE');
      assert.equal(bm.getBlock('a').currentLocoId, 'L', 'Startblock bleibt belegt');
      re.toggleAutomaticMode(false);
    } finally {
      mock.timers.reset();
    }
  });
});

describe('Eingabeprüfung', () => {
  test('BBT-Profil: Intervall 0 und Millionen Schritte werden begrenzt', () => {
    const e = sanitizeBBTEntry({ locoId: 'L', blockId: 'b', direction: '+', steps: 1e9, intervalMs: 0, vStart: 500, vMin: -3, locked: 1 });
    assert.deepEqual([e.steps, e.intervalMs, e.vStart, e.vMin, e.locked], [500, 20, 128, 0, true]);
    assert.equal(sanitizeBBTEntry({ locoId: 'L', blockId: 'b', direction: 'x' }), null);
    assert.equal(sanitizeBBTEntry(null), null);
  });

  test('Einstellungen: nur bekannte Schlüssel, geprüfte Adressen', () => {
    const current = {
      commandStation: { type: 'DCC_EX', connectionType: 'TCP', host: '192.168.1.20', port: 2560, serialPort: 'COM3', baudRate: 115200 },
      scale: 'H0', targetCreepMs: 1200, ghostDetectionActive: true
    };
    const next = sanitizeSettingsPatch(
      { evil: 1, __proto__: { polluted: true }, scale: 'XXL', targetCreepMs: 'abc', commandStation: { type: 'Z21', host: 'a b;rm', port: 99999, z21Host: '192.168.0.111', dccHost: '192.168.1.20' } },
      current
    );
    assert.equal(next.evil, undefined);
    assert.equal({}.polluted, undefined);
    assert.equal(next.scale, 'H0');
    assert.equal(next.targetCreepMs, 1200);
    assert.equal(next.commandStation.type, 'Z21');
    assert.equal(next.commandStation.host, '192.168.1.20', 'ungültiger Host wird nicht übernommen');
    assert.equal(next.commandStation.port, 2560);
    assert.equal(next.commandStation.dccHost, '192.168.1.20');
    assert.equal(next.commandStation.z21Host, '192.168.0.111');
  });

  test('Texte aus dem Netzwerk und Hosts', () => {
    assert.equal(toNetLabel('<img src=x onerror=alert(1)>', 'ESP'), 'img srcx onerroralert(1)');
    assert.ok(!/[<>"'&=]/.test(toNetLabel('"><script>x</script>&', 'ESP')));
    assert.equal(toNetLabel('', 'ESP'), 'ESP');
    assert.equal(toHost('192.168.1.5'), '192.168.1.5');
    assert.equal(toHost('z21.local'), 'z21.local');
    assert.equal(toHost('http://evil/'), null);
    assert.equal(toHost('1.2.3.4:80'), null);
  });

  test('Weichen und Fahrstraßen', () => {
    assert.equal(sanitizeTurnout({ id: 'w', name: 'W', address: '3 1> <T 9 1' }), null);
    const t = sanitizeTurnout({ id: 'w', name: 'W', address: 7, state: 'DIVERGENT', locked: true, lockedByRouteId: 'x' });
    assert.deepEqual([t.address, t.state, t.locked, t.lockedByRouteId], [7, 'DIVERGENT', false, null]);
    assert.equal(sanitizeRoutes('nope'), null);
    assert.equal(sanitizeRoutes([{ id: 'r', fromBlockId: 'a' }]), null);
    const r = sanitizeRoutes([{ id: 'r', name: 'Gl 1 -> Strecke', fromBlockId: 'a', toBlockId: 'b', direction: '-', turnoutSettings: [], active: true }]);
    assert.equal(r[0].active, false, 'active kommt nie vom Client');
    assert.equal(r[0].name, 'Gl 1 -> Strecke');
  });
});

describe('Z21: Verbindungsstatus und Rückmeldungen', () => {
  let sim;
  let driver;
  const events = { sensors: [], power: [], conn: [], stops: 0, turnouts: [] };
  before(async () => {
    sim = new Z21Simulator({ port: 0, host: '127.0.0.1' });
    await sim.start();
  });
  after(async () => {
    await driver?.disconnect();
    await sim.stop();
  });

  test('ohne Antwort der Zentrale nicht "verbunden", später automatisch verbunden', async () => {
    sim.offline = true;
    driver = new Z21Driver('127.0.0.1', sim.port);
    const ok = await driver.connect({
      onSensorChanged: (a, s) => events.sensors.push(`${a}:${s}`),
      onPowerChanged: (p) => events.power.push(p),
      onConnectionChanged: (c) => events.conn.push(c),
      onEmergencyStop: () => events.stops++,
      onTurnoutFeedback: (a, s) => events.turnouts.push(`${a}:${s}`),
      onLog: noop
    });
    assert.equal(ok, false);
    assert.equal(driver.isConnected(), false);
    assert.deepEqual(events.conn, []);

    sim.offline = false;
    for (let i = 0; i < 50 && !driver.isConnected(); i++) await sleep(100);
    assert.equal(driver.isConnected(), true, 'Zentrale wieder da -> verbunden');
    assert.deepEqual(events.conn, [true]);
    await sleep(200);
    assert.deepEqual(sim.errors, [], 'Simulator meldet Protokollfehler');
    assert.deepEqual(events.power, [true], 'Gleisspannung wird nach dem Verbinden abgefragt');
  });

  test('R-Bus-Rückmelder, Gleisspannung, Not-Halt und Weichenlage werden ausgewertet', async () => {
    // LAN_RMBUS_DATACHANGED Gruppe 0: Modul 1 Eingang 1 und 3, Modul 2 Eingang 8
    const rm = Buffer.alloc(15);
    rm.writeUInt16LE(15, 0); rm.writeUInt16LE(0x80, 2); rm[4] = 0; rm[5] = 0b00000101; rm[6] = 0b10000000;
    sim.sendRawToAll(rm);
    await sleep(150);
    assert.deepEqual(events.sensors, ['1:true', '3:true', '16:true']);
    rm[5] = 0b00000100;
    sim.sendRawToAll(rm);
    await sleep(150);
    assert.deepEqual(events.sensors.slice(3), ['1:false']);

    sim.setTrackPower(false);
    await sleep(150);
    assert.deepEqual(events.power, [true, false]);

    const x = (bytes) => Buffer.from([bytes.length + 5, 0, 0x40, 0, ...bytes, bytes.reduce((a, b) => a ^ b, 0)]);
    sim.sendRawToAll(x([0x81, 0x00])); // LAN_X_BC_STOPPED
    sim.sendRawToAll(x([0x43, 0x00, 0x04, 0x02])); // Weiche 5: Ausgang 2 = Gerade
    sim.sendRawToAll(x([0x43, 0x00, 0x04, 0x01])); // Weiche 5: Ausgang 1 = Abzweig
    await sleep(150);
    assert.equal(events.stops, 1);
    assert.deepEqual(events.turnouts, ['5:STRAIGHT', '5:DIVERGENT']);
  });
});

describe('WIO: Daten aus dem Netzwerk', () => {
  test('Namen werden bereinigt, Unit/Pin geprüft, Anzahl der Module begrenzt', () => {
    const triggered = [];
    const wio = new WioDriver(18999, { onSensorTriggered: (e) => triggered.push(e) });
    wio.parseJsonPacket({ event: 'connect', unit: 7, nodename: '<img src=x onerror=alert(1)>', version: '"><b>' }, '{}', '192.168.77.10');
    const node = wio.getDiscoveredNodes()[0];
    assert.ok(!/[<>"'=&]/.test(node.name + node.clientver), `unbereinigt: ${node.name} / ${node.clientver}`);
    assert.equal(node.unit, 7);

    wio.parseJsonPacket({ unit: '__proto__', pin: 'x', state: true }, '{}', '192.168.77.10');
    assert.equal(triggered.at(-1).unit, 33, 'ungültige Unit fällt auf den Standard zurück');
    assert.equal(triggered.at(-1).pin, undefined);

    for (let i = 0; i < 300; i++) wio.parseJsonPacket({ event: 'heartbeat', unit: i }, '{}', '192.168.77.11');
    assert.ok(wio.getDiscoveredNodes().length <= 64);

    // Eigener Such-Broadcast ist kein Sensorereignis
    const before = triggered.length;
    wio.handleIncomingDatagram(Buffer.from('<query unit="0"/>'), '192.168.77.12');
    assert.equal(triggered.length, before);
  });
});

describe('Server (isoliert gestartet)', () => {
  const PORT = 3113;
  const base = `http://127.0.0.1:${PORT}`;
  const dir = path.resolve('scripts/.tmp-robustness-e2e');
  const dataFile = path.join(dir, 'data', 'layout.local.json');
  let srv;
  let ws;
  const messages = [];
  const send = (type, payload) => ws.send(JSON.stringify({ type, payload }));
  const waitFor = async (pred, ms = 3000) => {
    for (let t = 0; t < ms; t += 25) {
      const hit = messages.find(pred);
      if (hit) return hit;
      await sleep(25);
    }
    throw new Error('Erwartete Nachricht kam nicht');
  };

  before(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    const d = JSON.parse(fs.readFileSync('server/data/layout.json', 'utf8'));
    d.settings.commandStation = { type: 'VIRTUAL', connectionType: 'TCP' };
    d.settings.wio = { enabled: false, udpPort: 18073 };
    if (d.settings.ambientLighting) d.settings.ambientLighting.enabled = false;
    // Zustand der "letzten Sitzung": fahrende Lok, aktive Fahrstraße, verriegelte Weiche
    d.locos[0].speed = 77;
    if (d.routes[0]) d.routes[0].active = true;
    if (d.turnouts[0]) { d.turnouts[0].locked = true; d.turnouts[0].lockedByRouteId = d.routes[0]?.id || 'x'; }
    fs.writeFileSync(dataFile, JSON.stringify(d));
    srv = spawn(process.execPath, [path.resolve('server/dist/index.js')], { cwd: dir, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try { up = (await fetch(`${base}/api/status`)).ok; } catch { /* startet noch */ }
      if (!up) await sleep(100);
    }
    if (!up) throw new Error('Server nicht gestartet');
    ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    await waitFor((m) => m.type === 'INITIAL_STATE');
  });

  after(async () => {
    ws?.close();
    srv?.kill();
    await sleep(300);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('Neustart verwirft den Laufzeitzustand der letzten Sitzung', () => {
    const init = messages.find((m) => m.type === 'INITIAL_STATE').payload;
    assert.equal(init.locos[0].speed, 0);
    assert.ok(init.routes.every((r) => r.active === false));
    assert.ok(init.turnouts.every((t) => t.locked === false));
  });

  test('Not-Halt: Fahrbefehl wird abgelehnt statt nur angezeigt', async () => {
    const id = messages.find((m) => m.type === 'INITIAL_STATE').payload.locos[0].id;
    send('EMERGENCY_STOP');
    await waitFor((m) => m.type === 'STATUS_UPDATE' && m.payload.emergencyStop === true);
    messages.length = 0;
    send('SET_LOCO_SPEED', { locoId: id, speed: 80 });
    await waitFor((m) => m.type === 'LOCO_UPDATED' && m.payload.id === id);
    const locos = await (await fetch(`${base}/api/locos`)).json();
    assert.equal(locos.find((l) => l.id === id).speed, 0, 'Fahrstufe darf während Not-Halt nicht übernommen werden');
    send('RESUME_STOP');
    await waitFor((m) => m.type === 'STATUS_UPDATE' && m.payload.emergencyStop === false);
    send('SET_LOCO_SPEED', { locoId: id, speed: 'abc' });
    send('SET_LOCO_SPEED', { locoId: id, speed: 30 });
    await waitFor((m) => m.type === 'LOCO_UPDATED' && m.payload.speed === 30);
    send('SET_LOCO_SPEED', { locoId: id, speed: 0 });
  });

  test('Block bearbeiten überschreibt die Belegung nicht', async () => {
    const init = (await (await fetch(`${base}/api/status`)).json());
    assert.ok(init);
    messages.length = 0;
    send('CREATE_BLOCK', { id: 'blk-test', name: 'Test', lengthCm: 100, state: 'OCCUPIED', currentLocoId: 'gibt-es-nicht', direction: '+', sensorsPlus: { enter: '', in: '' }, sensorsMinus: { enter: '', in: '' } });
    const created = await waitFor((m) => m.type === 'BLOCK_UPDATED' && m.payload.id === 'blk-test');
    assert.equal(created.payload.state, 'FREE', 'neuer Block ist frei');
    const locoId = (await (await fetch(`${base}/api/locos`)).json())[0].id;
    send('ASSIGN_LOCO_TO_BLOCK', { locoId, blockId: 'blk-test' });
    await waitFor((m) => m.type === 'BLOCK_UPDATED' && m.payload.id === 'blk-test' && m.payload.currentLocoId === locoId);
    messages.length = 0;
    send('UPDATE_BLOCK', { id: 'blk-test', name: 'Umbenannt', lengthCm: 120, state: 'FREE', currentLocoId: null, direction: '+', sensorsPlus: { enter: '', in: '' }, sensorsMinus: { enter: '', in: '' } });
    const updated = await waitFor((m) => m.type === 'BLOCK_UPDATED' && m.payload.id === 'blk-test');
    assert.equal(updated.payload.name, 'Umbenannt');
    assert.equal(updated.payload.state, 'OCCUPIED');
    assert.equal(updated.payload.currentLocoId, locoId);
  });

  test('X-Forwarded-For wird ignoriert: kein Modul unter fremder IP', async () => {
    const res = await fetch(`${base}/api/wio/sensor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.99.99.99' },
      body: JSON.stringify({ event: 'connect', unit: 9, nodename: 'Fake' })
    });
    assert.equal(res.status, 200);
    const { nodes } = await (await fetch(`${base}/api/wio/nodes`)).json();
    assert.ok(!nodes.some((n) => n.ip === '10.99.99.99'), 'gefälschte Absender-IP wurde übernommen');
  });

  test('GET /api/wio/scan startet keinen Scan mehr', async () => {
    const t0 = Date.now();
    const res = await (await fetch(`${base}/api/wio/scan`)).json();
    assert.equal(res.success, true);
    assert.ok(Date.now() - t0 < 500);
  });

  test('Änderungen werden gebündelt und atomar gespeichert', async () => {
    await sleep(2600); // länger als die maximale Bündelzeit
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.ok(saved.blocks.some((b) => b.id === 'blk-test' && b.name === 'Umbenannt'));
    assert.ok(!fs.existsSync(`${dataFile}.tmp`));
    assert.ok(fs.existsSync(`${dataFile}.bak`), 'Sicherung des geladenen Stands');
  });
});
