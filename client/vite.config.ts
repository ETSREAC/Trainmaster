import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 5173,
    host: '127.0.0.1', // TM-08: Bindet im Entwicklungsmodus sicher an Localhost
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
