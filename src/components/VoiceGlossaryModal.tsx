import { useEffect, useState } from 'react';
import { BookText, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { GlossaryEntry } from '../types';
import { SAMPLE_GLOSSARY_PAIRS, upsertGlossaryEntry } from '../utils/voiceGlossary';

interface VoiceGlossaryModalProps {
  open: boolean;
  entries: GlossaryEntry[];
  onChange: (nextEntries: GlossaryEntry[]) => void;
  onClose: () => void;
}

export function VoiceGlossaryModal({
  open,
  entries,
  onChange,
  onClose,
}: VoiceGlossaryModalProps) {
  const [wrongInput, setWrongInput] = useState('');
  const [correctInput, setCorrectInput] = useState('');

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

  if (!open) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const next = upsertGlossaryEntry(entries, wrongInput, correctInput);
    if (next !== entries) {
      onChange(next);
      setWrongInput('');
      setCorrectInput('');
    }
  };

  const handleToggle = (id: string) => {
    onChange(
      entries.map((entry) =>
        entry.id === id ? { ...entry, enabled: !entry.enabled } : entry
      )
    );
  };

  const handleDelete = (id: string) => {
    onChange(entries.filter((entry) => entry.id !== id));
  };

  const handleAddSample = (wrong: string, correct: string) => {
    onChange(upsertGlossaryEntry(entries, wrong, correct));
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-glossary-title"
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookText size={18} />
            <h2 id="voice-glossary-title">語音錯字自動替換詞庫</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="關閉"
          >
            <X size={18} />
          </button>
        </div>

        <p className="field-help" style={{ marginBottom: 14 }}>
          語音辨識常把人名或專有名詞聽成同音字（例如「程經歷 → 陳經理」）。加入規則後，每次口述都會自動替換，且可隨時在片段中還原原文。
        </p>

        <form onSubmit={handleAdd} className="glossary-add-form">
          <input
            type="text"
            className="drawer-input"
            value={wrongInput}
            onChange={(e) => setWrongInput(e.target.value)}
            placeholder="辨識錯字（如：程經歷）"
            aria-label="辨識錯字"
          />
          <span className="glossary-arrow" aria-hidden="true">→</span>
          <input
            type="text"
            className="drawer-input"
            value={correctInput}
            onChange={(e) => setCorrectInput(e.target.value)}
            placeholder="正確詞彙（如：陳經理）"
            aria-label="正確詞彙"
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={
              !wrongInput.trim() ||
              !correctInput.trim() ||
              wrongInput.trim() === correctInput.trim()
            }
          >
            <Plus size={14} />
            <span>新增</span>
          </button>
        </form>

        <div className="glossary-samples">
          <span className="glossary-samples-label">
            <Sparkles size={12} />
            快速範例：
          </span>
          {SAMPLE_GLOSSARY_PAIRS.map((sample) => {
            const exists = entries.some((e) => e.wrong === sample.wrong);
            return (
              <button
                key={sample.wrong}
                type="button"
                className="glossary-sample-chip"
                disabled={exists}
                onClick={() => handleAddSample(sample.wrong, sample.correct)}
              >
                {sample.wrong} → {sample.correct}
              </button>
            );
          })}
        </div>

        <div className="glossary-list">
          {entries.length === 0 ? (
            <div className="glossary-empty">
              尚未建立替換規則。你也可以直接在語音片段修改錯字後，點「記住修正」快速加入。
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className={`glossary-row ${entry.enabled ? '' : 'is-disabled'}`}
              >
                <label className="glossary-toggle">
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={() => handleToggle(entry.id)}
                  />
                  <span className="glossary-wrong">{entry.wrong}</span>
                  <span className="glossary-arrow">→</span>
                  <span className="glossary-correct">{entry.correct}</span>
                </label>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => handleDelete(entry.id)}
                  aria-label={`刪除規則 ${entry.wrong}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="drawer-footer" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
