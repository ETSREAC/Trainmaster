/**
 * TrainMaster - Client-Side Supporter Key Verification (ECDSA P-256)
 * =============================================================================
 * Verifies cryptographically signed keys offline directly in the browser via
 * the Web Crypto API (crypto.subtle).
 */

import { SUPPORTER_PUBLIC_KEY_SPKI } from './licensePublicKey.js';

const STORAGE_KEY = 'trainmaster_supporter_license';

export interface SupporterPayload {
  supporter: string;
  tier?: string;
  issuedAt?: string;
}

export interface SupporterState {
  unlocked: boolean;
  supporter?: string;
  tier?: string;
  code?: string;
}

function base64urlDecodeToArrayBuffer(str: string): ArrayBuffer {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Validates a supporter code string using ECDSA P-256 with the public key.
 */
export async function verifySupporterCode(codeStr: string): Promise<{ valid: boolean; payload?: SupporterPayload; error?: string }> {
  try {
    const trimmed = codeStr.trim();
    const parts = trimmed.split('.');
    if (parts.length !== 3 || parts[0] !== 'TM1') {
      return { valid: false, error: 'Ungültiges Format. Code muss mit "TM1." beginnen.' };
    }

    if (!window.crypto || !window.crypto.subtle) {
      return { valid: false, error: 'Web Crypto API nicht verfügbar.' };
    }

    const spkiBuffer = base64ToArrayBuffer(SUPPORTER_PUBLIC_KEY_SPKI);
    const publicKey = await window.crypto.subtle.importKey(
      'spki',
      spkiBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const payloadBuffer = base64urlDecodeToArrayBuffer(parts[1]);
    const sigBuffer = base64urlDecodeToArrayBuffer(parts[2]);

    const isValid = await window.crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      publicKey,
      sigBuffer,
      payloadBuffer
    );

    if (!isValid) {
      return { valid: false, error: 'Ungültige Signatur. Bitte Code überprüfen.' };
    }

    const payloadText = new TextDecoder().decode(payloadBuffer);
    const payload: SupporterPayload = JSON.parse(payloadText);

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Prüfung fehlgeschlagen.' };
  }
}

/**
 * Returns the currently stored supporter state.
 */
export function getSupporterState(): SupporterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { unlocked: false };
    const data = JSON.parse(raw);
    return {
      unlocked: true,
      supporter: data.supporter,
      tier: data.tier,
      code: data.code
    };
  } catch {
    return { unlocked: false };
  }
}

/**
 * Checks if the clean edition is currently unlocked.
 */
export function isCleanEditionUnlocked(): boolean {
  return getSupporterState().unlocked;
}

/**
 * Unlocks the clean edition by verifying and saving the code.
 */
export async function unlockCleanEdition(codeStr: string): Promise<{ success: boolean; supporter?: string; error?: string }> {
  const result = await verifySupporterCode(codeStr);
  if (!result.valid || !result.payload) {
    return { success: false, error: result.error || 'Ungültiger Code.' };
  }

  const data = {
    unlockedAt: new Date().toISOString(),
    code: codeStr.trim(),
    supporter: result.payload.supporter,
    tier: result.payload.tier
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('trainmaster:supporter-changed', { detail: data }));

  return { success: true, supporter: result.payload.supporter };
}

/**
 * Removes the stored supporter code.
 */
export function removeSupporterCode(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('trainmaster:supporter-changed', { detail: { unlocked: false } }));
}
