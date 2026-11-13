import React, { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Copy,
  Download,
  GripVertical,
  HardDrive,
  KeyRound,
  Lock,
  Mic,
  MicOff,
  Pencil,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { ByokModal } from './components/ByokModal';
import { IconPickerPopover } from './components/IconPickerPopover';
import { useByokConfig } from './hooks/useByokConfig';
import { useTodoStore } from './hooks/useTodoStore';
import { useVoiceInput } from './hooks/useVoiceInput';
import type { FilterType, InputParseMode, NoteIconId, Todo } from './types';
import { PROVIDER_PRESETS } from './utils/byokAi';
import { getNoteIconMeta, NOTE_ICON_META } from './utils/noteIcons';
import './App.css';

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SortableNoteCardProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<Todo, 'title' | 'contextNote' | 'color' | 'icon' | 'tags'>>
  ) => void;
}

function SortableNoteCard({
  todo,
  onToggle,
  onDelete,
  onUpdate,
}: SortableNoteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editContext, setEditContext] = useState(todo.contextNote);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasDetails = Boolean(todo.contextNote || todo.transcript);
  const iconMeta = getNoteIconMeta(todo.icon);

  const handleSaveEdit = () => {
    const nextTitle = editTitle.trim();
    if (!nextTitle) return;
    onUpdate(todo.id, {
      title: nextTitle,
      contextNote: editContext.trim(),
    });
    setEditing(false);
  };

  const startEditing = () => {
    setEditTitle(todo.title);
    setEditContext(todo.contextNote);
    setExpanded(true);
    setEditing(true);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`note-card ${todo.completed ? 'is-completed' : ''} ${isDragging ? 'is-dragging' : ''
        } ${iconPickerOpen ? 'is-picker-open' : ''}`}
    >
      <div className="note-main">
        <button
          type="button"
          className="drag-handle"
          aria-label="拖曳調整順序"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>

        <button
          type="button"
          className={`check-btn ${todo.completed ? 'is-checked' : ''}`}
          aria-label={todo.completed ? '標記為未完成' : '標記為已完成'}
          onClick={() => onToggle(todo.id)}
        >
          {todo.completed && <Check size={14} strokeWidth={3} />}
        </button>

        <div
          className="note-content"
          onClick={() => setExpanded((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded((prev) => !prev);
            }
          }}
        >
          <div className="note-title-row">
            <IconPickerPopover
              value={todo.icon}
              onChange={(icon) => onUpdate(todo.id, { icon })}
              onOpenChange={setIconPickerOpen}
              triggerLabel={`選擇圖示（目前：${iconMeta.label}）`}
            />
            <div className="note-title">{todo.title}</div>
          </div>

          {(todo.contextNote || todo.tags.length > 0 || todo.transcript) && (
            <div className="note-meta-row">
              {todo.tags.map((tag) => (
                <span key={tag} className="tag-pill">
                  {tag}
                </span>
              ))}
              {hasDetails && !expanded && (
                <span className="context-badge">
                  <Sparkles size={11} />
                  {todo.contextNote ? '含脈絡備註' : '含語音原文'}
                </span>
              )}
              {!expanded && todo.contextNote && (
                <span className="note-preview">{todo.contextNote}</span>
              )}
            </div>
          )}
        </div>

        <div className="note-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={expanded ? '收合細節' : '展開脈絡細節'}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="編輯待辦與脈絡"
            onClick={startEditing}
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            aria-label="刪除待辦"
            onClick={() => onDelete(todo.id)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="note-drawer">
          {editing ? (
            <div className="drawer-edit-form">
              <div>
                <div className="drawer-section-label">標題</div>
                <input
                  className="drawer-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="簡短行動標題"
                />
              </div>
              <div>
                <div className="drawer-section-label">脈絡備註（避免過幾天忘記在記什麼）</div>
                <textarea
                  className="drawer-textarea"
                  value={editContext}
                  onChange={(e) => setEditContext(e.target.value)}
                  placeholder="補充原因、對象、型號或期限..."
                />
              </div>
              <div>
                <div className="drawer-section-label">圖示</div>
                <div className="icon-picker-grid">
                  {NOTE_ICON_META.map((item) => {
                    const ItemIcon = item.Icon;
                    const isActive = iconMeta.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`icon-picker-btn ${isActive ? 'is-active' : ''}`}
                        title={item.label}
                        aria-label={`選擇圖示 ${item.label}`}
                        onClick={() => onUpdate(todo.id, { icon: item.id })}
                      >
                        <ItemIcon size={14} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="drawer-footer" style={{ justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditing(false)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveEdit}
                  >
                    儲存變更
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="drawer-section-label">脈絡備註</div>
                <div className="drawer-context-text">
                  {todo.contextNote || '尚無補充脈絡，點擊右側編輯按鈕可新增。'}
                </div>
              </div>

              {todo.transcript && (
                <div>
                  <div className="drawer-section-label">原始口述逐字稿</div>
                  <div className="transcript-box">
                    <Mic size={14} style={{ flexShrink: 0, marginTop: 3 }} />
                    <span>{todo.transcript}</span>
                  </div>
                </div>
              )}

              <div>
                <div className="drawer-section-label">圖示</div>
                <div className="icon-picker-grid">
                  {NOTE_ICON_META.map((item) => {
                    const ItemIcon = item.Icon;
                    const isActive = iconMeta.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`icon-picker-btn ${isActive ? 'is-active' : ''}`}
                        title={item.label}
                        aria-label={`選擇圖示 ${item.label}`}
                        onClick={() => onUpdate(todo.id, { icon: item.id })}
                      >
                        <ItemIcon size={14} />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="drawer-footer">
                <span className="timestamp-text">
                  建立於 {formatRelativeDate(todo.createdAt)}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export function App() {
  const {
    todos,
    spaceKey,
    apiUrl,
    syncStatus,
    setApiUrl,
    setSpaceKey,
    fetchFromCloud,
    pushAllToCloud,
    addTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
    reorderTodos,
  } = useTodoStore();

  const [draftTitle, setDraftTitle] = useState('');
  const [draftContext, setDraftContext] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contextInputRef = useRef<HTMLTextAreaElement>(null);
  const [selectedIcon, setSelectedIcon] = useState<NoteIconId>('sticky-note');
  const [hasManualIcon, setHasManualIcon] = useState(false);
  const [parseMode, setParseMode] = useState<InputParseMode>('smart');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [usedVoiceInDraft, setUsedVoiceInDraft] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [byokModalOpen, setByokModalOpen] = useState(false);

  const byok = useByokConfig();

  const [spaceInput, setSpaceInput] = useState(spaceKey);
  const [apiInput, setApiInput] = useState(apiUrl);
  const [copiedHint, setCopiedHint] = useState(false);

  const voice = useVoiceInput({
    lang: 'zh-TW',
    onFinalTranscript: (chunk) => {
      setUsedVoiceInDraft(true);
      // 語音輸入：若標題尚無內容則填入標題；若已存在標題則補充至脈絡備註
      setDraftTitle((prevTitle) => {
        if (!prevTitle.trim()) {
          return chunk;
        }
        setDraftContext((prevContext) =>
          prevContext ? `${prevContext} ${chunk}` : chunk
        );
        return prevTitle;
      });
    },
  });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const filteredTodos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return todos.filter((item) => {
      if (filter === 'active' && item.completed) return false;
      if (filter === 'completed' && !item.completed) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.contextNote.toLowerCase().includes(q) ||
        item.transcript.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [todos, filter, searchQuery]);

  const activeCount = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos]
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const rawInput = [draftTitle.trim(), draftContext.trim()].filter(Boolean).join('\n');
    if (!rawInput || isSubmitting) return;
    if (voice.isListening) {
      voice.stop();
    }
    setIsSubmitting(true);
    try {
      const ok = await addTodo(rawInput, {
        icon: selectedIcon,
        mode: parseMode,
        respectManualIcon: hasManualIcon,
        isVoice: usedVoiceInDraft,
        byokConfig: byok.config,
      });
      if (ok) {
        setDraftTitle('');
        setDraftContext('');
        setUsedVoiceInDraft(false);
        setSelectedIcon('sticky-note');
        setHasManualIcon(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = todos.findIndex((t) => t.id === active.id);
    const newIndex = todos.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(todos, oldIndex, newIndex);
    void reorderTodos(reordered);
  };

  const handleCopyShareLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('space', spaceKey);
    await navigator.clipboard.writeText(url.toString());
    setCopiedHint(true);
    setTimeout(() => setCopiedHint(false), 1800);
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(todos, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postittodo-${spaceKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSyncSettings = async () => {
    setSpaceKey(spaceInput);
    setApiUrl(apiInput);
    if (apiInput.trim()) {
      await fetchFromCloud(apiInput.trim().replace(/\/+$/, ''), spaceInput.trim());
    }
    setSyncModalOpen(false);
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <div className="brand-mark">
            <StickyNote size={20} />
          </div>
          <div>
            <h1 className="brand-title">大方無虞 VoiceItTodo</h1>
            <p className="brand-subtitle">大方吾語，大方無虞</p>
          </div>
        </div>

        <div className="top-actions">
          <button
            type="button"
            className={`sync-pill ${byok.config.enabled && !byok.isLocked ? 'is-cloud' : ''}`}
            onClick={() => setByokModalOpen(true)}
            title="設定 AI 金鑰 (Ollama / Groq / Gemini / OpenAI / Claude)"
          >
            {byok.isLocked ? <Lock size={14} /> : <KeyRound size={14} />}
            <span>
              {byok.isLocked
                ? 'AI 已鎖定'
                : byok.config.enabled
                  ? `AI: ${PROVIDER_PRESETS[byok.config.provider].label}`
                  : 'AI 金鑰'}
            </span>
          </button>

          <button
            type="button"
            className={`sync-pill ${syncStatus.mode === 'cloud' ? 'is-cloud' : ''} ${syncStatus.error ? 'has-error' : ''
              }`}
            onClick={() => {
              setSpaceInput(spaceKey);
              setApiInput(apiUrl);
              setSyncModalOpen(true);
            }}
          >
            {syncStatus.mode === 'cloud' ? <Cloud size={15} /> : <HardDrive size={15} />}
            <span>
              {syncStatus.syncing
                ? '同步中...'
                : syncStatus.mode === 'cloud'
                  ? 'Cloudflare D1 已連線'
                  : '本機儲存 (Local-first)'}
            </span>
          </button>
        </div>
      </header>

      <form
        className={`composer-card ${voice.isListening ? 'is-listening' : ''}`}
        onSubmit={handleSubmit}
      >
        <div className="composer-input-row">
          <div
            className="composer-fields"
            onClick={(e) => {
              if (e.target === e.currentTarget && !draftTitle.trim()) {
                titleInputRef.current?.focus();
              }
            }}
          >
            <input
              ref={titleInputRef}
              type="text"
              className="composer-title-input"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    void handleSubmit();
                  } else {
                    e.preventDefault();
                    contextInputRef.current?.focus();
                  }
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  contextInputRef.current?.focus();
                  contextInputRef.current?.setSelectionRange(0, 0);
                } else if (e.key === 'ArrowRight') {
                  const input = e.currentTarget;
                  if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
                    e.preventDefault();
                    contextInputRef.current?.focus();
                    contextInputRef.current?.setSelectionRange(0, 0);
                  }
                }
              }}
            />
            <textarea
              ref={contextInputRef}
              className="composer-context-textarea"
              value={draftContext}
              onChange={(e) => setDraftContext(e.target.value)}
              onMouseDown={(e) => {
                // 輸入框皆為空白時，點選內文自動導向標題輸入
                if (!draftTitle.trim() && !draftContext.trim()) {
                  e.preventDefault();
                  titleInputRef.current?.focus();
                }
              }}
              onFocus={() => {
                if (!draftTitle.trim() && !draftContext.trim()) {
                  titleInputRef.current?.focus();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void handleSubmit();
                } else if (e.key === 'Backspace') {
                  const textarea = e.currentTarget;
                  if (textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
                    e.preventDefault();
                    titleInputRef.current?.focus();
                    const len = titleInputRef.current?.value.length ?? 0;
                    titleInputRef.current?.setSelectionRange(len, len);
                  }
                } else if (e.key === 'ArrowUp') {
                  const textarea = e.currentTarget;
                  const textBeforeCursor = textarea.value.slice(0, textarea.selectionStart);
                  if (!textBeforeCursor.includes('\n')) {
                    e.preventDefault();
                    titleInputRef.current?.focus();
                    const len = titleInputRef.current?.value.length ?? 0;
                    titleInputRef.current?.setSelectionRange(len, len);
                  }
                } else if (e.key === 'ArrowLeft') {
                  const textarea = e.currentTarget;
                  if (textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
                    e.preventDefault();
                    titleInputRef.current?.focus();
                    const len = titleInputRef.current?.value.length ?? 0;
                    titleInputRef.current?.setSelectionRange(len, len);
                  }
                }
              }}
              rows={3}
            />
          </div>

          <button
            type="button"
            className={`voice-btn ${voice.isListening ? 'is-listening' : ''}`}
            disabled={!voice.isSupported}
            onClick={voice.toggle}
            title={
              voice.isSupported
                ? voice.isListening
                  ? '停止語音輸入'
                  : '開始語音輸入 (zh-TW)'
                : '此瀏覽器不支援 Web Speech API'
            }
            aria-label="語音輸入"
          >
            {voice.isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        </div>

        {voice.isListening && (
          <div className="interim-banner">
            <Mic size={14} />
            <span>
              {voice.interimText
                ? `正在聆聽：${voice.interimText}`
                : '正在聆聽語音… 請直接說出待辦與背景脈絡'}
            </span>
          </div>
        )}

        {voice.error && (
          <div className="interim-banner" style={{ marginTop: 8 }}>
            <span>{voice.error}</span>
          </div>
        )}

        <div className="composer-footer">
          <div className="composer-options">
            <IconPickerPopover
              value={selectedIcon}
              onChange={(icon) => {
                setSelectedIcon(icon);
                setHasManualIcon(true);
              }}
              triggerClassName="composer-icon-btn"
              showLabelInTrigger
              triggerLabel={
                hasManualIcon
                  ? `已手動指定圖示：${getNoteIconMeta(selectedIcon).label}`
                  : '選擇便利貼圖示（智慧模式未手動選擇時將自動判斷）'
              }
            />

            <div className="mode-switch" role="group" aria-label="語音與輸入整理模式">
              <button
                type="button"
                className={`mode-switch-btn ${parseMode === 'normal' ? 'is-active' : ''}`}
                onClick={() => setParseMode('normal')}
                title="僅用本機規則純整理，不呼叫 AI、不自動判斷圖示"
              >
                一般整理
              </button>
              <button
                type="button"
                className={`mode-switch-btn ${parseMode === 'smart' ? 'is-active' : ''}`}
                onClick={() => setParseMode('smart')}
                title="AI 自動解析語意、拆卡並挑選適合的圖示"
              >
                <Sparkles size={13} />
                <span>智慧解析</span>
              </button>
            </div>
          </div>

          <div className="composer-submit-group">
            <span className="shortcut-hint">
              {parseMode === 'smart' && !byok.config.enabled
                ? '未設定 AI 金鑰，將自動降級本機整理'
                : 'Enter 換行・Ctrl+Enter 送出'}
            </span>
            <button
              type="submit"
              className="btn-primary"
              disabled={(!draftTitle.trim() && !draftContext.trim()) || isSubmitting}
            >
              <Plus size={16} />
              <span>{isSubmitting ? '解析中...' : '新增便利貼'}</span>
            </button>
          </div>
        </div>
      </form>

      {syncStatus.error && <div className="error-toast">{syncStatus.error}</div>}

      <div className="toolbar">
        <div className="filter-tabs" role="tablist">
          <button
            type="button"
            className={`filter-tab ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 ({todos.length})
          </button>
          <button
            type="button"
            className={`filter-tab ${filter === 'active' ? 'is-active' : ''}`}
            onClick={() => setFilter('active')}
          >
            進行中 ({activeCount})
          </button>
          <button
            type="button"
            className={`filter-tab ${filter === 'completed' ? 'is-active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            已完成 ({todos.length - activeCount})
          </button>
        </div>

        <div className="search-box">
          <Search size={15} color="#8b9098" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋標題、脈絡或逐字稿..."
          />
          {searchQuery && (
            <button
              type="button"
              className="icon-btn"
              style={{ width: 22, height: 22 }}
              onClick={() => setSearchQuery('')}
              aria-label="清除搜尋"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {filteredTodos.length === 0 ? (
        <div className="empty-state">
          <strong>目前沒有符合條件的便利貼</strong>
          <p>按一下右上角麥克風直接口述，系統會自動幫你保留完整脈絡。</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredTodos.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="todo-list">
              {filteredTodos.map((todo) => (
                <SortableNoteCard
                  key={todo.id}
                  todo={todo}
                  onToggle={toggleTodo}
                  onDelete={deleteTodo}
                  onUpdate={updateTodo}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {syncModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setSyncModalOpen(false)}
          role="presentation"
        >
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-modal-title"
          >
            <div className="modal-header">
              <h2 id="sync-modal-title">Headless 同步與資料管理</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSyncModalOpen(false)}
                aria-label="關閉"
              >
                <X size={18} />
              </button>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="space-key-input">
                空間識別碼（Space Key）
              </label>
              <div className="field-row">
                <input
                  id="space-key-input"
                  className="field-input"
                  value={spaceInput}
                  onChange={(e) => setSpaceInput(e.target.value)}
                  placeholder="例如：space_my_notes"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCopyShareLink}
                >
                  <Copy size={14} />
                  <span>{copiedHint ? '已複製' : '複製連結'}</span>
                </button>
              </div>
              <p className="field-help">
                免註冊即可透過 Space Key 隔離資料；在其他裝置開啟同一個連結即可同步。
              </p>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="api-url-input">
                Cloudflare Worker Headless API URL（選填）
              </label>
              <input
                id="api-url-input"
                className="field-input"
                style={{ width: '100%' }}
                value={apiInput}
                onChange={(e) => setApiInput(e.target.value)}
                placeholder="例如：https://postittodo-api.你的帳號.workers.dev"
              />
              <p className="field-help">
                留空時僅使用瀏覽器本機儲存（Local-first）；填入已部署的 Worker 網址即啟用 D1 雲端同步。
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 18,
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleExportJson}
                >
                  <Download size={14} />
                  <span>匯出 JSON</span>
                </button>
                {apiUrl && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void pushAllToCloud()}
                  >
                    <Cloud size={14} />
                    <span>上傳本機資料</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleSaveSyncSettings()}
              >
                套用設定
              </button>
            </div>
          </div>
        </div>
      )}

      <ByokModal
        open={byokModalOpen}
        config={byok.config}
        isLocked={byok.isLocked}
        cryptoError={byok.cryptoError}
        onClose={() => setByokModalOpen(false)}
        onSave={byok.saveConfig}
        onUnlock={byok.unlockWithPassword}
        onLock={byok.lockSession}
        onClearKey={byok.clearApiKey}
      />
    </div>
  );
}

export default App;
