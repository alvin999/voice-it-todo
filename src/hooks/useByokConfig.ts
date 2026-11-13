import { useCallback, useEffect, useState } from 'react';
import type { ByokConfig } from '../types';
import { PROVIDER_PRESETS } from '../utils/byokAi';
import {
  sealApiKey,
  unsealApiKey,
  type StoredSecretEnvelope,
} from '../utils/keyCrypto';

const STORAGE_META_KEY = 'postittodo_byok_meta_v1';
const STORAGE_SECRET_KEY = 'postittodo_byok_secret_v1';

const DEFAULT_CONFIG: ByokConfig = {
  enabled: false,
  provider: 'gemini',
  model: '',
  baseUrl: PROVIDER_PRESETS.gemini.defaultBaseUrl,
  apiKey: '',
  storageMode: 'transparent',
};

function getDefaultMeta(): Omit<ByokConfig, 'apiKey'> {
  return {
    enabled: DEFAULT_CONFIG.enabled,
    provider: DEFAULT_CONFIG.provider,
    model: DEFAULT_CONFIG.model,
    baseUrl: DEFAULT_CONFIG.baseUrl,
    storageMode: DEFAULT_CONFIG.storageMode,
  };
}

function loadMeta(): Omit<ByokConfig, 'apiKey'> {
  if (typeof window === 'undefined') {
    return getDefaultMeta();
  }
  try {
    const raw = localStorage.getItem(STORAGE_META_KEY);
    if (!raw) {
      return getDefaultMeta();
    }
    const parsed = JSON.parse(raw) as Partial<Omit<ByokConfig, 'apiKey'>>;
    const provider =
      parsed.provider && parsed.provider in PROVIDER_PRESETS
        ? parsed.provider
        : 'gemini';
    const preset = PROVIDER_PRESETS[provider];
    return {
      enabled: Boolean(parsed.enabled),
      provider,
      model: typeof parsed.model === 'string' ? parsed.model : '',
      baseUrl: parsed.baseUrl || preset.defaultBaseUrl,
      storageMode: parsed.storageMode ?? 'transparent',
    };
  } catch {
    return getDefaultMeta();
  }
}

function loadEnvelope(): StoredSecretEnvelope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_SECRET_KEY);
    return raw ? (JSON.parse(raw) as StoredSecretEnvelope) : null;
  } catch {
    return null;
  }
}

export function useByokConfig() {
  const [config, setConfig] = useState<ByokConfig>(() => ({
    ...loadMeta(),
    apiKey: '',
  }));
  const [isLocked, setIsLocked] = useState(false);
  const [cryptoError, setCryptoError] = useState<string | null>(null);

  // 初始化時嘗試自動解密 (transparent / plain) 或標記為需要密碼解鎖
  useEffect(() => {
    const envelope = loadEnvelope();
    if (!envelope) return;

    if (envelope.mode === 'password' && envelope.ciphertext) {
      setIsLocked(true);
      return;
    }

    unsealApiKey(envelope)
      .then((key) => {
        setConfig((prev) => ({ ...prev, apiKey: key }));
        setIsLocked(false);
      })
      .catch(() => {
        setCryptoError('無法讀取本機加密金鑰，請重新輸入 API Key。');
      });
  }, []);

  const unlockWithPassword = useCallback(async (password: string) => {
    const envelope = loadEnvelope();
    if (!envelope) return false;
    setCryptoError(null);
    try {
      const key = await unsealApiKey(envelope, password);
      setConfig((prev) => ({ ...prev, apiKey: key }));
      setIsLocked(false);
      return true;
    } catch {
      setCryptoError('解密密碼錯誤，請再試一次。');
      return false;
    }
  }, []);

  const saveConfig = useCallback(
    async (next: ByokConfig, password?: string) => {
      setCryptoError(null);
      const { apiKey, ...meta } = next;
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));

      if (apiKey.trim()) {
        const envelope = await sealApiKey(apiKey, next.storageMode, password);
        localStorage.setItem(STORAGE_SECRET_KEY, JSON.stringify(envelope));
      } else {
        localStorage.removeItem(STORAGE_SECRET_KEY);
      }

      setConfig(next);
      setIsLocked(false);
    },
    []
  );

  const lockSession = useCallback(() => {
    const envelope = loadEnvelope();
    if (envelope?.mode === 'password' && envelope.ciphertext) {
      setConfig((prev) => ({ ...prev, apiKey: '' }));
      setIsLocked(true);
    }
  }, []);

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(STORAGE_SECRET_KEY);
    setConfig((prev) => ({ ...prev, apiKey: '' }));
    setIsLocked(false);
    setCryptoError(null);
  }, []);

  return {
    config,
    isLocked,
    cryptoError,
    unlockWithPassword,
    saveConfig,
    lockSession,
    clearApiKey,
  };
}
