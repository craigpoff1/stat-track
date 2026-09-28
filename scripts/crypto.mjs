// Password encryption for the published stats file. The site decrypts it in the browser with the
// same parameters (see site/app.js → unlock). AES-256-GCM; key from PBKDF2-SHA256.
// The salt is fixed per site so a device can cache the derived key across the 2-hourly rebuilds;
// the IV is random per build.
import { webcrypto as crypto } from 'node:crypto';

export const KDF_ITERATIONS = 600_000;
export const SALT = 'stat-track:v1:site-key';

const b64 = (buf) => Buffer.from(buf).toString('base64');

export async function deriveKey(password, { salt = SALT, iterations = KDF_ITERATIONS } = {}) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(text, password) {
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { v: 1, kdf: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: SALT, iv: b64(iv), ct: b64(ct) };
}

export async function decryptJson(env, password) {
  const key = await deriveKey(password, { salt: env.salt, iterations: env.iterations });
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(env.iv, 'base64') }, key, Buffer.from(env.ct, 'base64'));
  return new TextDecoder().decode(pt);
}
