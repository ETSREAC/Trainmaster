import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type LocoImageFormat = 'webp' | 'jpg' | 'png';

export class LocoImageError extends Error {
  constructor(public status: 400 | 413 | 415, message: string) {
    super(message);
  }
}

const URL_PREFIX = '/api/loco-images/';
const FILE_RE = /^[A-Za-z0-9_-]{1,80}\.[0-9a-f]{12}\.(webp|jpg|png)$/;

/**
 * Ablage der Lokbilder als Dateien (nicht im Layout-JSON, damit WebSocket-Nachrichten klein bleiben).
 * Dateinamen werden ausschließlich hier erzeugt; Benutzereingaben gelangen nie in einen Pfad.
 */
export class LocoImageStore {
  static readonly MAX_BYTES = 1024 * 1024;

  constructor(private dir: string) {}

  static detectFormat(buf: Buffer): LocoImageFormat | null {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return null;
  }

  static isValidUrl(url: unknown): url is string {
    return typeof url === 'string' && url.startsWith(URL_PREFIX) && FILE_RE.test(url.slice(URL_PREFIX.length));
  }

  /** Speichert das Bild und liefert die URL. Wirft LocoImageError bei ungültigen Daten. */
  save(locoId: string, buf: Buffer): string {
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw new LocoImageError(400, 'Keine Bilddaten empfangen.');
    if (buf.length > LocoImageStore.MAX_BYTES) throw new LocoImageError(413, 'Bild ist größer als 1 MB.');
    const format = LocoImageStore.detectFormat(buf);
    if (!format) throw new LocoImageError(415, 'Nur JPEG, PNG oder WebP werden unterstützt.');

    const safeId = String(locoId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'loco';
    const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
    const fileName = `${safeId}.${hash}.${format}`;

    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, fileName), buf);
    return URL_PREFIX + fileName;
  }

  /** Löscht eine eigene Bilddatei; fremde oder ungültige URLs werden ignoriert. */
  remove(url: string | undefined | null): void {
    if (!LocoImageStore.isValidUrl(url)) return;
    const file = this.resolve(url.slice(URL_PREFIX.length));
    if (file && fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch { /* bereits entfernt */ }
    }
  }

  /** Absoluter Dateipfad für einen gültigen Dateinamen, sonst null. */
  resolve(fileName: string): string | null {
    if (typeof fileName !== 'string' || !FILE_RE.test(fileName)) return null;
    const full = path.resolve(this.dir, fileName);
    return path.dirname(full) === path.resolve(this.dir) ? full : null;
  }
}
