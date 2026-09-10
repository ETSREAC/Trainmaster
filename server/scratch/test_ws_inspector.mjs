import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('Connected to TrainMaster WebSocket Server on :3001');
  // Sende INSPECT_LAYOUT
  ws.send(JSON.stringify({ type: 'INSPECT_LAYOUT' }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'LAYOUT_INSPECTION_RESULT') {
    console.log('✅ EMPFANGEN: LAYOUT_INSPECTION_RESULT');
    console.log(`- Gültig: ${msg.payload.valid}`);
    console.log(`- Hinweise/Warnungen: ${msg.payload.issues.length}`);
    console.log(`- Block-Zuordnungen: ${msg.payload.assignments.length}`);
    console.log(`- Generierte Fahrstraßen: ${msg.payload.generatedRoutes.length}`);

    for (const r of msg.payload.generatedRoutes) {
      console.log(`   Route: ${r.name} (${r.id})`);
    }

    ws.close();
    process.exit(0);
  }
});

setTimeout(() => {
  console.error('Timeout waiting for inspection result');
  process.exit(1);
}, 5000);
