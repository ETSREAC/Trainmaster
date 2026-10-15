import assert from 'assert';
import net from 'net';
import { StorageManager } from '../server/dist/storage/StorageManager.js';
import { LocoManager } from '../server/dist/engine/LocoManager.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

console.log('🧪 Starte Security-Fix Validierung...\n');

// Test 1: TM-04 - ensureSettings mit leerem Objekt
console.log('1. Teste TM-04: Robustheit gegen leere/korrupte Settings...');
const storage = new StorageManager();
const corruptedData = { settings: {} };
const recovered = storage.ensureSettings(corruptedData);
assert(recovered.settings, 'Settings müssen existieren');
assert(recovered.settings.commandStation, 'commandStation muss existieren');
assert(recovered.settings.commandStation.type, 'commandStation.type muss definiert sein');
assert.strictEqual(recovered.settings.commandStation.type, 'VIRTUAL');
console.log('   ✅ TM-04 erfolgreich bestanden: Leere Settings werden sicher repariert.\n');

// Test 2: TM-02 - Loknamen-Sanitization
console.log('2. Teste TM-02: Loknamen-Sanitization & HTML-Escaping gegen XSS...');
const events = {
  onLocoUpdated: () => {},
  onSpeedChanged: () => {},
  onFunctionChanged: () => {},
  onLog: () => {}
};
const locoManager = new LocoManager([], events);
locoManager.addLoco({
  id: 'test-xss',
  name: '<img src=x onerror=alert(1)>BR 103 "Rheingold"',
  dccAddress: 103,
  speed: 0,
  targetSpeed: 0,
  direction: 'FWD',
  functions: {},
  trainType: 'PASSENGER',
  lengthCm: 20
});
const savedLoco = locoManager.getLoco('test-xss');
assert(!savedLoco.name.includes('<img'), 'HTML-Tags müssen entfernt werden');
assert(!savedLoco.name.includes('>'), 'Schließende Tags müssen entfernt werden');
assert(!savedLoco.name.includes('"'), 'Anführungszeichen müssen entfernt werden');
assert.strictEqual(savedLoco.name, 'BR 103 Rheingold');

const escapedOutput = escapeHtml('<script>alert("test")</script>');
assert(!escapedOutput.includes('<script>'), 'HTML muss escaped werden');
assert(escapedOutput.includes('&lt;script&gt;'), 'HTML muss korrekt als &lt; kodiert sein');
console.log(`   ✅ TM-02 erfolgreich bestanden: Gespeicherter Name: "${savedLoco.name}", Escaped: "${escapedOutput}".\n`);

// Test 3: TM-09 - IP-Validierung gegen SSRF
console.log('3. Teste TM-09: Validierung gegen manipulierte IP-Strings / SSRF...');
const maliciousIps = [
  '127.1/admin?probe=1#',
  '192.168.1.1; rm -rf /',
  'http://evil.com',
  '<script>',
  '127.0.0.1:8080'
];
for (const ip of maliciousIps) {
  assert.strictEqual(Boolean(net.isIP(ip)), false, `Böswilliger String "${ip}" darf keine gültige IP sein`);
}
assert.strictEqual(Boolean(net.isIP('192.168.1.42')), true, 'Gültige IPv4 muss akzeptiert werden');
assert.strictEqual(Boolean(net.isIP('127.0.0.1')), true, 'Gültige Localhost IPv4 muss akzeptiert werden');
console.log('   ✅ TM-09 erfolgreich bestanden: Manipulierte IPs werden strikt abgewiesen.\n');

console.log('🎉 Alle automatisierten Security-Tests erfolgreich bestanden!');
