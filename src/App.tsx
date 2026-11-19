import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  BookText,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  GripVertical,
  HardDrive,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { ByokModal } from './components/ByokModal';
import { IconPickerPopover } from './components/IconPickerPopover';
import { IconTemplateModal } from './components/IconTemplateModal';
import { VoiceGlossaryModal } from './components/VoiceGlossaryModal';
import { VoiceSegmentEditor } from './components/VoiceSegmentEditor';
import { useByokConfig } from './hooks/useByokConfig';
import { isSeedTodo, useTodoStore } from './hooks/useTodoStore';
import { useVoiceInput } from './hooks/useVoiceInput';
import type {
  ByokConfig,
  FilterType,
  GlossaryEntry,
  InputParseMode,
  NoteIconId,
  Todo,
  VoiceEditSuggestion,
  VoiceRecognitionResult,
  VoiceSegment,
} from './types';
import {
  editTodoWithVoice,
  proofreadTranscriptWithByok,
  PROVIDER_PRESETS,
} from './utils/byokAi';
import { parseLocalVoiceEdit } from './utils/localVoiceEdit';
import {
  buildFieldSkeleton,
  getIconFieldConfig,
  getNoteIconMeta,
  NOTE_ICON_META,
} from './utils/noteIcons';
import {
  applyGlossary,
  loadGlossary,
  saveGlossary,
  upsertGlossaryEntry,
} from './utils/voiceGlossary';
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
  canReorder?: boolean;
  glossary: GlossaryEntry[];
  byokConfig: ByokConfig;
  byokLocked: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<Todo, 'title' | 'contextNote' | 'icon' | 'tags'>>
  ) => void;
}

function SortableNoteCard({
  todo,
  canReorder = true,
  glossary,
  byokConfig,
  byokLocked,
  onToggle,
  onDelete,
  onUpdate,
}: SortableNoteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editContext, setEditContext] = useState(todo.contextNote);

  // 卡片編輯抽屜欄位麥克風（title / context）與語音指令修改狀態
  const [activeFieldMic, setActiveFieldMic] = useState<'title' | 'context' | null>(null);
  const [voiceEditOpen, setVoiceEditOpen] = useState(false);
  const [voiceInstruction, setVoiceInstruction] = useState('');
  const [voiceEditLoading, setVoiceEditLoading] = useState(false);
  const [voiceEditError, setVoiceEditError] = useState<string | null>(null);
  const [voiceSuggestion, setVoiceSuggestion] = useState<VoiceEditSuggestion | null>(null);

  const glossaryRef = useRef(glossary);
  glossaryRef.current = glossary;
  const activeFieldMicRef = useRef(activeFieldMic);
  activeFieldMicRef.current = activeFieldMic;

  const canUseAi = byokConfig.enabled && !byokLocked;

  const fieldVoice = useVoiceInput({
    lang: 'zh-TW',
    continuous: false,
    maxAlternatives: 5,
    onFinalTranscript: (rawChunk) => {
      const { text: cleanChunk } = applyGlossary(rawChunk, glossaryRef.current);
      const target = activeFieldMicRef.current;
      if (target === 'title') {
        setEditTitle((prev) => (prev.trim() ? `${prev.trimEnd()} ${cleanChunk}` : cleanChunk));
      } else if (target === 'context') {
        setEditContext((prev) => (prev.trim() ? `${prev.trimEnd()} ${cleanChunk}` : cleanChunk));
      }
      setActiveFieldMic(null);
    },
  });

  const commandVoice = useVoiceInput({
    lang: 'zh-TW',
    continuous: false,
    maxAlternatives: 5,
    onFinalTranscript: (rawChunk) => {
      const { text: cleanChunk } = applyGlossary(rawChunk, glossaryRef.current);
      setVoiceInstruction((prev) =>
        prev.trim() ? `${prev.trimEnd()} ${cleanChunk}` : cleanChunk
      );
      setVoiceEditError(null);
    },
  });

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
    // 檢查編輯內容中是否包含 #標籤 並提煉至 tags
    const extractedTags = [...todo.tags];
    const tagMatches = `${editTitle} ${editContext}`.match(/[#＃]([^\s#＃,，.。;；]+)/g);
    if (tagMatches) {
      for (const m of tagMatches) {
        const clean = m.replace(/^[#＃]/, '').trim();
        if (clean && !extractedTags.includes(clean)) {
          extractedTags.push(clean);
        }
      }
    }

    const nextTitle = editTitle.trim();
    if (!nextTitle) return;
    onUpdate(todo.id, {
      title: nextTitle,
      contextNote: editContext.trim(),
      tags: extractedTags,
    });
    setEditing(false);
    if (fieldVoice.isListening) {
      fieldVoice.stop();
    }
    setActiveFieldMic(null);
  };

  const startEditing = () => {
    setEditTitle(todo.title);
    setEditContext(todo.contextNote);
    setExpanded(true);
    setEditing(true);
    setVoiceEditOpen(false);
  };

  const toggleFieldMic = (field: 'title' | 'context') => {
    if (fieldVoice.isListening && activeFieldMic === field) {
      fieldVoice.stop();
      setActiveFieldMic(null);
      return;
    }
    if (fieldVoice.isListening) {
      fieldVoice.stop();
    }
    setActiveFieldMic(field);
    fieldVoice.start();
  };

  const openVoiceEdit = () => {
    const nextOpen = !voiceEditOpen;
    setVoiceEditOpen(nextOpen);
    if (nextOpen) {
      setExpanded(true);
      setEditing(false);
      setVoiceSuggestion(null);
      setVoiceEditError(null);
      if (commandVoice.isSupported && !commandVoice.isListening) {
        commandVoice.start();
      }
    } else if (commandVoice.isListening) {
      commandVoice.stop();
    }
  };

  const handleDirectAppendContext = () => {
    const addition = voiceInstruction.trim();
    if (!addition) return;
    if (commandVoice.isListening) {
      commandVoice.stop();
    }
    const nextContext = todo.contextNote.trim()
      ? `${todo.contextNote.trimEnd()}\n${addition}`
      : addition;
    onUpdate(todo.id, { contextNote: nextContext });
    setVoiceInstruction('');
    setVoiceSuggestion(null);
    setVoiceEditError(null);
    setVoiceEditOpen(false);
  };

  const handleSendToEditForm = () => {
    if (commandVoice.isListening) {
      commandVoice.stop();
    }
    const extra = voiceInstruction.trim();
    setEditTitle(todo.title);
    setEditContext(
      extra
        ? todo.contextNote.trim()
          ? `${todo.contextNote.trimEnd()}\n${extra}`
          : extra
        : todo.contextNote
    );
    setExpanded(true);
    setEditing(true);
    setVoiceEditOpen(false);
    setVoiceSuggestion(null);
    setVoiceEditError(null);
    setVoiceInstruction('');
  };

  const handleRunVoiceEdit = async () => {
    const instruction = voiceInstruction.trim();
    if (!instruction || voiceEditLoading) return;
    if (commandVoice.isListening) {
      commandVoice.stop();
    }

    if (!canUseAi) {
      // 未設定或鎖定 AI 金鑰時，先以本機規則嘗試解析語音修改指令
      const localRes = parseLocalVoiceEdit(todo, instruction);
      if (localRes.matched) {
        setVoiceEditError(null);
        setVoiceSuggestion(localRes.suggestion);
      } else if (localRes.reason) {
        setVoiceSuggestion(null);
        setVoiceEditError(localRes.reason);
      } else {
        setVoiceEditError(null);
        setVoiceSuggestion({
          title: todo.title,
          contextNote: todo.contextNote.trim()
            ? `${todo.contextNote.trimEnd()}\n${instruction}`
            : instruction,
          tags: todo.tags,
          icon: todo.icon,
          summary: '語音補充預覽（可直接微調標題或脈絡後再套用）',
        });
      }
      return;
    }

    setVoiceEditLoading(true);
    setVoiceEditError(null);
    setVoiceSuggestion(null);
    try {
      const suggestion = await editTodoWithVoice(todo, instruction, byokConfig);
      setVoiceSuggestion(suggestion);
    } catch (err) {
      setVoiceEditError(
        err instanceof Error ? err.message : 'AI 語音修改失敗，請稍後再試或改用手動編輯'
      );
    } finally {
      setVoiceEditLoading(false);
    }
  };

  const handleApplyVoiceSuggestion = () => {
    if (!voiceSuggestion) return;
    const nextTitle = voiceSuggestion.title.trim();
    if (!nextTitle) return;

    const nextContext = voiceSuggestion.contextNote.trim();
    // 檢查預覽微調後的內容中是否包含 #標籤 並合併去重至 tags
    const mergedTags = [...voiceSuggestion.tags];
    const tagMatches = `${nextTitle} ${nextContext}`.match(/[#＃]([^\s#＃,，.。;；]+)/g);
    if (tagMatches) {
      for (const m of tagMatches) {
        const clean = m.replace(/^[#＃]/, '').trim();
        if (clean && !mergedTags.includes(clean)) {
          mergedTags.push(clean);
        }
      }
    }

    onUpdate(todo.id, {
      title: nextTitle,
      contextNote: nextContext,
      tags: mergedTags,
      icon: voiceSuggestion.icon,
    });
    setVoiceSuggestion(null);
    setVoiceEditError(null);
    setVoiceInstruction('');
    setVoiceEditOpen(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`note-card ${todo.completed ? 'is-completed' : ''} ${isDragging ? 'is-dragging' : ''
        } ${iconPickerOpen ? 'is-picker-open' : ''}`}
    >
      <div className="note-main">
        {canReorder ? (
          <button
            type="button"
            className="drag-handle"
            aria-label="拖曳調整順序"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        ) : (
          <div className="drag-handle is-disabled" title="清除搜尋並切換至全部時可拖曳排序">
            <GripVertical size={16} />
          </div>
        )}

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
            className={`icon-btn ${voiceEditOpen ? 'is-voice-active' : ''}`}
            aria-label="用語音修改待辦"
            title={
              canUseAi
                ? '用語音指令修改此待辦（AI 解析差異預覽）'
                : '用語音修改或補充此待辦（支援「把 A 改成 B」或補充脈絡）'
            }
            onClick={openVoiceEdit}
            disabled={!commandVoice.isSupported}
          >
            <Mic size={15} />
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
          {voiceEditOpen && (
            <div className="card-voice-edit-panel">
              <div className="card-voice-edit-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mic size={14} />
                  <span>
                    {canUseAi
                      ? '語音指令修改（例如：「把禮拜三改成禮拜五，順便備註帶發票」）'
                      : '語音修改／補充（可說「把 A 改成 B」、「刪掉 A」，或直接補充脈絡）'}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 22, height: 22 }}
                  onClick={() => {
                    if (commandVoice.isListening) commandVoice.stop();
                    setVoiceEditOpen(false);
                  }}
                  aria-label="關閉語音修改"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="card-voice-input-row">
                <input
                  type="text"
                  className="drawer-input"
                  value={voiceInstruction}
                  onChange={(e) => setVoiceInstruction(e.target.value)}
                  placeholder={
                    commandVoice.isListening
                      ? commandVoice.interimText || '正在聆聽修改指令...'
                      : '說出或輸入想修改的內容...'
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleRunVoiceEdit();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`voice-mini-mic ${commandVoice.isListening ? 'is-listening' : ''}`}
                  onClick={commandVoice.toggle}
                  title={commandVoice.isListening ? '停止錄音' : '開始口述指令'}
                  aria-label="口述修改指令"
                >
                  {commandVoice.isListening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              </div>

              <div className="card-voice-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                  disabled={voiceEditLoading}
                  onClick={handleSendToEditForm}
                  title="開啟編輯表單手動修改標題、脈絡或圖示"
                >
                  <Pencil size={13} />
                  <span>帶入編輯框</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                  disabled={!voiceInstruction.trim() || voiceEditLoading}
                  onClick={handleDirectAppendContext}
                  title="不經解析，直接附加至脈絡備註"
                >
                  <Plus size={14} />
                  <span>直接附加</span>
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  disabled={!voiceInstruction.trim() || voiceEditLoading}
                  onClick={() => void handleRunVoiceEdit()}
                >
                  <Wand2 size={14} />
                  <span>
                    {voiceEditLoading
                      ? '解析中...'
                      : canUseAi
                        ? 'AI 預覽修改'
                        : '預覽修改'}
                  </span>
                </button>
              </div>

              {voiceEditError && (
                <div className="voice-edit-error">{voiceEditError}</div>
              )}

              {voiceSuggestion && (
                <div className="voice-diff-preview">
                  <div className="voice-diff-summary">
                    <Sparkles size={13} />
                    <span>{voiceSuggestion.summary}</span>
                  </div>
                  <div className="voice-diff-grid">
                    <div className="voice-diff-edit-field">
                      <div className="voice-diff-field-head">
                        <span className="voice-diff-label">標題</span>
                        {voiceSuggestion.title !== todo.title && (
                          <span className="voice-diff-old">原：{todo.title}</span>
                        )}
                      </div>
                      <input
                        type="text"
                        className="drawer-input"
                        value={voiceSuggestion.title}
                        onChange={(e) =>
                          setVoiceSuggestion((prev) =>
                            prev ? { ...prev, title: e.target.value } : prev
                          )
                        }
                        placeholder="待辦標題不可空白"
                      />
                    </div>
                    <div className="voice-diff-edit-field">
                      <div className="voice-diff-field-head">
                        <span className="voice-diff-label">脈絡</span>
                        {voiceSuggestion.contextNote !== todo.contextNote && (
                          <span className="voice-diff-old">
                            原：{todo.contextNote || '（空白）'}
                          </span>
                        )}
                      </div>
                      <textarea
                        className="drawer-textarea voice-diff-textarea"
                        rows={2}
                        value={voiceSuggestion.contextNote}
                        onChange={(e) =>
                          setVoiceSuggestion((prev) =>
                            prev ? { ...prev, contextNote: e.target.value } : prev
                          )
                        }
                        placeholder="補充原因、對象、型號或期限..."
                      />
                    </div>
                    {voiceSuggestion.tags.join(',') !== todo.tags.join(',') && (
                      <div className="voice-diff-row">
                        <span className="voice-diff-label">標籤</span>
                        <span className="voice-diff-old">
                          {todo.tags.join('、') || '（無）'}
                        </span>
                        <span className="voice-diff-arrow">→</span>
                        <span className="voice-diff-new">
                          {voiceSuggestion.tags.join('、') || '（無）'}
                        </span>
                      </div>
                    )}
                    {voiceSuggestion.icon && voiceSuggestion.icon !== todo.icon && (
                      <div className="voice-diff-row">
                        <span className="voice-diff-label">圖示</span>
                        <span className="voice-diff-old">
                          {getNoteIconMeta(todo.icon).label}
                        </span>
                        <span className="voice-diff-arrow">→</span>
                        <span className="voice-diff-new">
                          {getNoteIconMeta(voiceSuggestion.icon).label}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="voice-diff-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setVoiceSuggestion(null)}
                    >
                      捨棄
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!voiceSuggestion.title.trim()}
                      onClick={handleApplyVoiceSuggestion}
                    >
                      <Check size={14} />
                      <span>套用變更</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {editing ? (
            <div className="drawer-edit-form">
              <div>
                <div className="drawer-label-row">
                  <div className="drawer-section-label">標題</div>
                  {fieldVoice.isSupported && (
                    <button
                      type="button"
                      className={`drawer-field-mic ${
                        fieldVoice.isListening && activeFieldMic === 'title'
                          ? 'is-listening'
                          : ''
                      }`}
                      onClick={() => toggleFieldMic('title')}
                      title="用語音追加標題文字"
                    >
                      {fieldVoice.isListening && activeFieldMic === 'title' ? (
                        <MicOff size={12} />
                      ) : (
                        <Mic size={12} />
                      )}
                      <span>
                        {fieldVoice.isListening && activeFieldMic === 'title'
                          ? '聆聽中...'
                          : '語音追加'}
                      </span>
                    </button>
                  )}
                </div>
                <input
                  className="drawer-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="簡短行動標題"
                />
              </div>
              <div>
                <div className="drawer-label-row">
                  <div className="drawer-section-label">
                    脈絡備註（避免過幾天忘記在記什麼）
                  </div>
                  {fieldVoice.isSupported && (
                    <button
                      type="button"
                      className={`drawer-field-mic ${
                        fieldVoice.isListening && activeFieldMic === 'context'
                          ? 'is-listening'
                          : ''
                      }`}
                      onClick={() => toggleFieldMic('context')}
                      title="用語音追加脈絡備註"
                    >
                      {fieldVoice.isListening && activeFieldMic === 'context' ? (
                        <MicOff size={12} />
                      ) : (
                        <Mic size={12} />
                      )}
                      <span>
                        {fieldVoice.isListening && activeFieldMic === 'context'
                          ? '聆聽中...'
                          : '語音追加'}
                      </span>
                    </button>
                  )}
                </div>
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
                    onClick={() => {
                      if (fieldVoice.isListening) fieldVoice.stop();
                      setActiveFieldMic(null);
                      setEditing(false);
                    }}
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
    user,
    authLoading,
    syncStatus,
    loginWithGoogle,
    logout,
    fetchFromCloud,
    pushAllToCloud,
    addTodo,
    updateTodo,
    toggleTodo,
    deleteTodo,
    restoreTodo,
    reorderTodos,
    loadSeedTodos,
    clearSeedTodos,
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

  // 即時擷取輸入框中的 #標籤 以進行視覺渲染
  const liveDraftHashtags = useMemo(() => {
    const combined = `${draftTitle} ${draftContext}`;
    const matches = combined.match(/[#＃]([^\s#＃,，.。;；]+)/g);
    if (!matches) return [];
    const unique = new Set<string>();
    for (const m of matches) {
      const clean = m.replace(/^[#＃]/, '').trim();
      if (clean) unique.add(clean);
    }
    return Array.from(unique);
  }, [draftTitle, draftContext]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [byokModalOpen, setByokModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [, setTemplateUpdateTick] = useState(0);
  const lastAutoSkeletonRef = useRef<string>('');
  const [templatePrompt, setTemplatePrompt] = useState<{
    icon: NoteIconId;
    label: string;
    skeleton: string;
  } | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [recentlyDeleted, setRecentlyDeleted] = useState<Todo | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);

  // 語音編輯模式：個人詞庫、草稿分段、單段重錄、語音控制指令與 AI 校對
  const [glossary, setGlossary] = useState<GlossaryEntry[]>(loadGlossary);
  const [glossaryModalOpen, setGlossaryModalOpen] = useState(false);
  const [voiceSegments, setVoiceSegments] = useState<VoiceSegment[]>([]);
  const [segmentUndoStack, setSegmentUndoStack] = useState<
    Array<{ title: string; context: string; segments: VoiceSegment[] }>
  >([]);
  const [rerecordingSegmentId, setRerecordingSegmentId] = useState<string | null>(null);
  const [voiceCommandsEnabled, setVoiceCommandsEnabled] = useState(true);
  const [commandUndoNotice, setCommandUndoNotice] = useState<{
    label: string;
    snapshot: { title: string; context: string; segments: VoiceSegment[] };
  } | null>(null);
  const commandUndoTimerRef = useRef<number | null>(null);
  const [isProofreading, setIsProofreading] = useState(false);
  const [proofreadBackup, setProofreadBackup] = useState<{
    title: string;
    context: string;
  } | null>(null);

  const byok = useByokConfig();

  const glossaryRef = useRef(glossary);
  glossaryRef.current = glossary;
  const draftTitleRef = useRef(draftTitle);
  draftTitleRef.current = draftTitle;
  const draftContextRef = useRef(draftContext);
  draftContextRef.current = draftContext;
  const voiceSegmentsRef = useRef(voiceSegments);
  voiceSegmentsRef.current = voiceSegments;
  const voiceCommandsEnabledRef = useRef(voiceCommandsEnabled);
  voiceCommandsEnabledRef.current = voiceCommandsEnabled;
  const rerecordingIdRef = useRef(rerecordingSegmentId);
  rerecordingIdRef.current = rerecordingSegmentId;

  const updateGlossary = (next: GlossaryEntry[]) => {
    setGlossary(next);
    saveGlossary(next);
  };

  const handleLearnGlossary = (wrong: string, correct: string) => {
    const next = upsertGlossaryEntry(glossaryRef.current, wrong, correct);
    updateGlossary(next);
  };

  const rebuildDraftFromSegments = (nextSegments: VoiceSegment[]) => {
    const titleParts = nextSegments
      .filter((s) => s.target === 'title')
      .map((s) => s.text.trim())
      .filter(Boolean);
    const contextParts = nextSegments
      .filter((s) => s.target === 'context')
      .map((s) => s.text.trim())
      .filter(Boolean);
    setDraftTitle(titleParts.join(' '));
    setDraftContext(contextParts.join(' '));
  };

  const pushUndoSnapshot = () => {
    const snapshot = {
      title: draftTitleRef.current,
      context: draftContextRef.current,
      segments: voiceSegmentsRef.current,
    };
    setSegmentUndoStack((prev) => [...prev.slice(-9), snapshot]);
    return snapshot;
  };

  const showCommandUndoBanner = (
    label: string,
    snapshot: { title: string; context: string; segments: VoiceSegment[] }
  ) => {
    setCommandUndoNotice({ label, snapshot });
    if (commandUndoTimerRef.current) {
      window.clearTimeout(commandUndoTimerRef.current);
    }
    commandUndoTimerRef.current = window.setTimeout(() => {
      setCommandUndoNotice(null);
    }, 4500);
  };

  const voice = useVoiceInput({
    lang: 'zh-TW',
    continuous: true,
    maxAlternatives: 5,
    onFinalResult: (result: VoiceRecognitionResult) => {
      const normalizedCmd = result.text.replace(/[\s,，.。!！?？]/g, '');

      if (voiceCommandsEnabledRef.current) {
        if (['刪掉上一句', '刪除上一句', '撤銷上一句'].includes(normalizedCmd)) {
          const current = voiceSegmentsRef.current;
          if (current.length > 0) {
            const snap = pushUndoSnapshot();
            const nextSegments = current.slice(0, -1);
            setVoiceSegments(nextSegments);
            rebuildDraftFromSegments(nextSegments);
            showCommandUndoBanner('已依語音指令刪除上一句', snap);
          }
          return;
        }
        if (['全部重來', '清空全部', '清除全部'].includes(normalizedCmd)) {
          if (
            draftTitleRef.current.trim() ||
            draftContextRef.current.trim() ||
            voiceSegmentsRef.current.length > 0
          ) {
            const snap = pushUndoSnapshot();
            setVoiceSegments([]);
            setDraftTitle('');
            setDraftContext('');
            setProofreadBackup(null);
            showCommandUndoBanner('已依語音指令清空草稿', snap);
          }
          return;
        }
        if (['停止錄音', '結束錄音'].includes(normalizedCmd)) {
          voice.stop();
          return;
        }
      }

      pushUndoSnapshot();
      setUsedVoiceInDraft(true);
      setProofreadBackup(null);

      const { text: cleanText, replacements } = applyGlossary(
        result.text,
        glossaryRef.current
      );
      const target: 'title' | 'context' = !draftTitleRef.current.trim()
        ? 'title'
        : 'context';

      const newSegment: VoiceSegment = {
        id: crypto.randomUUID(),
        target,
        text: cleanText,
        rawText: result.text,
        alternatives: result.alternatives,
        replacements,
      };

      const nextSegments = [...voiceSegmentsRef.current, newSegment];
      setVoiceSegments(nextSegments);

      if (target === 'title') {
        setDraftTitle(cleanText);
      } else {
        setDraftContext((prev) => (prev.trim() ? `${prev.trimEnd()} ${cleanText}` : cleanText));
      }
    },
  });

  const rerecordVoice = useVoiceInput({
    lang: 'zh-TW',
    continuous: false,
    maxAlternatives: 5,
    onFinalResult: (result: VoiceRecognitionResult) => {
      const targetId = rerecordingIdRef.current;
      setRerecordingSegmentId(null);
      if (!targetId) return;

      pushUndoSnapshot();
      const { text: cleanText, replacements } = applyGlossary(
        result.text,
        glossaryRef.current
      );
      const nextSegments = voiceSegmentsRef.current.map((seg) =>
        seg.id === targetId
          ? {
              ...seg,
              text: cleanText,
              rawText: result.text,
              alternatives: result.alternatives,
              replacements,
            }
          : seg
      );
      setVoiceSegments(nextSegments);
      rebuildDraftFromSegments(nextSegments);
      setProofreadBackup(null);
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

  const hasSeedTodos = useMemo(() => todos.some(isSeedTodo), [todos]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const rawInput = [draftTitle.trim(), draftContext.trim()].filter(Boolean).join('\n');
    if (!rawInput || isSubmitting) return;
    if (voice.isListening) {
      voice.stop();
    }
    setIsSubmitting(true);
    try {
      const res = await addTodo(rawInput, {
        icon: selectedIcon,
        mode: parseMode,
        respectManualIcon: hasManualIcon,
        isVoice: usedVoiceInDraft,
        byokConfig: byok.config,
      });
      if (res.ok) {
        setDraftTitle('');
        setDraftContext('');
        setVoiceSegments([]);
        setSegmentUndoStack([]);
        setProofreadBackup(null);
        setCommandUndoNotice(null);
        lastAutoSkeletonRef.current = '';
        setTemplatePrompt(null);
        setUsedVoiceInDraft(false);
        setSelectedIcon('sticky-note');
        setHasManualIcon(false);
        if (res.fallbackNotice) {
          setAiNotice(res.fallbackNotice);
        } else {
          setAiNotice(null);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectAlternative = (segmentId: string, nextRawText: string) => {
    pushUndoSnapshot();
    const { text: cleanText, replacements } = applyGlossary(nextRawText, glossary);
    const nextSegments = voiceSegments.map((seg) =>
      seg.id === segmentId
        ? { ...seg, text: cleanText, rawText: nextRawText, replacements }
        : seg
    );
    setVoiceSegments(nextSegments);
    rebuildDraftFromSegments(nextSegments);
    setProofreadBackup(null);
  };

  const handleEditSegmentText = (segmentId: string, nextText: string) => {
    pushUndoSnapshot();
    const nextSegments = voiceSegments.map((seg) =>
      seg.id === segmentId ? { ...seg, text: nextText, replacements: [] } : seg
    );
    setVoiceSegments(nextSegments);
    rebuildDraftFromSegments(nextSegments);
    setProofreadBackup(null);
  };

  const handleRevertSegmentGlossary = (segmentId: string) => {
    pushUndoSnapshot();
    const nextSegments = voiceSegments.map((seg) =>
      seg.id === segmentId ? { ...seg, text: seg.rawText, replacements: [] } : seg
    );
    setVoiceSegments(nextSegments);
    rebuildDraftFromSegments(nextSegments);
  };

  const handleRerecordSegment = (segmentId: string) => {
    if (rerecordVoice.isListening && rerecordingSegmentId === segmentId) {
      rerecordVoice.stop();
      setRerecordingSegmentId(null);
      return;
    }
    if (voice.isListening) {
      voice.stop();
    }
    if (rerecordVoice.isListening) {
      rerecordVoice.stop();
    }
    setRerecordingSegmentId(segmentId);
    rerecordVoice.start();
  };

  const handleDeleteSegment = (segmentId: string) => {
    pushUndoSnapshot();
    const nextSegments = voiceSegments.filter((seg) => seg.id !== segmentId);
    setVoiceSegments(nextSegments);
    rebuildDraftFromSegments(nextSegments);
    setProofreadBackup(null);
  };

  const handleUndoSegment = () => {
    const last = segmentUndoStack[segmentUndoStack.length - 1];
    if (!last) return;
    setSegmentUndoStack((prev) => prev.slice(0, -1));
    setVoiceSegments(last.segments);
    setDraftTitle(last.title);
    setDraftContext(last.context);
    setProofreadBackup(null);
  };

  const handleApplyCommandUndo = () => {
    if (!commandUndoNotice) return;
    const { snapshot } = commandUndoNotice;
    setVoiceSegments(snapshot.segments);
    setDraftTitle(snapshot.title);
    setDraftContext(snapshot.context);
    setCommandUndoNotice(null);
    if (commandUndoTimerRef.current) {
      window.clearTimeout(commandUndoTimerRef.current);
    }
  };

  const handleProofreadDraft = async () => {
    if (isProofreading || !byok.config.enabled || byok.isLocked) return;
    if (!draftTitle.trim() && !draftContext.trim()) return;
    setIsProofreading(true);
    setAiNotice(null);
    try {
      const backup = { title: draftTitle, context: draftContext };
      const corrected = await proofreadTranscriptWithByok(
        { title: draftTitle, contextNote: draftContext },
        byok.config
      );
      setProofreadBackup(backup);
      setDraftTitle(corrected.title);
      setDraftContext(corrected.contextNote);
    } catch (err) {
      setAiNotice(
        err instanceof Error ? err.message : 'AI 錯字校對失敗，請檢查金鑰設定或稍後再試。'
      );
    } finally {
      setIsProofreading(false);
    }
  };

  const handleRevertProofread = () => {
    if (!proofreadBackup) return;
    setDraftTitle(proofreadBackup.title);
    setDraftContext(proofreadBackup.context);
    setProofreadBackup(null);
  };

  const handleDelete = (id: string) => {
    const target = todos.find((t) => t.id === id);
    if (target) {
      setRecentlyDeleted(target);
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
      undoTimeoutRef.current = window.setTimeout(() => {
        setRecentlyDeleted(null);
      }, 5000);
    }
    deleteTodo(id);
  };

  const handleUndoDelete = () => {
    if (recentlyDeleted) {
      void restoreTodo(recentlyDeleted);
      setRecentlyDeleted(null);
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    }
  };

  const isReorderEnabled = filter === 'all' && !searchQuery.trim();

  const handleDragEnd = (event: DragEndEvent) => {
    if (!isReorderEnabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = todos.findIndex((t) => t.id === active.id);
    const newIndex = todos.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(todos, oldIndex, newIndex);
    void reorderTodos(reordered);
  };

  const syncDraftContextWithIcon = (icon: NoteIconId) => {
    const config = getIconFieldConfig(icon);
    const hasTemplate = config.enabled && config.fields.length > 0;
    const nextSkeleton = hasTemplate ? buildFieldSkeleton(config.fields) : '';

    // 僅在備註欄空白，或仍為上一個尚未編輯的自動範本時，才直接替換或清空
    const isUntouched =
      !draftContext.trim() || draftContext === lastAutoSkeletonRef.current;

    if (isUntouched) {
      setDraftContext(nextSkeleton);
      lastAutoSkeletonRef.current = nextSkeleton;
      setTemplatePrompt(null);
    } else if (hasTemplate && draftContext !== nextSkeleton) {
      setTemplatePrompt({
        icon,
        label: getNoteIconMeta(icon).label,
        skeleton: nextSkeleton,
      });
    } else {
      setTemplatePrompt(null);
    }
  };

  const handleSelectIcon = (icon: NoteIconId) => {
    setSelectedIcon(icon);
    setHasManualIcon(true);
    syncDraftContextWithIcon(icon);
  };

  const handleAppendTemplate = () => {
    if (!templatePrompt) return;
    setDraftContext((prev) =>
      prev.trim()
        ? `${prev.trimEnd()}\n${templatePrompt.skeleton}`
        : templatePrompt.skeleton
    );
    lastAutoSkeletonRef.current = '';
    setTemplatePrompt(null);
    contextInputRef.current?.focus();
  };

  const handleReplaceTemplate = () => {
    if (!templatePrompt) return;
    setDraftContext(templatePrompt.skeleton);
    lastAutoSkeletonRef.current = templatePrompt.skeleton;
    setTemplatePrompt(null);
    contextInputRef.current?.focus();
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(todos, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voiceittodo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!syncModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSyncModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [syncModalOpen]);

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <div className="brand-mark">
            <img src="/favicon.svg" alt="大方無虞 VoiceItTodo" className="brand-logo-img" />
          </div>
          <div>
            <h1 className="brand-title">大方無虞 VoiceItTodo</h1>
            <p className="brand-subtitle">大方吾語，大方無虞</p>
          </div>
        </div>

        <div className="top-actions">
          <button
            type="button"
            className="sync-pill"
            onClick={() => setGlossaryModalOpen(true)}
            title="管理語音錯字自動替換詞庫"
          >
            <BookText size={14} />
            <span>
              語音詞庫
              {glossary.filter((e) => e.enabled).length > 0
                ? ` (${glossary.filter((e) => e.enabled).length})`
                : ''}
            </span>
          </button>

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
            onClick={() => setSyncModalOpen(true)}
          >
            {syncStatus.mode === 'cloud' ? <Cloud size={15} /> : <HardDrive size={15} />}
            <span>
              {authLoading
                ? '檢查登入...'
                : syncStatus.syncing
                  ? '同步中...'
                  : user
                    ? `${user.name} · 雲端同步`
                    : '本機儲存 · 登入同步'}
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
              placeholder="想記下什麼待辦？（或點擊右側麥克風直接口述）"
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
              placeholder="補充原因、對象、型號或期限，避免過幾天忘記..."
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

            {liveDraftHashtags.length > 0 && (
              <div className="composer-hashtag-preview">
                {liveDraftHashtags.map((tag) => (
                  <span key={tag} className="tag-pill composer-hashtag-pill">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
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

        {(voice.isListening || rerecordVoice.isListening) && (
          <div className="interim-banner">
            <Mic size={14} />
            <span>
              {rerecordVoice.isListening
                ? rerecordVoice.interimText
                  ? `重錄這一段：${rerecordVoice.interimText}`
                  : '正在重錄這一段… 請說出正確內容'
                : voice.interimText
                  ? `正在聆聽：${voice.interimText}`
                  : '正在聆聽語音… 請直接說出待辦與背景脈絡'}
            </span>
          </div>
        )}

        {(voice.error || rerecordVoice.error) && (
          <div className="interim-banner" style={{ marginTop: 8 }}>
            <span>{voice.error || rerecordVoice.error}</span>
          </div>
        )}

        {commandUndoNotice && (
          <div
            className="interim-banner"
            style={{ marginTop: 8, justifyContent: 'space-between' }}
            role="status"
          >
            <span>{commandUndoNotice.label}</span>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.78rem', padding: '3px 8px' }}
              onClick={handleApplyCommandUndo}
            >
              <RotateCcw size={12} />
              <span>復原</span>
            </button>
          </div>
        )}

        <VoiceSegmentEditor
          segments={voiceSegments}
          rerecordingSegmentId={rerecordingSegmentId}
          voiceCommandsEnabled={voiceCommandsEnabled}
          onToggleVoiceCommands={setVoiceCommandsEnabled}
          onSelectAlternative={handleSelectAlternative}
          onEditSegmentText={handleEditSegmentText}
          onRevertGlossary={handleRevertSegmentGlossary}
          onLearnGlossary={handleLearnGlossary}
          onRerecordSegment={handleRerecordSegment}
          onDeleteSegment={handleDeleteSegment}
          onUndoLastSegment={handleUndoSegment}
          canUndo={segmentUndoStack.length > 0}
        />

        {templatePrompt && (
          <div
            className="interim-banner"
            style={{
              marginTop: 8,
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
            role="status"
          >
            <span style={{ fontSize: '0.84rem' }}>
              已切換至「<strong>{templatePrompt.label}</strong>」，是否套用欄位範本？
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.78rem', padding: '3px 8px' }}
                onClick={handleAppendTemplate}
              >
                附加於後方
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.78rem', padding: '3px 8px' }}
                onClick={handleReplaceTemplate}
              >
                覆蓋原內容
              </button>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 22, height: 22 }}
                onClick={() => setTemplatePrompt(null)}
                aria-label="忽略提示"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        <div className="composer-footer">
          <div className="composer-options">
            <IconPickerPopover
              value={selectedIcon}
              onChange={handleSelectIcon}
              onOpenTemplateModal={() => setTemplateModalOpen(true)}
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
            {proofreadBackup ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleRevertProofread}
                title="還原至 AI 校對前的內容"
              >
                <RotateCcw size={14} />
                <span>還原校對前</span>
              </button>
            ) : (
              byok.config.enabled &&
              !byok.isLocked &&
              (draftTitle.trim() || draftContext.trim()) && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleProofreadDraft()}
                  disabled={isProofreading}
                  title="只修正台灣中文同音錯字與標點，不拆分卡片"
                >
                  <Wand2 size={14} />
                  <span>{isProofreading ? '校對中...' : 'AI 錯字校對'}</span>
                </button>
              )
            )}
            <span className="shortcut-hint">
              {parseMode === 'smart' && !byok.config.enabled
                ? '未設定 AI 金鑰，將自動降級本機整理'
                : 'Enter 填寫脈絡・Ctrl+Enter 送出'}
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

      {aiNotice && (
        <div className="notice-banner">
          <span>{aiNotice}</span>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 22, height: 22 }}
            onClick={() => setAiNotice(null)}
            aria-label="關閉提示"
          >
            <X size={13} />
          </button>
        </div>
      )}

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

      {hasSeedTodos && (
        <div className="seed-banner" role="status">
          <div className="seed-banner-text">
            <Sparkles size={14} />
            <span>目前包含功能教學範例，點擊展開、更換圖示或拖曳排序體驗。</span>
          </div>
          <button
            type="button"
            className="seed-banner-clear"
            onClick={clearSeedTodos}
          >
            清除教學範例
          </button>
        </div>
      )}

      {filteredTodos.length === 0 ? (
        <div className="empty-state">
          <strong>
            {todos.length === 0 ? '目前還沒有待辦便利貼' : '目前沒有符合條件的便利貼'}
          </strong>
          <p>按一下輸入框右側麥克風直接口述，系統會自動幫你保留完整脈絡。</p>
          {todos.length === 0 && (
            <button
              type="button"
              className="empty-seed-btn"
              onClick={loadSeedTodos}
            >
              <Sparkles size={14} />
              載入教學範例
            </button>
          )}
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
                  canReorder={isReorderEnabled}
                  glossary={glossary}
                  byokConfig={byok.config}
                  byokLocked={byok.isLocked}
                  onToggle={toggleTodo}
                  onDelete={handleDelete}
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
              <h2 id="sync-modal-title">雲端同步與資料備份</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSyncModalOpen(false)}
                aria-label="關閉"
              >
                <X size={18} />
              </button>
            </div>

            {user ? (
              <div className="field-group">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.7)',
                    border: '1px solid var(--border-soft, rgba(0, 0, 0, 0.08))',
                  }}
                >
                  {user.avatarUrl && (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.72, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {user.email}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void logout()}
                  >
                    <LogOut size={14} />
                    <span>登出</span>
                  </button>
                </div>

                {syncStatus.error ? (
                  <p className="field-help" style={{ color: 'var(--vermilion)', marginTop: 10 }}>
                    {syncStatus.error}
                  </p>
                ) : (
                  <p className="field-help" style={{ marginTop: 10 }}>
                    已啟用 Google 帳號雲端同步，所有新增與編輯會自動備份到 Cloudflare D1，跨裝置登入即可同步。
                  </p>
                )}
              </div>
            ) : (
              <div className="field-group">
                <p className="field-help" style={{ marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>
                  目前為<strong>本機儲存模式</strong>，所有資料皆存在此瀏覽器中，免登入即可使用。
                  登入 Google 帳號後，系統會自動把你目前的待辦合併到雲端，方便在手機與電腦之間同步。
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
                  onClick={loginWithGoogle}
                >
                  <LogIn size={16} />
                  <span>使用 Google 帳號登入並同步</span>
                </button>
              </div>
            )}

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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleExportJson}
                >
                  <Download size={14} />
                  <span>匯出 JSON</span>
                </button>
                {user && (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void fetchFromCloud()}
                    >
                      <RefreshCw size={14} />
                      <span>從雲端更新</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void pushAllToCloud()}
                    >
                      <Cloud size={14} />
                      <span>上傳本機資料</span>
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSyncModalOpen(false)}
              >
                關閉
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

      <IconTemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onTemplatesUpdated={() => {
          setTemplateUpdateTick((t) => t + 1);
          if (
            hasManualIcon ||
            (lastAutoSkeletonRef.current !== '' &&
              draftContext === lastAutoSkeletonRef.current)
          ) {
            syncDraftContextWithIcon(selectedIcon);
          }
        }}
      />

      <VoiceGlossaryModal
        open={glossaryModalOpen}
        entries={glossary}
        onChange={updateGlossary}
        onClose={() => setGlossaryModalOpen(false)}
      />

      {recentlyDeleted && (
        <aside className="toast-undo" role="status" aria-live="polite">
          <div className="toast-undo-content">
            <span>已刪除便利貼：「{recentlyDeleted.title}」</span>
            <button
              type="button"
              className="toast-undo-btn"
              onClick={handleUndoDelete}
            >
              復原
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 20, height: 20 }}
            onClick={() => setRecentlyDeleted(null)}
            aria-label="關閉"
          >
            <X size={12} />
          </button>
        </aside>
      )}
    </div>
  );
}

export default App;
