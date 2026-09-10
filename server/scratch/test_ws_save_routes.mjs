import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('Connected to TrainMaster WebSocket Server on :3001');
  ws.send(JSON.stringify({ type: 'INSPECT_LAYOUT' }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'LAYOUT_INSPECTION_RESULT') {
    console.log('Inspection result received, now testing SAVE_GENERATED_ROUTES...');
    ws.send(JSON.stringify({
      type: 'SAVE_GENERATED_ROUTES',
      payload: {
        routes: msg.payload.generatedRoutes,
        mode: 'REPLACE'
      }
    }));
  } else if (msg.type === 'ROUTES_UPDATED') {
    console.log('✅ EMPFANGEN: ROUTES_UPDATED mit', msg.payload.length, 'Routen!');
    ws.close();
    process.exit(0);
  }
});

setTimeout(() => {
  console.error('Timeout');
  process.exit(1);
}, 5000);
