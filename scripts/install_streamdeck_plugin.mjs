#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(__dirname, '../integrations/streamdeck/com.etsreac.trainmaster.sdPlugin');

const appData = process.env.APPDATA;
if (!appData) {
  console.error('❌ APPDATA environment variable not found.');
  process.exit(1);
}

const targetPluginsDir = path.join(appData, 'Elgato', 'StreamDeck', 'Plugins');
const targetPluginDir = path.join(targetPluginsDir, 'com.etsreac.trainmaster.sdPlugin');

console.log('📦 Installing TrainMaster Elgato Stream Deck Plugin...');
console.log(`Source: ${sourceDir}`);
console.log(`Target: ${targetPluginDir}`);

if (!fs.existsSync(targetPluginsDir)) {
  console.log(`Creating directory: ${targetPluginsDir}`);
  fs.mkdirSync(targetPluginsDir, { recursive: true });
}

// Copy recursively
try {
  if (fs.existsSync(targetPluginDir)) {
    fs.rmSync(targetPluginDir, { recursive: true, force: true });
  }
  fs.cpSync(sourceDir, targetPluginDir, { recursive: true });
  console.log('✅ Plugin successfully copied to Stream Deck directory!');
  console.log('\n👉 Bitte starte die Elgato Stream Deck App einmal neu (oder schließe sie über den Infobereich), damit das Plugin in deiner Aktionsliste erscheint!');
} catch (err) {
  console.error('❌ Fehler beim Kopieren des Plugins:', err);
  process.exit(1);
}
