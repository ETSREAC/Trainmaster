import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TrackTopology } from '../dist/engine/TrackTopology.js';
import { RouteGenerator } from '../dist/engine/RouteGenerator.js';

const layoutRaw = fs.readFileSync(path.resolve('./data/layout.json'), 'utf-8');
const data = JSON.parse(layoutRaw);

console.log('=== TESTE TRACK TOPOLOGY & ROUTE GENERATOR ===');
console.log(`Elemente im Gleisplan: ${data.layout.length}`);
console.log(`Blöcke: ${data.blocks.length}, Weichen: ${data.turnouts.length}, Signale: ${data.signals.length}, Sensoren: ${data.sensors.length}`);

const topology = new TrackTopology(data.layout);
const issues = topology.validateLayout(data.blocks, data.turnouts, data.signals, data.sensors);
console.log(`\nGefundene Prüfungs-Hinweise (${issues.length}):`);
for (const iss of issues) {
  console.log(`- [${iss.type}] ${iss.message}`);
}

const assignments = topology.autoAssignBlocks(data.blocks, data.signals, data.sensors);
console.log(`\nAutomatische Block-Zuordnungen (${assignments.length}):`);
for (const a of assignments) {
  console.log(`- ${a.blockName} (${a.blockId}):`);
  console.log(`    Richtung +: Enter=${a.sensorsPlus.enter}, In=${a.sensorsPlus.in}, Signal=${a.exitSignalPlus || '-'}`);
  console.log(`    Richtung -: Enter=${a.sensorsMinus.enter}, In=${a.sensorsMinus.in}, Signal=${a.exitSignalMinus || '-'}`);
}

const generator = new RouteGenerator(topology, data.blocks, data.turnouts, data.signals);
const routes = generator.generateAllRoutes();
console.log(`\nAutomatisch generierte Fahrstraßen (${routes.length}):`);
for (const r of routes) {
  const ts = r.turnoutSettings.map((t) => `${t.turnoutId}:${t.state}`).join(', ') || 'Keine Weichen';
  const sig = r.signalSettings?.map((s) => `${s.signalId}:${s.aspect}`).join(', ') || 'Keine Signale';
  console.log(`- [${r.direction}] ${r.name} (${r.id})`);
  console.log(`    Weichen: ${ts} | Signale: ${sig}`);
}
