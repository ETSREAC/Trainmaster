// Z21-Simulator: bildet eine Roco Z21 im LAN nach (UDP, Z21 LAN Protokoll V1.13).
//
// Zweck:
//   1. Gegenstelle fuer automatische Tests (scripts/test_crowpanel_z21.mjs)
//   2. Test mit dem echten CrowPanel-Knob ohne Z21:
//        node scripts/z21_simulator.mjs [--port 21105]
//      und im Knob (config.local.h) Z21_HOST = IP dieses PCs eintragen.
//
// Der Simulator prueft jedes Paket streng (Laenge, XOR, Adresskodierung,
// bekannte Befehle) und sammelt Verstoesse in `errors`. Er ist bewusst
// unabhaengig vom Firmware-Code geschrieben, damit Fehler dort auffallen.
import dgram from 'node:dgram';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const BC_DRIVING_SWITCHING = 0x00000001;
const MAX_SUBSCRIPTIONS = 16;

const xor = (bytes) => bytes.reduce((a, b) => a ^ b, 0);
export const hex = (buf) => Buffer.from(buf).toString('hex').match(/../g)?.join(' ') ?? '';

/** Baut ein X-Bus-Paket (Header 0x40) inkl. XOR. */
export function xPacket(xbytes) {
  const len = 4 + xbytes.length + 1;
  return Buffer.from([len & 0xff, len >> 8, 0x40, 0x00, ...xbytes, xor(xbytes)]);
}

/** Lokadresse nach Spezifikation dekodieren und pruefen. */
export function decodeAddress(msb, lsb) {
  const top = msb & 0xc0;
  if (top === 0xc0) {
    const address = ((msb & 0x3f) << 8) | lsb;
    return { address, error: address < 128 ? `lange Adresse ${address} < 128` : null };
  }
  if (msb === 0) {
    return { address: lsb, error: lsb === 0 ? 'Adresse 0' : (lsb > 127 ? `kurze Adresse ${lsb} > 127` : null) };
  }
  return { address: ((msb & 0x3f) << 8) | lsb, error: `ungueltiges Adr_MSB 0x${msb.toString(16)}` };
}

export function encodeAddress(address) {
  const msb = ((address >> 8) & 0x3f) | (address >= 128 ? 0xc0 : 0);
  return [msb, address & 0xff];
}

export class Z21Simulator {
  constructor({ port = 21105, host = '0.0.0.0', clientTimeoutMs = 60000, serial = 0x000201ab, log = null } = {}) {
    this.port = port;
    this.host = host;
    this.clientTimeoutMs = clientTimeoutMs;
    this.serial = serial;
    this.log = log;
    this.socket = null;
    this.offline = false;          // true = Z21 "ausgeschaltet", ignoriert alles
    this.trackPower = true;
    this.emergencyStop = false;
    this.shortCircuit = false;
    this.locos = new Map();        // addr -> { steps, speed (0..127, Rohwert), fwd, functions }
    this.clients = new Map();      // "ip:port" -> { address, port, flags, lastSeen, subs: [] }
    this.received = [];            // { from, name, hex, info }
    this.errors = [];              // Protokollverstoesse
  }

  start() {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');
      this.socket.on('message', (msg, rinfo) => this.onDatagram(msg, rinfo));
      this.socket.once('error', reject);
      this.socket.bind(this.port, this.host, () => {
        this.port = this.socket.address().port;
        this.expiryTimer = setInterval(() => this.expireClients(), 1000);
        this.expiryTimer.unref?.();
        resolve(this.port);
      });
    });
  }

  stop() {
    clearInterval(this.expiryTimer);
    return new Promise((resolve) => (this.socket ? this.socket.close(() => resolve()) : resolve()));
  }

  // --------------------------------------------------------------------------
  // Hilfen
  // --------------------------------------------------------------------------
  loco(address) {
    if (!this.locos.has(address)) this.locos.set(address, { steps: 128, speed: 0, fwd: true, functions: 0 });
    return this.locos.get(address);
  }

  error(from, msg, buf) {
    const e = { from, msg, hex: buf ? hex(buf) : '' };
    this.errors.push(e);
    this.log?.(`!! ${from} ${msg} ${e.hex}`);
  }

  record(from, name, buf, info = '') {
    this.received.push({ from, name, hex: hex(buf), info });
    this.log?.(`<- ${from} ${name}${info ? ' ' + info : ''}   [${hex(buf)}]`);
  }

  sendTo(client, buf) {
    if (this.offline || !this.socket) return;
    this.socket.send(buf, client.port, client.address);
  }

  /** An alle Clients mit gesetztem Flag (optional: nur Abonnenten einer Lok). */
  broadcast(buf, { flag = BC_DRIVING_SWITCHING, locoAddress = null } = {}) {
    for (const c of this.clients.values()) {
      if (!(c.flags & flag)) continue;
      if (locoAddress !== null && !c.subs.includes(locoAddress)) continue;
      this.sendTo(c, buf);
    }
  }

  expireClients(now = Date.now()) {
    for (const [key, c] of this.clients) {
      if (now - c.lastSeen > this.clientTimeoutMs) {
        this.clients.delete(key);
        this.log?.(`-- Client ${key} nach ${this.clientTimeoutMs} ms ohne Kommunikation abgemeldet`);
      }
    }
  }

  statusByte() {
    return (this.emergencyStop ? 0x01 : 0) | (this.trackPower ? 0 : 0x02) | (this.shortCircuit ? 0x04 : 0);
  }

  locoInfoPacket(address) {
    const l = this.loco(address);
    const kkk = l.steps === 128 ? 4 : l.steps === 28 ? 2 : 0;
    const f = l.functions;
    const db4 = ((f & 1) << 4) | ((f >> 1) & 0x0f);
    return xPacket([
      0xef, ...encodeAddress(address), kkk, (l.fwd ? 0x80 : 0) | (l.speed & 0x7f),
      db4, (f >>> 5) & 0xff, (f >>> 13) & 0xff, (f >>> 21) & 0xff, (f >>> 29) & 0x07
    ]);
  }

  subscribe(client, address) {
    client.subs = client.subs.filter((a) => a !== address);
    client.subs.push(address);
    while (client.subs.length > MAX_SUBSCRIPTIONS) client.subs.shift(); // FIFO
  }

  // --------------------------------------------------------------------------
  // "Andere Regler" (Roco-App, multiMAUS) fuer Tests
  // --------------------------------------------------------------------------
  externalDrive(address, step126, fwd) {
    const l = this.loco(address);
    l.steps = 128;
    l.speed = step126 === 0 ? 0 : Math.min(126, step126) + 1;
    l.fwd = fwd;
    this.broadcast(this.locoInfoPacket(address), { locoAddress: address });
  }

  externalFunction(address, fn, on) {
    const l = this.loco(address);
    l.functions = on ? (l.functions | (1 << fn)) >>> 0 : (l.functions & ~(1 << fn)) >>> 0;
    this.broadcast(this.locoInfoPacket(address), { locoAddress: address });
  }

  setTrackPower(on) {
    this.trackPower = on;
    if (on) { this.emergencyStop = false; this.shortCircuit = false; }
    this.broadcast(xPacket([0x61, on ? 0x01 : 0x00]));
  }

  /** Rohdaten an alle Clients (fuer Parser-Tests). */
  sendRawToAll(buf) {
    for (const c of this.clients.values()) this.sendTo(c, buf);
  }

  // --------------------------------------------------------------------------
  // Empfang
  // --------------------------------------------------------------------------
  onDatagram(msg, rinfo) {
    if (this.offline) return;
    const key = `${rinfo.address}:${rinfo.port}`;
    let client = this.clients.get(key);
    if (!client) {
      client = { address: rinfo.address, port: rinfo.port, flags: 0, lastSeen: 0, subs: [] };
      this.clients.set(key, client);
      this.log?.(`++ neuer Client ${key}`);
    }
    client.lastSeen = Date.now();

    let off = 0;
    while (off < msg.length) {
      if (msg.length - off < 4) { this.error(key, 'Restbytes < 4', msg.subarray(off)); return; }
      const len = msg.readUInt16LE(off);
      if (len < 4 || off + len > msg.length) { this.error(key, `DataLen ${len} passt nicht zum Datagramm`, msg.subarray(off)); return; }
      this.handlePacket(client, key, msg.subarray(off, off + len));
      off += len;
    }
  }

  handlePacket(client, key, p) {
    const len = p.length;
    const header = p.readUInt16LE(2);
    const expectLen = (n, name) => {
      if (len !== n) { this.error(key, `${name}: Laenge ${len}, erwartet ${n}`, p); return false; }
      return true;
    };

    switch (header) {
      case 0x10: // LAN_GET_SERIAL_NUMBER
        if (!expectLen(4, 'LAN_GET_SERIAL_NUMBER')) return;
        this.record(key, 'LAN_GET_SERIAL_NUMBER', p);
        { const r = Buffer.alloc(8); r.writeUInt16LE(8, 0); r.writeUInt16LE(0x10, 2); r.writeUInt32LE(this.serial, 4); this.sendTo(client, r); }
        return;
      case 0x30: // LAN_LOGOFF
        if (!expectLen(4, 'LAN_LOGOFF')) return;
        this.record(key, 'LAN_LOGOFF', p);
        this.clients.delete(key);
        return;
      case 0x50: // LAN_SET_BROADCASTFLAGS
        if (!expectLen(8, 'LAN_SET_BROADCASTFLAGS')) return;
        client.flags = p.readUInt32LE(4);
        this.record(key, 'LAN_SET_BROADCASTFLAGS', p, `0x${client.flags.toString(16).padStart(8, '0')}`);
        return;
      case 0x51: // LAN_GET_BROADCASTFLAGS
        if (!expectLen(4, 'LAN_GET_BROADCASTFLAGS')) return;
        this.record(key, 'LAN_GET_BROADCASTFLAGS', p);
        { const r = Buffer.alloc(8); r.writeUInt16LE(8, 0); r.writeUInt16LE(0x51, 2); r.writeUInt32LE(client.flags, 4); this.sendTo(client, r); }
        return;
      case 0x81: // LAN_RMBUS_GETDATA -> LAN_RMBUS_DATACHANGED (Gruppenindex + 10 Rueckmeldebytes)
        if (!expectLen(5, 'LAN_RMBUS_GETDATA')) return;
        this.record(key, 'LAN_RMBUS_GETDATA', p);
        {
          const r = Buffer.alloc(15);
          r.writeUInt16LE(15, 0); r.writeUInt16LE(0x80, 2); r[4] = p[4];
          this.sendTo(client, r);
        }
        return;
      case 0x40:
        this.handleX(client, key, p);
        return;
      default:
        this.error(key, `unbekannter Header 0x${header.toString(16)}`, p);
    }
  }

  handleX(client, key, p) {
    const len = p.length;
    if (len < 6) { this.error(key, 'X-Paket zu kurz', p); return; }
    const x = [...p.subarray(4, len - 1)];
    if (xor(x) !== p[len - 1]) { this.error(key, 'XOR-Pruefsumme falsch', p); return; } // echte Z21 verwirft still
    const need = (n, name) => {
      if (len !== n) { this.error(key, `${name}: Laenge ${len}, erwartet ${n}`, p); return false; }
      return true;
    };
    const unknown = () => {
      this.error(key, 'unbekannter X-Befehl', p);
      this.sendTo(client, xPacket([0x61, 0x82]));
    };
    const [xh, db0] = x;

    if (xh === 0x21) {
      if (!need(7, 'LAN_X 0x21')) return;
      if (db0 === 0x24) {
        this.record(key, 'LAN_X_GET_STATUS', p);
        this.sendTo(client, xPacket([0x62, 0x22, this.statusByte()]));
      } else if (db0 === 0x81) {
        this.record(key, 'LAN_X_SET_TRACK_POWER_ON', p);
        this.setTrackPower(true);
      } else if (db0 === 0x80) {
        this.record(key, 'LAN_X_SET_TRACK_POWER_OFF', p);
        this.setTrackPower(false);
      } else unknown();
      return;
    }

    if (xh === 0x80) {
      if (!need(6, 'LAN_X_SET_STOP')) return;
      this.record(key, 'LAN_X_SET_STOP', p);
      this.emergencyStop = true;
      for (const l of this.locos.values()) l.speed = 1; // Not-Halt
      this.broadcast(xPacket([0x81, 0x00]));
      return;
    }

    if (xh === 0xe3 && db0 === 0xf0) {
      if (!need(9, 'LAN_X_GET_LOCO_INFO')) return;
      const { address, error } = decodeAddress(x[2], x[3]);
      if (error) { this.error(key, `LAN_X_GET_LOCO_INFO: ${error}`, p); return; }
      this.record(key, 'LAN_X_GET_LOCO_INFO', p, `Lok ${address}`);
      this.subscribe(client, address);
      this.sendTo(client, this.locoInfoPacket(address));
      return;
    }

    if (xh === 0xe4 && (db0 === 0x10 || db0 === 0x12 || db0 === 0x13)) {
      if (!need(10, 'LAN_X_SET_LOCO_DRIVE')) return;
      const { address, error } = decodeAddress(x[2], x[3]);
      if (error) { this.error(key, `LAN_X_SET_LOCO_DRIVE: ${error}`, p); return; }
      const steps = db0 === 0x13 ? 128 : db0 === 0x12 ? 28 : 14;
      const l = this.loco(address);
      l.steps = steps;
      l.fwd = (x[4] & 0x80) !== 0;
      l.speed = x[4] & 0x7f;
      const stepTxt = l.speed === 0 ? 'Halt' : l.speed === 1 ? 'NOT-HALT' : `Stufe ${l.speed - 1}`;
      this.record(key, 'LAN_X_SET_LOCO_DRIVE', p, `Lok ${address} ${l.fwd ? 'vorwaerts' : 'rueckwaerts'} ${stepTxt} (${steps} FS)`);
      this.broadcast(this.locoInfoPacket(address), { locoAddress: address });
      return;
    }

    if (xh === 0xe4 && db0 === 0xf8) {
      if (!need(10, 'LAN_X_SET_LOCO_FUNCTION')) return;
      const { address, error } = decodeAddress(x[2], x[3]);
      if (error) { this.error(key, `LAN_X_SET_LOCO_FUNCTION: ${error}`, p); return; }
      const tt = x[4] >> 6;
      const fn = x[4] & 0x3f;
      if (tt === 3) { this.error(key, 'LAN_X_SET_LOCO_FUNCTION: TT=11 ungueltig', p); return; }
      const l = this.loco(address);
      const bit = (1 << fn) >>> 0;
      if (tt === 0) l.functions = (l.functions & ~bit) >>> 0;
      else if (tt === 1) l.functions = (l.functions | bit) >>> 0;
      else l.functions = (l.functions ^ bit) >>> 0;
      this.record(key, 'LAN_X_SET_LOCO_FUNCTION', p, `Lok ${address} F${fn} ${['aus', 'ein', 'umschalten'][tt]}`);
      this.broadcast(this.locoInfoPacket(address), { locoAddress: address });
      return;
    }

    if (xh === 0xf1 && db0 === 0x0a) {
      if (!need(7, 'LAN_X_GET_FIRMWARE_VERSION')) return;
      this.record(key, 'LAN_X_GET_FIRMWARE_VERSION', p);
      this.sendTo(client, xPacket([0xf3, 0x0a, 0x01, 0x43]));
      return;
    }

    unknown();
  }
}

// ----------------------------------------------------------------------------
// Kommandozeile
// ----------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name, def) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : def;
  };
  const port = Number(arg('--port', 21105));
  const sim = new Z21Simulator({ port, log: (m) => console.log(`${new Date().toLocaleTimeString()} ${m}`) });
  await sim.start();
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Z21-Simulator laeuft auf UDP-Port ${sim.port}.`);
  console.log(`Im Knob (config.local.h) als Z21_HOST eintragen: ${ips.join(' oder ') || '(keine LAN-IP gefunden)'}`);
  console.log('Hinweis: Windows-Firewall muss UDP-Port 21105 fuer Node erlauben. Beenden mit Strg+C.\n');
  process.on('SIGINT', async () => {
    console.log(`\n${sim.received.length} Befehle empfangen, ${sim.errors.length} Protokollfehler.`);
    await sim.stop();
    process.exit(sim.errors.length ? 1 : 0);
  });
}
