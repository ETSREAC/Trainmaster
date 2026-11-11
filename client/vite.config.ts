import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 5173,
    // TM-08: Bewusst im Heimnetz erreichbar, damit Tablet und Handy die Oberfläche öffnen können
    // (http://<PC-IP>:5173). TrainMaster hat keine Anmeldung: nur in vertrauenswürdigen Netzen
    // betreiben, nie per Portfreigabe ins Internet stellen. Nur am PC nutzen: `npm run client:local`.
    host: true,
    // Zugriff über mDNS-Namen (z. B. http://mein-pc.local:5173) erlauben
    allowedHosts: ['.local'],
    fs: {
      strict: true,
      allow: [
        path.resolve(__dirname)
      ],
      deny: [
        '**/.secret*',
        '**/scripts/**',
        '**/credentials.h',
        '**/.env*',
        '**/*.key',
        '**/*.pem'
      ]
    }
  }
});
