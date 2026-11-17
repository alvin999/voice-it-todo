import { useCallback, useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { NoteIconId } from '../types';
import { getIconFieldConfig, getNoteIconMeta, NOTE_ICON_META } from '../utils/noteIcons';

interface IconPickerPopoverProps {
  value?: NoteIconId;
  onChange: (icon: NoteIconId) => void;
  onOpenChange?: (open: boolean) => void;
  onOpenTemplateModal?: () => void;
  triggerClassName?: string;
  triggerLabel?: string;
  showLabelInTrigger?: boolean;
}

export function IconPickerPopover({
  value,
  onChange,
  onOpenChange,
  onOpenTemplateModal,
  triggerClassName = 'note-icon-badge',
  triggerLabel,
  showLabelInTrigger = false,
}: IconPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const currentMeta = getNoteIconMeta(value);
  const CurrentIcon = currentMeta.Icon;

  const updateOpen = useCallback((next: boolean) => {
    setOpen(next);
    onOpenChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        updateOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        updateOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, updateOpen]);

  return (
    <div
      ref={containerRef}
      className="icon-popover-wrap"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`${triggerClassName} ${open ? 'is-open' : ''}`}
        onClick={() => updateOpen(!open)}
        title={triggerLabel ?? `選擇圖示（目前：${currentMeta.label}）`}
        aria-label={triggerLabel ?? `選擇圖示，目前為${currentMeta.label}`}
        aria-expanded={open}
      >
        <CurrentIcon size={14} />
        {showLabelInTrigger && <span>{currentMeta.label}</span>}
      </button>

      {open && (
        <div className="icon-popover-menu" role="menu" aria-label="選擇便利貼圖示">
          <div className="icon-popover-grid">
            {NOTE_ICON_META.map((item) => {
              const ItemIcon = item.Icon;
              const isActive = currentMeta.id === item.id;
              const hasCustomField = getIconFieldConfig(item.id).enabled;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  className={`icon-popover-item ${isActive ? 'is-active' : ''}`}
                  title={`${item.label}（${item.hint}）${hasCustomField ? ' [已啟用欄位範本]' : ''}`}
                  onClick={() => {
                    onChange(item.id);
                    updateOpen(false);
                  }}
                >
                  <ItemIcon size={15} />
                  <span className="icon-popover-item-label">{item.label}</span>
                </button>
              );
            })}
          </div>

          {onOpenTemplateModal && (
            <div
              style={{
                borderTop: '1px solid var(--border-color, #e2e8f0)',
                padding: '8px 10px 4px 10px',
                marginTop: 6,
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  fontSize: '0.8rem',
                }}
                onClick={() => {
                  updateOpen(false);
                  onOpenTemplateModal();
                }}
              >
                <SlidersHorizontal size={13} />
                <span>設定分類欄位範本...</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
