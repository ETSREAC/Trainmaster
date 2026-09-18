import { spawn, exec } from 'child_process';
import readline from 'readline';

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

console.log('\x1b[1;34m');
console.log('🚂 ======================================================== 🚂');
console.log('              TrainMaster Launcher');
console.log('      Digitale Modellbahn-Steuerung & Stellwerk');
console.log('🚂 ======================================================== 🚂\x1b[0m\n');
console.log('🚀 Starte Backend-Server & Web-Client parallel...\n');

let serverProc = null;
let clientProc = null;
let browserOpened = false;

function openBrowser(url) {
  if (browserOpened) return;
  browserOpened = true;
  console.log(`\n\x1b[1;32m🌐 Öffne Web-UI im Browser: ${url}\x1b[0m\n`);
  try {
    if (isWin) {
      exec(`start "" "${url}"`);
    } else if (isMac) {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  } catch (err) {
    console.warn('Browser konnte nicht automatisch geöffnet werden:', err);
  }
}

// 1. Backend Server starten
serverProc = spawn(npmCmd, ['run', 'server'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: isWin,
  env: { ...process.env, FORCE_COLOR: '1' }
});

const serverRl = readline.createInterface({ input: serverProc.stdout });
serverRl.on('line', (line) => {
  console.log(`\x1b[36m[Server]\x1b[0m ${line}`);
});

const serverErrRl = readline.createInterface({ input: serverProc.stderr });
serverErrRl.on('line', (line) => {
  console.error(`\x1b[36m[Server]\x1b[0m \x1b[31m${line}\x1b[0m`);
});

// 2. Web Client starten
clientProc = spawn(npmCmd, ['run', 'client'], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: isWin,
  env: { ...process.env, FORCE_COLOR: '1' }
});

const clientRl = readline.createInterface({ input: clientProc.stdout });
clientRl.on('line', (line) => {
  console.log(`\x1b[35m[Client]\x1b[0m ${line}`);
  if (line.includes('Local:') || line.includes('http://localhost:5173')) {
    setTimeout(() => openBrowser('http://localhost:5173'), 600);
  }
});

const clientErrRl = readline.createInterface({ input: clientProc.stderr });
clientErrRl.on('line', (line) => {
  console.error(`\x1b[35m[Client]\x1b[0m \x1b[33m${line}\x1b[0m`);
});

// Fallback: Nach 4 Sekunden Browser auf jeden Fall öffnen, falls kein Output abgefangen wurde
setTimeout(() => {
  openBrowser('http://localhost:5173');
}, 4000);

// Sauberes Beenden bei Strg+C
function cleanShutdown() {
  console.log('\n\x1b[33m🛑 Fahre TrainMaster herunter...\x1b[0m');
  if (isWin) {
    if (serverProc && serverProc.pid) {
      try { exec(`taskkill /pid ${serverProc.pid} /T /F`); } catch (_) {}
    }
    if (clientProc && clientProc.pid) {
      try { exec(`taskkill /pid ${clientProc.pid} /T /F`); } catch (_) {}
    }
  } else {
    if (serverProc && serverProc.pid) {
      try { serverProc.kill('SIGINT'); } catch (_) {}
    }
    if (clientProc && clientProc.pid) {
      try { clientProc.kill('SIGINT'); } catch (_) {}
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanShutdown);
process.on('SIGTERM', cleanShutdown);
