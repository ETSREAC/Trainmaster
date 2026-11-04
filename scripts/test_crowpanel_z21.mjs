// Tests fuer den Z21-Standalone-Betrieb des CrowPanel-Drehreglers (ohne Z21-Hardware).
// Ticket: docs/tickets/TICKET_CROWPANEL_ROTARY_Z21_STANDALONE.md
//
// Ablauf: Der Firmware-Protokollcode (hardware/crowpanel_esp32_rotary/z21_protocol.cpp)
// wird zusammen mit test/z21_host_knob.cpp fuer den PC gebaut und gegen den
// unabhaengigen Z21-Simulator (scripts/z21_simulator.mjs) gefahren.
//
// Ausfuehren: node --test scripts/test_crowpanel_z21.mjs
// C++-Compiler: g++, clang++ oder "python -m ziglang c++" (pip install ziglang).
// Eigener Compiler: Umgebungsvariable Z21_TEST_CXX, z. B. "C:\venv\Scripts\python.exe -m ziglang c++".
import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Z21Simulator, xPacket, hex } from './z21_simulator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FW = path.join(ROOT, 'hardware', 'crowpanel_esp32_rotary');
const IS_WIN = process.platform === 'win32';

// ----------------------------------------------------------------------------
// Compiler suchen und Knob-Programm bauen
// ----------------------------------------------------------------------------
function findCompiler() {
  const candidates = [];
  if (process.env.Z21_TEST_CXX) {
    const parts = process.env.Z21_TEST_CXX.match(/"[^"]+"|\S+/g).map((s) => s.replace(/"/g, ''));
    candidates.push(parts);
  }
  candidates.push(['g++'], ['clang++']);
  for (const py of IS_WIN ? ['python', 'py'] : ['python3', 'python']) candidates.push([py, '-m', 'ziglang', 'c++']);
  for (const c of candidates) {
    const r = spawnSync(c[0], [...c.slice(1), '--version'], { encoding: 'utf8', shell: false });
    if (r.status === 0) return c;
  }
  return null;
}

function buildKnob() {
  const cxx = findCompiler();
  if (!cxx) return { error: 'Kein C++-Compiler gefunden (g++, clang++ oder "pip install ziglang"). Test uebersprungen.' };
  const outDir = path.join(os.tmpdir(), 'trainmaster-z21-test');
  fs.mkdirSync(outDir, { recursive: true });
  const exe = path.join(outDir, IS_WIN ? 'z21_host_knob.exe' : 'z21_host_knob');
  const args = [
    ...cxx.slice(1), '-std=c++17', '-O1', '-Wall', '-Wextra', '-Werror=return-type',
    '-o', exe, path.join(FW, 'test', 'z21_host_knob.cpp'), path.join(FW, 'z21_protocol.cpp')
  ];
  if (IS_WIN) args.push('-lws2_32');
  const r = spawnSync(cxx[0], args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    const own = (r.stderr || '').split('\n').filter((l) => /z21_/.test(l) || /error/i.test(l)).slice(0, 40).join('\n');
    throw new Error(`Build fehlgeschlagen (${cxx.join(' ')}):\n${own}`);
  }
  const ownWarnings = (r.stderr || '').split('\n').filter((l) => /z21_(protocol|host_knob)/.test(l) && /warning/.test(l));
  return { exe, compiler: cxx.join(' '), ownWarnings };
}

// ----------------------------------------------------------------------------
// Knob-Prozess steuern
// ----------------------------------------------------------------------------
class Knob {
  constructor(exe, port, timing = [150, 600, 4]) {
    this.events = [];
    this.waiters = [];
    this.proc = spawn(exe, ['127.0.0.1', String(port), ...timing.map(String)], { stdio: ['pipe', 'pipe', 'inherit'] });
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      this.events.push(ev);
      for (const w of [...this.waiters]) if (w.pred(ev)) { this.waiters.splice(this.waiters.indexOf(w), 1); clearTimeout(w.t); w.resolve(ev); }
    });
  }

  waitFor(pred, ms = 2000, what = 'Ereignis') {
    const found = this.events.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      w.t = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        reject(new Error(`Timeout: ${what}. Letzte Events: ${JSON.stringify(this.events.slice(-6))}`));
      }, ms);
      this.waiters.push(w);
    });
  }

  /** Ereignis seit Beginn des letzten Befehls abwarten (aeltere ignorieren). */
  next(pred, ms, what) {
    const start = this.lastMark ?? 0;
    return this.waitFor((ev) => this.events.indexOf(ev) >= start && pred(ev), ms, what);
  }

  async cmd(line) {
    const start = this.events.length;
    this.lastMark = start;
    const name = line.split(' ')[0];
    const p = this.waitFor((ev) => ev.ev === 'ack' && ev.cmd === name && this.events.indexOf(ev) >= start, 2000, `ack ${name}`);
    this.proc.stdin.write(line + '\n');
    await p;
    return this.events.slice(start);
  }

  async build(args) {
    const evs = await this.cmd(`build ${args}`);
    return evs.find((e) => e.ev === 'bytes').hex;
  }

  async parse(buf) {
    const evs = await this.cmd(`parsehex ${Buffer.from(buf).toString('hex')}`);
    return { events: evs.filter((e) => !['ack', 'parse_stats'].includes(e.ev)), stats: evs.find((e) => e.ev === 'parse_stats') };
  }

  async state() {
    return (await this.cmd('state')).find((e) => e.ev === 'state');
  }

  stop() {
    try { this.proc.stdin.write('quit\n'); } catch { /* bereits beendet */ }
    setTimeout(() => this.proc.kill(), 500).unref();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sentNames = (sim) => sim.received.map((r) => r.name);

// ----------------------------------------------------------------------------
let built;
try { built = buildKnob(); } catch (e) { built = { buildError: e }; }
const skip = built.error ? built.error : false;

describe('CrowPanel Z21: Build', { skip }, () => {
  test('Firmware-Protokollcode baut ohne Warnungen', () => {
    if (built.buildError) throw built.buildError;
    assert.deepEqual(built.ownWarnings, []);
  });
});

describe('CrowPanel Z21: Paket-Bytes nach Spezifikation', { skip }, () => {
  let knob;
  before(async () => { knob = new Knob(built.exe, 9); await knob.waitFor((e) => e.ev === 'ready'); });
  after(() => knob.stop());

  const vectors = [
    ['serial', '04 00 10 00', 'LAN_GET_SERIAL_NUMBER'],
    ['logoff', '04 00 30 00', 'LAN_LOGOFF'],
    ['flags 00000001', '08 00 50 00 01 00 00 00', 'LAN_SET_BROADCASTFLAGS'],
    ['status', '07 00 40 00 21 24 05', 'LAN_X_GET_STATUS'],
    ['power 1', '07 00 40 00 21 81 a0', 'LAN_X_SET_TRACK_POWER_ON'],
    ['power 0', '07 00 40 00 21 80 a1', 'LAN_X_SET_TRACK_POWER_OFF'],
    ['stop', '06 00 40 00 80 80', 'LAN_X_SET_STOP'],
    ['locoinfo 3', '09 00 40 00 e3 f0 00 03 10', 'GET_LOCO_INFO kurze Adresse 3'],
    ['locoinfo 127', '09 00 40 00 e3 f0 00 7f 6c', 'GET_LOCO_INFO 127 = letzte kurze Adresse'],
    ['locoinfo 128', '09 00 40 00 e3 f0 c0 80 53', 'GET_LOCO_INFO 128 = erste lange Adresse'],
    ['locoinfo 9999', '09 00 40 00 e3 f0 e7 0f fb', 'GET_LOCO_INFO lange Adresse 9999'],
    ['drive 3 50 1', '0a 00 40 00 e4 13 00 03 b3 47', 'Fahrstufe 50 vorwaerts -> 0x80|51'],
    ['drive 3 0 0', '0a 00 40 00 e4 13 00 03 00 f4', 'Halt rueckwaerts'],
    ['drive 3 0 1', '0a 00 40 00 e4 13 00 03 80 74', 'Halt vorwaerts'],
    ['drive 3 1 1', '0a 00 40 00 e4 13 00 03 82 76', 'Fahrstufe 1 ist 0x02, nie 0x01 (Not-Halt)'],
    ['drive 3 126 1', '0a 00 40 00 e4 13 00 03 ff 0b', 'Fahrstufe 126 = 127'],
    ['drive 3 200 1', '0a 00 40 00 e4 13 00 03 ff 0b', 'zu hohe Fahrstufe wird auf 126 begrenzt'],
    ['fn 3 0 1', '0a 00 40 00 e4 f8 00 03 40 5f', 'F0 ein'],
    ['fn 3 2 0', '0a 00 40 00 e4 f8 00 03 02 1d', 'F2 aus'],
    ['fn 1000 28 1', '0a 00 40 00 e4 f8 c3 e8 5c 6b', 'F28 ein, lange Adresse 1000']
  ];
  for (const [args, expected, label] of vectors) {
    test(`${label}: ${args}`, async () => {
      assert.equal(await knob.build(args), expected);
    });
  }
});

describe('CrowPanel Z21: Empfang / Parser', { skip }, () => {
  let knob;
  let sim;
  before(async () => { knob = new Knob(built.exe, 9); sim = new Z21Simulator(); await knob.waitFor((e) => e.ev === 'ready'); });
  after(() => knob.stop());

  test('LAN_X_LOCO_INFO 128 FS: Adresse, Richtung, Fahrstufe, F0-F31', async () => {
    const l = sim.loco(3);
    l.speed = 51; l.fwd = true;
    l.functions = (1 << 0) | (1 << 1) | (1 << 4) | (1 << 5) | (1 << 12) | (1 << 13) | (1 << 21) | (1 << 28) | (1 << 29) | (1 << 31);
    l.functions >>>= 0;
    const { events, stats } = await knob.parse(sim.locoInfoPacket(3));
    assert.deepEqual(stats, { ev: 'parse_stats', packets: 1, rejected: 0 });
    assert.equal(events.length, 1);
    const e = events[0];
    assert.equal(e.ev, 'loco_info');
    assert.equal(e.address, 3);
    assert.equal(e.steps, 128);
    assert.equal(e.speed126, 50);
    assert.equal(e.forward, true);
    assert.equal(e.estop, false);
    assert.equal(e.functions, l.functions);
  });

  test('LAN_X_LOCO_INFO lange Adresse 9999, rueckwaerts, Not-Halt', async () => {
    const l = sim.loco(9999);
    l.speed = 1; l.fwd = false; l.functions = 0;
    const [e] = (await knob.parse(sim.locoInfoPacket(9999))).events;
    assert.equal(e.address, 9999);
    assert.equal(e.forward, false);
    assert.equal(e.estop, true);
    assert.equal(e.speed126, 0);
  });

  test('LAN_X_LOCO_INFO 28 und 14 Fahrstufen werden auf 0..126 umgerechnet', async () => {
    const cases = [
      // [KKK, DB3, Stufe, speed126]
      [2, 0x80 | 0x02, 1, 5], [2, 0x80 | 0x12, 2, 9], [2, 0x80 | 0x03, 3, 14], [2, 0x80 | 0x1f, 28, 126],
      [0, 0x80 | 0x02, 1, 9], [0, 0x80 | 0x0f, 14, 126]
    ];
    for (const [kkk, db3, step, s126] of cases) {
      const [e] = (await knob.parse(xPacket([0xef, 0x00, 0x05, kkk, db3, 0, 0, 0, 0]))).events;
      assert.equal(e.steps, kkk === 2 ? 28 : 14);
      assert.equal(e.raw, step, `KKK ${kkk} DB3 ${db3.toString(16)}`);
      assert.equal(e.speed126, s126);
    }
  });

  test('LAN_X_LOCO_INFO ohne optionales DB8 (14 Byte) wird akzeptiert', async () => {
    const [e] = (await knob.parse(xPacket([0xef, 0x00, 0x07, 0x04, 0x80 | 10, 0x10, 0, 0, 0]))).events;
    assert.equal(e.address, 7);
    assert.equal(e.speed126, 9);
    assert.equal(e.functions, 1);
  });

  test('Mehrere Pakete in einem Datagramm', async () => {
    const buf = Buffer.concat([xPacket([0x61, 0x01]), xPacket([0x81, 0x00]), xPacket([0x62, 0x22, 0x03]), xPacket([0x61, 0x08])]);
    const { events, stats } = await knob.parse(buf);
    assert.deepEqual(events.map((e) => e.ev), ['power_on', 'stopped', 'status', 'short_circuit']);
    assert.equal(events[2].status, 3);
    assert.equal(stats.packets, 4);
    assert.equal(stats.rejected, 0);
  });

  test('Falsches XOR wird verworfen, gueltige Nachbarn bleiben', async () => {
    const bad = xPacket([0x61, 0x00]);
    bad[bad.length - 1] ^= 0xff;
    const { events, stats } = await knob.parse(Buffer.concat([xPacket([0x61, 0x01]), bad, xPacket([0x81, 0x00])]));
    assert.deepEqual(events.map((e) => e.ev), ['power_on', 'stopped']);
    assert.equal(stats.rejected, 1);
  });

  test('Abgeschnittene und unsinnige Daten fuehren zu keinem Ereignis', async () => {
    for (const buf of [
      Buffer.from([0x0f, 0x00, 0x40, 0x00, 0xef, 0x00]), // DataLen zu gross
      Buffer.from([0x02, 0x00, 0x40, 0x00]),             // DataLen < 4
      Buffer.from([0x07, 0x00]),                         // < 4 Byte
      Buffer.from([0x05, 0x00, 0x40, 0x00, 0x00]),       // X-Paket ohne Inhalt
      Buffer.from([0x05, 0x00, 0x10, 0x00, 0x00])        // Seriennummer zu kurz
    ]) {
      const { events, stats } = await knob.parse(buf);
      assert.deepEqual(events, [], hex(buf));
      assert.ok(stats.rejected >= 1, hex(buf));
    }
  });

  test('Unbekanntes, aber gueltiges Paket zaehlt als Lebenszeichen', async () => {
    const sys = Buffer.alloc(20); sys.writeUInt16LE(20, 0); sys.writeUInt16LE(0x84, 2); // LAN_SYSTEMSTATE_DATACHANGED
    const { events, stats } = await knob.parse(sys);
    assert.equal(events[0].ev, 'other');
    assert.equal(stats.packets, 1);
  });
});

describe('CrowPanel Z21: Ende-zu-Ende gegen Z21-Simulator', { skip }, () => {
  let sim;
  let knob;
  beforeEach(async () => {
    sim = new Z21Simulator({ port: 0, clientTimeoutMs: 60000 });
    await sim.start();
    knob = new Knob(built.exe, sim.port);
    await knob.waitFor((e) => e.ev === 'ready');
  });
  afterEach(async () => {
    knob.stop();
    await sim.stop();
    assert.deepEqual(sim.errors, [], 'Simulator hat Protokollfehler gefunden');
  });

  async function login(loco = 3) {
    await knob.cmd(`select ${loco}`);
    await knob.cmd('begin');
    await knob.waitFor((e) => e.ev === 'connected', 2000, 'connected');
    await knob.waitFor((e) => e.ev === 'loco_info' && e.address === loco, 2000, `loco_info ${loco}`);
  }

  test('Anmeldung: Seriennummer, Broadcast-Flags, Status, Lok-Abo', async () => {
    await login(3);
    const serial = await knob.waitFor((e) => e.ev === 'serial');
    assert.equal(serial.serial, sim.serial);
    const names = sentNames(sim);
    for (const n of ['LAN_GET_SERIAL_NUMBER', 'LAN_SET_BROADCASTFLAGS', 'LAN_X_GET_STATUS', 'LAN_X_GET_LOCO_INFO']) assert.ok(names.includes(n), n);
    const [client] = sim.clients.values();
    assert.equal(client.flags, 0x00000001);
    assert.deepEqual(client.subs, [3]);
    assert.equal((await knob.state()).connected, true);
  });

  test('Fahren: Fahrstufe und Richtung kommen in der Zentrale an, Echo zurueck', async () => {
    await login(3);
    await knob.cmd('drive 3 50 1');
    const e1 = await knob.next((e) => e.ev === 'loco_info' && e.speed126 === 50, 2000, 'Echo 50');
    assert.equal(e1.forward, true);
    assert.deepEqual({ speed: sim.loco(3).speed, fwd: sim.loco(3).fwd, steps: sim.loco(3).steps }, { speed: 51, fwd: true, steps: 128 });

    await knob.cmd('drive 3 20 0');
    const e2 = await knob.next((e) => e.ev === 'loco_info' && e.speed126 === 20, 2000, 'Echo 20');
    assert.equal(e2.forward, false);
    assert.equal(sim.loco(3).fwd, false);

    await knob.cmd('drive 3 0 0');
    await knob.next((e) => e.ev === 'loco_info' && e.speed126 === 0, 2000, 'Echo Halt');
    assert.equal(sim.loco(3).speed, 0);
  });

  test('Funktionen F0/F1 ein und aus', async () => {
    await login(3);
    await knob.cmd('fn 3 0 1');
    await knob.cmd('fn 3 1 1');
    await knob.next((e) => e.ev === 'loco_info' && e.functions === 3, 2000, 'F0+F1');
    assert.equal(sim.loco(3).functions, 3);
    await knob.cmd('fn 3 0 0');
    await knob.next((e) => e.ev === 'loco_info' && e.functions === 2, 2000, 'nur F1');
    assert.equal(sim.loco(3).functions, 2);
  });

  test('Not-Halt und Gleisspannung', async () => {
    await login(3);
    await knob.cmd('drive 3 60 1');
    await knob.cmd('estop');
    await knob.next((e) => e.ev === 'stopped', 2000, 'BC_STOPPED');
    assert.equal(sim.emergencyStop, true);
    assert.equal(sim.loco(3).speed, 1, 'Lok steht per Not-Halt');
    // Status-Poll meldet den Not-Halt
    await knob.next((e) => e.ev === 'status' && (e.status & 0x01), 2000, 'Status Not-Halt');

    await knob.cmd('power 1');
    await knob.next((e) => e.ev === 'power_on', 2000, 'BC_TRACK_POWER_ON');
    assert.equal(sim.emergencyStop, false);

    await knob.cmd('power 0');
    await knob.next((e) => e.ev === 'power_off', 2000, 'BC_TRACK_POWER_OFF');
    assert.equal(sim.trackPower, false);
    await knob.next((e) => e.ev === 'status' && (e.status & 0x02), 2000, 'Status Spannung aus');
  });

  test('Lange Adresse 9999: abonnieren, fahren, Funktion', async () => {
    await login(9999);
    await knob.cmd('drive 9999 10 1');
    await knob.cmd('fn 9999 28 1');
    await knob.next((e) => e.ev === 'loco_info' && e.address === 9999 && e.functions === (1 << 28), 2000, 'F28');
    assert.equal(sim.loco(9999).speed, 11);
  });

  test('Fremder Regler (zweiter Z21-Client) steuert die Lok -> Knob zeigt es an', async () => {
    await login(5);
    const app = dgram.createSocket('udp4');
    await new Promise((r) => app.bind(0, '127.0.0.1', r));
    const send = (buf) => new Promise((r) => app.send(buf, sim.port, '127.0.0.1', r));
    try {
      // Roco-App: Lok 5 rueckwaerts Fahrstufe 80, Licht an
      await send(xPacket([0xe4, 0x13, 0x00, 0x05, 81]));
      const e = await knob.next((ev) => ev.ev === 'loco_info' && ev.address === 5 && ev.speed126 === 80, 2000, 'Fremdfahrt');
      assert.equal(e.forward, false);
      await send(xPacket([0xe4, 0xf8, 0x00, 0x05, 0x40]));
      await knob.next((ev) => ev.ev === 'loco_info' && ev.address === 5 && ev.functions === 1, 2000, 'Fremd-F0');
      // Nicht abonnierte Lok 7 kommt nicht beim Knob an
      const before = knob.events.length;
      await send(xPacket([0xe4, 0x13, 0x00, 0x07, 0x80 | 30]));
      await sleep(300);
      assert.equal(knob.events.slice(before).filter((ev) => ev.ev === 'loco_info' && ev.address === 7).length, 0);
    } finally {
      app.close();
    }
  });

  test('Lokwechsel: neue Lok abonnieren und echten Zustand uebernehmen', async () => {
    sim.loco(8).speed = 41; sim.loco(8).fwd = false; sim.loco(8).functions = 1;
    await login(3);
    await knob.cmd('select 8');
    const e = await knob.next((ev) => ev.ev === 'loco_info' && ev.address === 8, 2000, 'Lok 8');
    assert.deepEqual({ s: e.speed126, f: e.forward, fn: e.functions }, { s: 40, f: false, fn: 1 });
    const [client] = sim.clients.values();
    assert.deepEqual(client.subs, [3, 8]);
  });

  test('Lebenszeichen: Knob bleibt angemeldet, obwohl die Z21 Clients schnell vergisst', async () => {
    sim.clientTimeoutMs = 1000;
    await login(3);
    await sleep(2500);
    sim.expireClients();
    assert.equal(sim.clients.size, 1, 'Knob wurde von der Z21 abgemeldet');
    sim.externalDrive(3, 33, true);
    await knob.next((e) => e.ev === 'loco_info' && e.speed126 === 33, 2000, 'Broadcast nach 2,5 s');
    const flagsSent = sim.received.filter((r) => r.name === 'LAN_SET_BROADCASTFLAGS').length;
    assert.ok(flagsSent >= 3, `Broadcast-Flags regelmaessig erneuert (${flagsSent}x)`);
  });

  test('Z21 faellt aus und kommt wieder: Trennung erkannt, automatische Neuanmeldung', async () => {
    await login(4);
    sim.offline = true;
    const t0 = Date.now();
    await knob.next((e) => e.ev === 'disconnected', 3000, 'disconnected');
    assert.ok(Date.now() - t0 < 1500, 'Trennung binnen Timeout erkannt');
    assert.equal((await knob.state()).connected, false);

    // Z21 neu gestartet: kennt den Knob nicht mehr
    sim.clients.clear();
    const mark = sim.received.length;
    sim.offline = false;
    await knob.next((e) => e.ev === 'connected', 3000, 'reconnected');
    await sleep(200);
    const after = sim.received.slice(mark).map((r) => r.name);
    assert.ok(after.includes('LAN_SET_BROADCASTFLAGS'), 'Flags neu gesetzt');
    assert.ok(after.includes('LAN_X_GET_LOCO_INFO'), 'Lok neu abonniert');
    sim.externalDrive(4, 64, true);
    await knob.next((e) => e.ev === 'loco_info' && e.address === 4 && e.speed126 === 64, 2000, 'Broadcast nach Neuanmeldung');
  });

  test('Kaputte Pakete von der Zentrale: kein Absturz, Verbindung bleibt', async () => {
    await login(3);
    const bad = xPacket([0x61, 0x00]);
    bad[bad.length - 1] ^= 0x55;
    sim.sendRawToAll(Buffer.concat([xPacket([0x61, 0x01]), bad]));
    sim.sendRawToAll(Buffer.from([0xff, 0xff, 0x40, 0x00, 0x01]));
    await knob.next((e) => e.ev === 'power_on', 2000, 'gueltiges Paket vor dem kaputten');
    await sleep(200);
    const st = await knob.state();
    assert.equal(st.connected, true);
    assert.ok(st.rejected >= 2, `verworfen: ${st.rejected}`);
    assert.equal(knob.events.filter((e) => e.ev === 'power_off').length, 0, 'kaputtes Paket nicht ausgewertet');
  });

  test('Abmelden (LAN_LOGOFF)', async () => {
    await login(3);
    await knob.cmd('logoff');
    await sleep(200);
    assert.ok(sentNames(sim).includes('LAN_LOGOFF'));
    assert.equal(sim.clients.size, 0);
  });
});

if (skip) console.log(`# ${skip}`);
