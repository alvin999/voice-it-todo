import type { KeyStorageMode } from '../types';

const DB_NAME = 'postittodo_keystore_v1';
const STORE_NAME = 'keys';
const DEVICE_KEY_ID = 'transparent_aes_key';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const db = await openKeyDb();
  const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(DEVICE_KEY_ID);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });

  if (existing) {
    db.close();
    return existing;
  }

  // 建立不可匯出 (non-extractable) 的裝置金鑰，僅存於 IndexedDB
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(key, DEVICE_KEY_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  db.close();
  return key;
}

async function derivePasswordKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 150000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface StoredSecretEnvelope {
  mode: KeyStorageMode;
  ciphertext?: string;
  iv?: string;
  salt?: string;
  plainValue?: string;
}

export async function sealApiKey(
  apiKey: string,
  mode: KeyStorageMode,
  password?: string
): Promise<StoredSecretEnvelope> {
  const cleaned = apiKey.trim();
  if (!cleaned || mode === 'plain') {
    return { mode: 'plain', plainValue: cleaned };
  }

  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  if (mode === 'transparent') {
    const key = await getOrCreateDeviceKey();
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(cleaned)
    );
    return {
      mode: 'transparent',
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(encrypted)),
    };
  }

  if (!password) {
    throw new Error('密碼加密模式需要輸入解密密碼');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derivePasswordKey(password, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(cleaned)
  );

  return {
    mode: 'password',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
}

export async function unsealApiKey(
  envelope: StoredSecretEnvelope,
  password?: string
): Promise<string> {
  if (envelope.mode === 'plain') {
    return envelope.plainValue ?? '';
  }

  if (!envelope.ciphertext || !envelope.iv) {
    return '';
  }

  const dec = new TextDecoder();
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);

  if (envelope.mode === 'transparent') {
    const key = await getOrCreateDeviceKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return dec.decode(decrypted);
  }

  if (!password || !envelope.salt) {
    throw new Error('LOCKED');
  }

  const salt = fromBase64(envelope.salt);
  const key = await derivePasswordKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );
  return dec.decode(decrypted);
}
