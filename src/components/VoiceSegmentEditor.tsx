import { useState } from 'react';
import {
  BookPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { VoiceSegment } from '../types';

interface VoiceSegmentEditorProps {
  segments: VoiceSegment[];
  rerecordingSegmentId: string | null;
  voiceCommandsEnabled: boolean;
  onToggleVoiceCommands: (enabled: boolean) => void;
  onSelectAlternative: (segmentId: string, nextText: string) => void;
  onEditSegmentText: (segmentId: string, nextText: string) => void;
  onRevertGlossary: (segmentId: string) => void;
  onLearnGlossary: (wrong: string, correct: string) => void;
  onRerecordSegment: (segmentId: string) => void;
  onDeleteSegment: (segmentId: string) => void;
  onUndoLastSegment: () => void;
  canUndo: boolean;
}

export function VoiceSegmentEditor({
  segments,
  rerecordingSegmentId,
  voiceCommandsEnabled,
  onToggleVoiceCommands,
  onSelectAlternative,
  onEditSegmentText,
  onRevertGlossary,
  onLearnGlossary,
  onRerecordSegment,
  onDeleteSegment,
  onUndoLastSegment,
  canUndo,
}: VoiceSegmentEditorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState('');
  const [learnedFeedback, setLearnedFeedback] = useState<string | null>(null);

  if (segments.length === 0) return null;

  const activeSegment = segments.find((s) => s.id === activeId) ?? null;

  const openInspector = (segment: VoiceSegment) => {
    if (activeId === segment.id) {
      setActiveId(null);
      return;
    }
    setActiveId(segment.id);
    setInlineDraft(segment.text);
    setLearnedFeedback(null);
  };

  const handleSaveInline = () => {
    if (!activeSegment) return;
    const trimmed = inlineDraft.trim();
    if (!trimmed) return;
    onEditSegmentText(activeSegment.id, trimmed);
  };

  const handleLearn = () => {
    if (!activeSegment) return;
    const trimmed = inlineDraft.trim();
    if (!trimmed || trimmed === activeSegment.rawText) return;
    onEditSegmentText(activeSegment.id, trimmed);
    onLearnGlossary(activeSegment.rawText, trimmed);
    setLearnedFeedback(`已加入詞庫：${activeSegment.rawText} → ${trimmed}`);
  };

  return (
    <div className="voice-segment-panel">
      <div className="voice-segment-header">
        <button
          type="button"
          className="voice-segment-toggle"
          onClick={() => setCollapsed((prev) => !prev)}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <span>語音編輯模式（{segments.length} 段，點片段可切換候選或微調）</span>
        </button>

        <div className="voice-segment-controls">
          <label
            className="voice-cmd-switch"
            title="開啟後可口述「刪掉上一句」、「全部重來」、「停止錄音」"
          >
            <input
              type="checkbox"
              checked={voiceCommandsEnabled}
              onChange={(e) => onToggleVoiceCommands(e.target.checked)}
            />
            <span>語音指令</span>
          </label>

          <button
            type="button"
            className="voice-mini-btn"
            onClick={onUndoLastSegment}
            disabled={!canUndo}
            title="撤銷最後一段語音"
          >
            <Undo2 size={13} />
            <span>撤銷</span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="voice-segment-chips">
            {segments.map((seg) => {
              const isSelected = activeId === seg.id;
              const isRerecording = rerecordingSegmentId === seg.id;
              const hasAlternatives = seg.alternatives.length > 1;
              const hasGlossary = seg.replacements.length > 0;
              return (
                <div
                  key={seg.id}
                  className={`voice-chip ${isSelected ? 'is-selected' : ''} ${
                    isRerecording ? 'is-rerecording' : ''
                  } ${hasGlossary ? 'has-glossary' : ''}`}
                >
                  <button
                    type="button"
                    className="voice-chip-main"
                    onClick={() => openInspector(seg)}
                    title={
                      hasAlternatives
                        ? '點擊查看其他辨識候選或手動微調'
                        : '點擊手動微調或加入詞庫'
                    }
                  >
                    <span className="voice-chip-target">
                      {seg.target === 'title' ? '標題' : '脈絡'}
                    </span>
                    <span className="voice-chip-text">{seg.text}</span>
                    {hasAlternatives && (
                      <span className="voice-chip-badge" title="有其他語音候選">
                        {seg.alternatives.length}選
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    className={`voice-chip-action ${isRerecording ? 'is-active' : ''}`}
                    onClick={() => onRerecordSegment(seg.id)}
                    title={isRerecording ? '停止單段重錄' : '重錄這一段'}
                    aria-label="重錄這一段"
                  >
                    {isRerecording ? <MicOff size={12} /> : <Mic size={12} />}
                  </button>
                  <button
                    type="button"
                    className="voice-chip-action danger"
                    onClick={() => {
                      if (activeId === seg.id) setActiveId(null);
                      onDeleteSegment(seg.id);
                    }}
                    title="刪除此片段"
                    aria-label="刪除此片段"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {activeSegment && (
            <div className="voice-inspector">
              <div className="voice-inspector-top">
                <span className="voice-inspector-title">
                  微調片段（{activeSegment.target === 'title' ? '標題' : '脈絡'}）
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 22, height: 22 }}
                  onClick={() => setActiveId(null)}
                  aria-label="關閉片段編輯"
                >
                  <X size={13} />
                </button>
              </div>

              {activeSegment.replacements.length > 0 && (
                <div className="voice-glossary-notice">
                  <span>
                    已自動替換：
                    {activeSegment.replacements
                      .map((r) => `${r.wrong} → ${r.correct}`)
                      .join('、')}
                  </span>
                  <button
                    type="button"
                    className="voice-mini-btn"
                    onClick={() => {
                      onRevertGlossary(activeSegment.id);
                      setInlineDraft(activeSegment.rawText);
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>還原原文</span>
                  </button>
                </div>
              )}

              {activeSegment.alternatives.length > 1 && (
                <div className="voice-alt-row">
                  <span className="voice-alt-label">語音候選：</span>
                  <div className="voice-alt-list">
                    {activeSegment.alternatives.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        className={`voice-alt-btn ${
                          alt === activeSegment.rawText ? 'is-current' : ''
                        }`}
                        onClick={() => {
                          onSelectAlternative(activeSegment.id, alt);
                          setInlineDraft(alt);
                        }}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="voice-inline-edit">
                <input
                  type="text"
                  className="drawer-input"
                  value={inlineDraft}
                  onChange={(e) => {
                    setInlineDraft(e.target.value);
                    setLearnedFeedback(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveInline();
                    }
                  }}
                  placeholder="修改此段文字..."
                />
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  onClick={handleSaveInline}
                  disabled={!inlineDraft.trim()}
                >
                  <Check size={13} />
                  <span>套用</span>
                </button>
                {inlineDraft.trim() &&
                  inlineDraft.trim() !== activeSegment.rawText && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                      onClick={handleLearn}
                      title="套用並記住這次修正到個人詞庫"
                    >
                      <BookPlus size={13} />
                      <span>記住修正</span>
                    </button>
                  )}
              </div>

              {learnedFeedback && (
                <div className="voice-learned-msg">{learnedFeedback}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
