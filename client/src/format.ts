// Gemeinsame Anzeige-Formate (lesbare Zeiten, Zuggattung), damit überall dieselben Texte stehen.
import { getLanguage, t } from './i18n.js';

/** "gerade eben", "vor 12 s", "vor 5 min", "vor 3 h", "vor 22 Tagen" – statt "Vor 31609m". */
export function formatAgo(timestamp: number | undefined | null, now = Date.now()): string {
  const en = getLanguage() === 'en';
  if (!timestamp) return en ? 'never triggered' : 'noch nie ausgelöst';
  const sec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (sec < 5) return en ? 'just now' : 'gerade eben';
  if (sec < 60) return en ? `${sec} s ago` : `vor ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return en ? `${min} min ago` : `vor ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return en ? `${h} h ago` : `vor ${h} h`;
  const d = Math.floor(h / 24);
  if (en) return d === 1 ? '1 day ago' : `${d} days ago`;
  return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}

/** Grobe Zeitstufe für Render-Signaturen: ändert sich nur, wenn sich der Text von formatAgo ändern kann. */
export function agoBucket(timestamp: number | undefined | null, now = Date.now()): number {
  if (!timestamp) return -1;
  const sec = Math.floor((now - timestamp) / 1000);
  if (sec < 60) return sec;
  if (sec < 3600) return 100 + Math.floor(sec / 60);
  return 1000 + Math.floor(sec / 3600);
}

const TRAIN_TYPE_SHORT: Record<string, { de: string; en: string }> = {
  PASSENGER: { de: 'Personenzug', en: 'Passenger' },
  HIGH_SPEED: { de: 'Hochgeschwindigkeit', en: 'High speed' },
  FREIGHT: { de: 'Güterzug', en: 'Freight' },
  COMMUTER: { de: 'Nahverkehr', en: 'Commuter' },
  SHUNTER: { de: 'Rangierlok', en: 'Shunter' }
};

/** Kurzname der Zuggattung in der aktuellen Sprache ("Personenzug" statt "PASSENGER"). */
export function trainTypeLabel(type: string | undefined): string {
  const entry = type ? TRAIN_TYPE_SHORT[type] : undefined;
  if (!entry) return type || t('throttle.type');
  return getLanguage() === 'en' ? entry.en : entry.de;
}
