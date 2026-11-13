import { useEffect, useState } from 'react';
import { KeyRound, Lock, RefreshCw, ShieldCheck, Unlock, X } from 'lucide-react';
import type { ByokConfig, ByokProvider, KeyStorageMode } from '../types';
import {
  fetchAvailableModels,
  PROVIDER_PRESETS,
  type DetectedModel,
} from '../utils/byokAi';

interface ByokModalProps {
  open: boolean;
  config: ByokConfig;
  isLocked: boolean;
  cryptoError: string | null;
  onClose: () => void;
  onSave: (next: ByokConfig, password?: string) => Promise<void>;
  onUnlock: (password: string) => Promise<boolean>;
  onLock: () => void;
  onClearKey: () => void;
}

const PROVIDERS: ByokProvider[] = ['gemini', 'groq', 'openai', 'claude', 'ollama'];

const STORAGE_MODES: Array<{
  value: KeyStorageMode;
  label: string;
  desc: string;
}> = [
  {
    value: 'transparent',
    label: '本機透明加密',
    desc: 'AES-GCM 加密後存本機，金鑰綁定此瀏覽器 IndexedDB，免輸密碼自動解鎖',
  },
  {
    value: 'password',
    label: '密碼加密',
    desc: 'PBKDF2 + AES-GCM 加密，重整頁面後需輸入密碼解鎖金鑰',
  },
  {
    value: 'plain',
    label: '無加密',
    desc: '明文存於本機 localStorage（僅建議本地開發測試使用）',
  },
];

export function ByokModal({
  open,
  config,
  isLocked,
  cryptoError,
  onClose,
  onSave,
  onUnlock,
  onLock,
  onClearKey,
}: ByokModalProps) {
  const [draft, setDraft] = useState<ByokConfig>(config);
  const [password, setPassword] = useState('');
  const [unlockInput, setUnlockInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detectedModels, setDetectedModels] = useState<DetectedModel[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detectTick, setDetectTick] = useState(0);

  useEffect(() => {
    if (open) {
      setDraft(config);
      setPassword('');
      setUnlockInput('');
      setFormError(null);
      setDetectError(null);
    }
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || isLocked) return;

    const currentPreset = PROVIDER_PRESETS[draft.provider];
    if (currentPreset.requiresKey && !draft.apiKey.trim()) {
      setDetectedModels([]);
      setDetecting(false);
      setDetectError(null);
      setDraft((prev) => (prev.model === '' ? prev : { ...prev, model: '' }));
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDetecting(true);
      setDetectError(null);
      fetchAvailableModels({
        provider: draft.provider,
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey,
        signal: controller.signal,
      })
        .then((list) => {
          if (controller.signal.aborted) return;
          setDetectedModels(list);
          if (list.length === 0) {
            setDraft((prev) => (prev.model === '' ? prev : { ...prev, model: '' }));
          } else {
            setDraft((prev) =>
              list.some((m) => m.id === prev.model)
                ? prev
                : { ...prev, model: list[0].id }
            );
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setDetectedModels([]);
          setDraft((prev) => (prev.model === '' ? prev : { ...prev, model: '' }));
          setDetectError(
            err instanceof Error ? err.message : '無法偵測可用模型'
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setDetecting(false);
          }
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, isLocked, draft.provider, draft.baseUrl, draft.apiKey, detectTick]);

  if (!open) return null;

  const preset = PROVIDER_PRESETS[draft.provider];

  const handleProviderChange = (provider: ByokProvider) => {
    const nextPreset = PROVIDER_PRESETS[provider];
    setDetectedModels([]);
    setDetectError(null);
    setDraft((prev) => ({
      ...prev,
      provider,
      model: '',
      baseUrl: nextPreset.defaultBaseUrl,
    }));
  };

  const handleSave = async () => {
    setFormError(null);
    if (draft.enabled && !draft.model.trim()) {
      setFormError(
        preset.requiresKey
          ? '請先輸入有效的 API Key 並等待偵測到可用模型後再啟用'
          : '未偵測到可用的本機模型，請確認 Ollama 已啟動並下載模型'
      );
      return;
    }
    if (
      draft.storageMode === 'password' &&
      preset.requiresKey &&
      draft.apiKey.trim() &&
      !password.trim()
    ) {
      setFormError('選擇「密碼加密」時請設定解密密碼');
      return;
    }

    setSaving(true);
    try {
      await onSave(draft, password.trim() || undefined);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!unlockInput.trim()) return;
    const ok = await onUnlock(unlockInput.trim());
    if (ok) {
      setUnlockInput('');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="byok-modal-title"
      >
        <div className="modal-header">
          <h2 id="byok-modal-title">AI 金鑰設定</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="關閉"
          >
            <X size={18} />
          </button>
        </div>

        {isLocked ? (
          <div className="field-group">
            <div className="error-toast" style={{ background: '#fdf8e7', borderColor: 'rgba(202, 165, 62, 0.35)', color: '#7a5d12' }}>
              已設定「密碼加密」，請輸入密碼解鎖本機 API Key。
            </div>
            <label className="field-label" htmlFor="unlock-pass-input">
              解密密碼
            </label>
            <div className="field-row">
              <input
                id="unlock-pass-input"
                type="password"
                className="field-input"
                value={unlockInput}
                onChange={(e) => setUnlockInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleUnlock();
                }}
                placeholder="輸入當時設定的密碼"
              />
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleUnlock()}
              >
                <Unlock size={15} />
                <span>解鎖</span>
              </button>
            </div>
            {cryptoError && (
              <p className="field-help" style={{ color: 'var(--danger)' }}>
                {cryptoError}
              </p>
            )}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClearKey}
              >
                忘記密碼？清除舊金鑰
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="field-group">
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <span className="field-label" style={{ marginBottom: 0 }}>
                  啟用 AI 金鑰自動整理語音與脈絡
                </span>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                />
              </label>
              <p className="field-help">
                金鑰僅存於你的瀏覽器本機，不會上傳至 Cloudflare D1 資料庫。
              </p>
            </div>

            <div className="field-group">
              <span className="field-label">AI 供應商</span>
              <div className="provider-grid">
                {PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`provider-chip ${draft.provider === p ? 'is-active' : ''}`}
                    onClick={() => handleProviderChange(p)}
                  >
                    {PROVIDER_PRESETS[p].label}
                  </button>
                ))}
              </div>
            </div>

            {preset.requiresKey && (
              <div className="field-group">
                <label className="field-label" htmlFor="byok-key-input">
                  API Key
                </label>
                <input
                  id="byok-key-input"
                  type="password"
                  className="field-input"
                  style={{ width: '100%' }}
                  value={draft.apiKey}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, apiKey: e.target.value }))
                  }
                  placeholder={preset.placeholderKey}
                />
              </div>
            )}

            <div className="field-group">
              <label className="field-label" htmlFor="byok-baseurl-input">
                API Endpoint Base URL
              </label>
              <input
                id="byok-baseurl-input"
                className="field-input"
                style={{ width: '100%' }}
                value={draft.baseUrl}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, baseUrl: e.target.value }))
                }
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="byok-model-select">
                可用模型（自動偵測）
              </label>
              <div className="field-row">
                <select
                  id="byok-model-select"
                  className="field-input"
                  style={{ flex: 1 }}
                  disabled={detecting || detectedModels.length === 0}
                  value={draft.model}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, model: e.target.value }))
                  }
                >
                  {detectedModels.length === 0 ? (
                    <option value="">
                      {detecting
                        ? '偵測可用模型中...'
                        : preset.requiresKey && !draft.apiKey.trim()
                          ? '請先輸入 API Key 以自動偵測模型'
                          : '未偵測到可用模型'}
                    </option>
                  ) : (
                    detectedModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={
                    detecting || (preset.requiresKey && !draft.apiKey.trim())
                  }
                  onClick={() => setDetectTick((t) => t + 1)}
                >
                  <RefreshCw size={14} />
                  <span>{detecting ? '偵測中...' : '重新偵測'}</span>
                </button>
              </div>
              {detectError ? (
                <p className="field-help" style={{ color: 'var(--danger)' }}>
                  {detectError}
                </p>
              ) : detectedModels.length > 0 ? (
                <p className="field-help">
                  已偵測到 {detectedModels.length} 個可用模型。
                </p>
              ) : null}
            </div>

            {preset.requiresKey && (
              <>
                <div className="field-group">
                  <span className="field-label">本機儲存加密方式</span>
                  <div className="storage-mode-list">
                    {STORAGE_MODES.map((m) => (
                      <label
                        key={m.value}
                        className={`storage-mode-item ${
                          draft.storageMode === m.value ? 'is-active' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="key-storage-mode"
                          checked={draft.storageMode === m.value}
                          onChange={() =>
                            setDraft((prev) => ({ ...prev, storageMode: m.value }))
                          }
                        />
                        <div>
                          <div className="storage-mode-title">{m.label}</div>
                          <div className="storage-mode-desc">{m.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {draft.storageMode === 'password' && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="byok-pass-input">
                      設定解密密碼
                    </label>
                    <input
                      id="byok-pass-input"
                      type="password"
                      className="field-input"
                      style={{ width: '100%' }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="輸入用於加密 API Key 的密碼"
                    />
                  </div>
                )}
              </>
            )}

            {(formError || cryptoError) && (
              <div className="error-toast">{formError || cryptoError}</div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                {draft.storageMode === 'password' && config.apiKey && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      onLock();
                      onClose();
                    }}
                  >
                    <Lock size={14} />
                    <span>立即鎖定</span>
                  </button>
                )}
                {config.apiKey && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      onClearKey();
                      setDraft((prev) => ({ ...prev, apiKey: '' }));
                    }}
                  >
                    <KeyRound size={14} />
                    <span>清除 Key</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                <ShieldCheck size={15} />
                <span>{saving ? '加密儲存中...' : '儲存設定'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
