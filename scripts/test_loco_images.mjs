// Tests für Lokbilder (Spec: .kiro/specs/loco-images)
// Ausführen: npm run build && node --test scripts/test_loco_images.mjs
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { LocoImageStore, LocoImageError } from '../server/dist/storage/LocoImageStore.js';
import { LocoManager } from '../server/dist/engine/LocoManager.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x40, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(60, 3)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(60)]);

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `tm-img-${name}-`));
const noop = () => {};

describe('LocoImageStore', () => {
  test('Formaterkennung über Dateisignatur', () => {
    assert.equal(LocoImageStore.detectFormat(JPEG), 'jpg');
    assert.equal(LocoImageStore.detectFormat(PNG), 'png');
    assert.equal(LocoImageStore.detectFormat(WEBP), 'webp');
    assert.equal(LocoImageStore.detectFormat(SVG), null);
    assert.equal(LocoImageStore.detectFormat(GIF), null);
    assert.equal(LocoImageStore.detectFormat(Buffer.alloc(0)), null);
  });

  test('Speichern liefert URL im Server-Schema, gleiche Daten -> gleicher Name', () => {
    const dir = tmp('save');
    const store = new LocoImageStore(dir);
    const a = store.save('loco-br-218', WEBP);
    const b = store.save('loco-br-218', WEBP);
    assert.match(a, /^\/api\/loco-images\/loco-br-218\.[0-9a-f]{12}\.webp$/);
    assert.equal(a, b);
    assert.ok(LocoImageStore.isValidUrl(a));
    assert.equal(fs.readdirSync(dir).length, 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('Ungültige Uploads werden mit passendem Status abgelehnt', () => {
    const store = new LocoImageStore(tmp('reject'));
    const status = (fn) => { try { fn(); return 'ok'; } catch (e) { assert.ok(e instanceof LocoImageError); return e.status; } };
    assert.equal(status(() => store.save('x', SVG)), 415);
    assert.equal(status(() => store.save('x', GIF)), 415);
    assert.equal(status(() => store.save('x', Buffer.alloc(0))), 400);
    assert.equal(status(() => store.save('x', Buffer.concat([JPEG, Buffer.alloc(LocoImageStore.MAX_BYTES)]))), 413);
  });

  test('Lok-ID mit Pfadanteilen wird entschärft', () => {
    const dir = tmp('traversal');
    const url = new LocoImageStore(dir).save('../../etc/passwd', PNG);
    assert.match(url, /^\/api\/loco-images\/[A-Za-z0-9_-]+\.[0-9a-f]{12}\.png$/);
    assert.equal(fs.readdirSync(dir).length, 1, 'Datei liegt im Bildverzeichnis');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('resolve akzeptiert nur gültige Dateinamen im Bildverzeichnis', () => {
    const dir = tmp('resolve');
    const store = new LocoImageStore(dir);
    const name = store.save('l1', JPEG).split('/').pop();
    assert.equal(store.resolve(name), path.resolve(dir, name));
    for (const bad of ['../x.0123456789ab.jpg', '..%2Fx', 'C:\\Windows\\win.ini', 'l1.0123456789ab.svg', 'l1.jpg', '']) {
      assert.equal(store.resolve(bad), null, bad);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('remove löscht eigene Dateien und ignoriert fremde URLs', () => {
    const dir = tmp('remove');
    const store = new LocoImageStore(dir);
    const url = store.save('l1', JPEG);
    store.remove('https://example.com/evil.jpg');
    store.remove('/api/loco-images/../../layout.local.json');
    assert.equal(fs.readdirSync(dir).length, 1);
    store.remove(url);
    assert.equal(fs.readdirSync(dir).length, 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('LocoManager und Bildfeld', () => {
  const make = () => new LocoManager([], { onLocoUpdated: noop, onSpeedChanged: noop, onFunctionChanged: noop, onLog: noop });
  const loco = (over = {}) => ({ id: 'L', name: 'Lok', dccAddress: 3, speed: 0, targetSpeed: 0, direction: 'FWD', functions: {},
    vMin: 10, vMid: 50, vMax: 100, lengthCm: 20, trainType: 'PASSENGER', currentBlockId: null, ...over });

  test('Client kann image weder beim Anlegen noch beim Bearbeiten setzen', () => {
    const lm = make();
    lm.addLoco(loco({ image: 'https://evil.example/x.png' }));
    assert.equal(lm.getLoco('L').image, undefined);
    lm.setImage('L', '/api/loco-images/L.0123456789ab.webp');
    lm.updateLoco(loco({ name: 'Neu', image: 'javascript:alert(1)' }));
    assert.equal(lm.getLoco('L').image, '/api/loco-images/L.0123456789ab.webp');
    assert.equal(lm.getLoco('L').name, 'Neu');
  });

  test('setImage meldet Änderung genau einmal', () => {
    let updates = 0;
    const lm = new LocoManager([loco()], { onLocoUpdated: () => updates++, onSpeedChanged: noop, onFunctionChanged: noop, onLog: noop });
    assert.equal(lm.setImage('L', undefined), true);
    assert.equal(lm.setImage('unbekannt', undefined), false);
    assert.equal(updates, 1);
  });
});

describe('HTTP-Endpunkte (isolierter Server)', () => {
  const PORT = 3112;
  const base = `http://127.0.0.1:${PORT}`;
  const dir = path.resolve('scripts/.tmp-loco-images-e2e');
  let srv;

  before(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    const d = JSON.parse(fs.readFileSync('server/data/layout.json', 'utf8'));
    d.settings.commandStation = { type: 'VIRTUAL', connectionType: 'TCP' };
    d.settings.wio = { enabled: false, udpPort: 18072 };
    if (d.settings.ambientLighting) d.settings.ambientLighting.enabled = false;
    fs.writeFileSync(path.join(dir, 'data', 'layout.local.json'), JSON.stringify(d));
    srv = spawn(process.execPath, [path.resolve('server/dist/index.js')], { cwd: dir, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(`${base}/api/status`)).ok) return; } catch { /* startet noch */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Server nicht gestartet');
  });

  after(async () => {
    srv?.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const upload = (id, body, type = 'image/webp') =>
    fetch(`${base}/api/locos/${encodeURIComponent(id)}/image`, { method: 'POST', headers: { 'Content-Type': type }, body });

  test('Upload, Abruf mit Cache-Headern, Ersetzen und Entfernen', async () => {
    const locos = await (await fetch(`${base}/api/locos`)).json();
    const id = locos[0].id;

    const r1 = await upload(id, WEBP);
    assert.equal(r1.status, 200);
    const { image } = await r1.json();
    assert.ok(LocoImageStore.isValidUrl(image));

    const get = await fetch(base + image);
    assert.equal(get.status, 200);
    assert.match(get.headers.get('cache-control'), /immutable/);
    assert.equal(get.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), WEBP);

    const r2 = await upload(id, PNG, 'image/png');
    const { image: image2 } = await r2.json();
    assert.notEqual(image2, image);
    assert.equal((await fetch(base + image)).status, 404, 'altes Bild gelöscht');

    const del = await fetch(`${base}/api/locos/${encodeURIComponent(id)}/image`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    assert.equal((await fetch(base + image2)).status, 404);
    const after = (await (await fetch(`${base}/api/locos`)).json()).find((l) => l.id === id);
    assert.equal(after.image, undefined);
  });

  test('Fehlerfälle: SVG 415, zu groß 413, unbekannte Lok 404, Traversal 404', async () => {
    const id = (await (await fetch(`${base}/api/locos`)).json())[0].id;
    assert.equal((await upload(id, SVG, 'image/svg+xml')).status, 415);
    assert.equal((await upload(id, Buffer.concat([JPEG, Buffer.alloc(LocoImageStore.MAX_BYTES)]), 'image/jpeg')).status, 413);
    assert.equal((await upload('gibt-es-nicht', JPEG, 'image/jpeg')).status, 404);
    assert.equal((await fetch(`${base}/api/loco-images/..%2F..%2Fdata%2Flayout.local.json`)).status, 404);
    assert.equal((await fetch(`${base}/api/loco-images/x.svg`)).status, 404);
  });
});
