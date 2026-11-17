import { useState } from 'react';
import { Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import type { IconTemplateMap, NoteIconId } from '../types';
import {
  getIconFieldConfig,
  getNoteIconMeta,
  loadIconTemplates,
  NOTE_ICON_META,
  saveIconTemplates,
} from '../utils/noteIcons';

interface IconTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onTemplatesUpdated?: () => void;
}

export function IconTemplateModal({
  open,
  onClose,
  onTemplatesUpdated,
}: IconTemplateModalProps) {
  const [templates, setTemplates] = useState<IconTemplateMap>(() => loadIconTemplates());
  const [selectedIconId, setSelectedIconId] = useState<NoteIconId>('shopping-cart');

  if (!open) return null;

  const currentMeta = getNoteIconMeta(selectedIconId);
  const CurrentIcon = currentMeta.Icon;
  const currentConfig = getIconFieldConfig(selectedIconId, templates);

  const handleToggleEnable = (enabled: boolean) => {
    const updated: IconTemplateMap = {
      ...templates,
      [selectedIconId]: {
        ...currentConfig,
        enabled,
      },
    };
    setTemplates(updated);
    saveIconTemplates(updated);
    onTemplatesUpdated?.();
  };

  const handleFieldChange = (text: string) => {
    // 支援以換行、逗號或斜線分隔自訂欄位
    const fields = text
      .split(/[\n,，/／]+/)
      .map((f) => f.trim())
      .filter(Boolean);

    const updated: IconTemplateMap = {
      ...templates,
      [selectedIconId]: {
        ...currentConfig,
        fields,
      },
    };
    setTemplates(updated);
    saveIconTemplates(updated);
    onTemplatesUpdated?.();
  };

  const handleResetToDefault = () => {
    const updated: IconTemplateMap = {
      ...templates,
      [selectedIconId]: {
        enabled: true,
        fields: [...currentMeta.defaultFields],
      },
    };
    setTemplates(updated);
    saveIconTemplates(updated);
    onTemplatesUpdated?.();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-panel"
        style={{ maxWidth: 580 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="icon-template-modal-title"
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SlidersHorizontal size={18} />
            <h2 id="icon-template-modal-title" style={{ margin: 0, fontSize: '1.1rem' }}>
              自訂圖示專屬欄位範本
            </h2>
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
          開啟後，選擇該圖示時會自動將欄位填入脈絡備註；同時會連動告知 AI「智慧解析」嚴格依照該欄位格式整理。
        </p>

        {/* 圖示橫向切換列 */}
        <div className="icon-template-selector" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {NOTE_ICON_META.map((meta) => {
            const IconComp = meta.Icon;
            const isSelected = meta.id === selectedIconId;
            const isEnabled = getIconFieldConfig(meta.id, templates).enabled;

            return (
              <button
                key={meta.id}
                type="button"
                className={`provider-chip ${isSelected ? 'is-active' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  position: 'relative',
                }}
                onClick={() => setSelectedIconId(meta.id)}
              >
                <IconComp size={14} />
                <span>{meta.label}</span>
                {isEnabled && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--accent, #14b8a6)',
                      marginLeft: 2,
                    }}
                    title="已啟用欄位限制"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* 編輯選取圖示的欄位設定 */}
        <div
          style={{
            background: 'var(--surface-sunken, #f8fafc)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  background: 'var(--surface-raised, #ffffff)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border-color, #cbd5e1)',
                }}
              >
                <CurrentIcon size={16} />
              </div>
              <div>
                <strong style={{ fontSize: '0.95rem' }}>{currentMeta.label}</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)' }}>
                  {currentMeta.hint}
                </div>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={currentConfig.enabled}
                onChange={(e) => handleToggleEnable(e.target.checked)}
              />
              <span>啟用專屬欄位</span>
            </label>
          </div>

          <div className="field-group" style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor="template-fields-input">
              欄位清單（每行一個，或以逗號／斜線分隔）
            </label>
            <textarea
              id="template-fields-input"
              className="drawer-textarea"
              rows={4}
              value={currentConfig.fields.join('\n')}
              disabled={!currentConfig.enabled}
              onChange={(e) => handleFieldChange(e.target.value)}
              placeholder="例如：&#10;品項&#10;數量&#10;預算"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.82rem', padding: '4px 10px' }}
              onClick={handleResetToDefault}
            >
              <RotateCcw size={13} style={{ marginRight: 4 }} />
              恢復此圖示推薦預設
            </button>

            {currentConfig.enabled && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #64748b)' }}>
                選取此圖示時將自動帶入 {currentConfig.fields.length} 個欄位
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn-primary" onClick={onClose}>
            <Check size={15} style={{ marginRight: 4 }} />
            完成設定
          </button>
        </div>
      </div>
    </div>
  );
}
