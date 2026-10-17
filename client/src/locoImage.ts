import { Locomotive } from './types.js';
import { iconLocos, iconTrainFreight, iconTrainHighspeed, iconTrainPassenger, iconTrainShunter } from './icons.js';

const IMAGE_PATH_RE = /^\/api\/loco-images\/[A-Za-z0-9_-]{1,80}\.[0-9a-f]{12}\.(webp|jpg|png)$/;
const MAX_W = 640;
const MAX_H = 360;

function serverBase(): string {
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const host = window.location.hostname || 'localhost';
  return `${protocol}//${host}:3001`;
}

/** Absolute Bild-URL der Lok oder null (nur Pfade im Server-Schema werden akzeptiert). */
export function locoImageSrc(loco: Pick<Locomotive, 'image'> | null | undefined): string | null {
  const p = loco?.image;
  return typeof p === 'string' && IMAGE_PATH_RE.test(p) ? serverBase() + p : null;
}

/** Platzhalter-Symbol passend zur Zugart. */
export function locoPlaceholderIcon(trainType: Locomotive['trainType'] | undefined, size: number): string {
  switch (trainType) {
    case 'HIGH_SPEED': return iconTrainHighspeed(size);
    case 'FREIGHT': return iconTrainFreight(size);
    case 'SHUNTER': return iconTrainShunter(size);
    case 'PASSENGER':
    case 'COMMUTER': return iconTrainPassenger(size);
    default: return iconLocos(size);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Verkleinert ein Foto auf max. 640 × 360 px und kodiert es als WebP (Fallback JPEG). */
export async function resizeImageFile(file: File): Promise<Blob> {
  // EXIF-Drehung von Handyfotos explizit übernehmen (Hochkant-Fotos sonst evtl. quer)
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const webp = await canvasToBlob(canvas, 'image/webp', 0.8);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.82);
  if (!jpeg) throw new Error('Bild konnte nicht kodiert werden');
  return jpeg;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Lädt das Bild hoch. Bei 404 (Lok wird gerade erst angelegt) wird kurz erneut versucht. */
export async function uploadLocoImage(locoId: string, blob: Blob): Promise<void> {
  const url = `${serverBase()}/api/locos/${encodeURIComponent(locoId)}/image`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
    if (res.ok) return;
    if (res.status !== 404) throw new Error(await readError(res));
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Lok wurde auf dem Server nicht gefunden.');
}

export async function deleteLocoImage(locoId: string): Promise<void> {
  const res = await fetch(`${serverBase()}/api/locos/${encodeURIComponent(locoId)}/image`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(await readError(res));
}
