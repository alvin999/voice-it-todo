import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ByokConfig,
  InputParseMode,
  NoteIconId,
  ParsedNoteInput,
  SyncStatus,
  Todo,
} from '../types';
import { parseNoteWithByok } from '../utils/byokAi';
import { parseVoiceOrTextNote } from '../utils/contextParser';

const STORAGE_TODOS_KEY = 'postittodo_items_v2';
const STORAGE_SPACE_KEY = 'postittodo_space_key_v2';
const STORAGE_API_KEY = 'postittodo_api_url_v2';

function createSpaceKey(): string {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `space_${random}`;
}

function getInitialSpaceKey(): string {
  if (typeof window === 'undefined') return 'space_default';
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('space')?.trim();
  if (fromUrl && /^[a-zA-Z0-9_-]{4,64}$/.test(fromUrl)) {
    localStorage.setItem(STORAGE_SPACE_KEY, fromUrl);
    return fromUrl;
  }

  const saved = localStorage.getItem(STORAGE_SPACE_KEY);
  if (saved && /^[a-zA-Z0-9_-]{4,64}$/.test(saved)) {
    return saved;
  }

  const fresh = createSpaceKey();
  localStorage.setItem(STORAGE_SPACE_KEY, fresh);
  return fresh;
}

function getInitialApiUrl(): string {
  if (typeof window === 'undefined') return '';
  const saved = localStorage.getItem(STORAGE_API_KEY);
  if (saved !== null) return saved;
  return (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';
}

function getSeedTodos(): Todo[] {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      title: '拍冷氣濾網型號給水電師傅',
      contextNote: '上次師傅說可能是 3M 款式，下週三前要拍外框標籤確認尺寸。',
      transcript: '下週三前要記得把冷氣濾網型號拍給水電師傅，上次他說好像是 3M 那款',
      tags: ['下週三', '生活'],
      color: 'amber',
      completed: false,
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      title: '試試看右上角或輸入框的語音按鈕',
      contextNote: '直接口述完整來龍去脈，系統會自動幫你拆出「簡短標題」與「脈絡備註」，過幾天回來也不會忘記。',
      transcript: '',
      tags: ['技巧'],
      color: 'sage',
      completed: false,
      order: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function loadLocalTodos(): Todo[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_TODOS_KEY);
    if (!raw) {
      const seed = getSeedTodos();
      localStorage.setItem(STORAGE_TODOS_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useTodoStore() {
  const [todos, setTodos] = useState<Todo[]>(loadLocalTodos);
  const [spaceKey, setSpaceKeyState] = useState<string>(getInitialSpaceKey);
  const [apiUrl, setApiUrlState] = useState<string>(getInitialApiUrl);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    mode: getInitialApiUrl() ? 'cloud' : 'local',
    syncing: false,
    lastSyncedAt: null,
    error: null,
  });

  const todosRef = useRef(todos);
  todosRef.current = todos;

  // 每次變動即寫入本機儲存 (Local-first)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TODOS_KEY, JSON.stringify(todos));
    } catch {
      // 忽略瀏覽器隱私模式儲存限制
    }
  }, [todos]);

  const normalizedApiBase = apiUrl.replace(/\/+$/, '');

  const fetchFromCloud = useCallback(
    async (targetUrl = normalizedApiBase, targetSpace = spaceKey) => {
      if (!targetUrl) {
        setSyncStatus({
          mode: 'local',
          syncing: false,
          lastSyncedAt: null,
          error: null,
        });
        return;
      }

      setSyncStatus((prev) => ({ ...prev, mode: 'cloud', syncing: true, error: null }));
      try {
        const res = await fetch(`${targetUrl}/api/todos`, {
          headers: { 'X-Space-Key': targetSpace },
        });
        if (!res.ok) throw new Error(`雲端同步失敗 (${res.status})`);
        const remoteTodos = (await res.json()) as Todo[];
        setTodos(remoteTodos);
        setSyncStatus({
          mode: 'cloud',
          syncing: false,
          lastSyncedAt: new Date().toISOString(),
          error: null,
        });
      } catch (err) {
        setSyncStatus((prev) => ({
          ...prev,
          mode: 'cloud',
          syncing: false,
          error: err instanceof Error ? err.message : '無法連線到 Headless API',
        }));
      }
    },
    [normalizedApiBase, spaceKey]
  );

  useEffect(() => {
    if (normalizedApiBase) {
      void fetchFromCloud(normalizedApiBase, spaceKey);
    }
  }, [normalizedApiBase, spaceKey, fetchFromCloud]);

  const setApiUrl = useCallback((nextUrl: string) => {
    const trimmed = nextUrl.trim().replace(/\/+$/, '');
    setApiUrlState(trimmed);
    localStorage.setItem(STORAGE_API_KEY, trimmed);
    if (!trimmed) {
      setSyncStatus({ mode: 'local', syncing: false, lastSyncedAt: null, error: null });
    }
  }, []);

  const setSpaceKey = useCallback((nextKey: string) => {
    const cleaned = nextKey.trim();
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(cleaned)) return false;
    setSpaceKeyState(cleaned);
    localStorage.setItem(STORAGE_SPACE_KEY, cleaned);
    return true;
  }, []);

  const pushAllToCloud = useCallback(async () => {
    if (!normalizedApiBase) return;
    setSyncStatus((prev) => ({ ...prev, syncing: true, error: null }));
    try {
      const res = await fetch(`${normalizedApiBase}/api/todos/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Space-Key': spaceKey,
        },
        body: JSON.stringify({ todos: todosRef.current }),
      });
      if (!res.ok) throw new Error(`同步失敗 (${res.status})`);
      const synced = (await res.json()) as Todo[];
      setTodos(synced);
      setSyncStatus({
        mode: 'cloud',
        syncing: false,
        lastSyncedAt: new Date().toISOString(),
        error: null,
      });
    } catch (err) {
      setSyncStatus((prev) => ({
        ...prev,
        syncing: false,
        error: err instanceof Error ? err.message : '雲端同步失敗',
      }));
    }
  }, [normalizedApiBase, spaceKey]);

  const addTodo = useCallback(
    async (
      rawInput: string,
      options: {
        icon?: NoteIconId;
        mode?: InputParseMode;
        respectManualIcon?: boolean;
        isVoice?: boolean;
        byokConfig?: ByokConfig;
      } = {}
    ) => {
      const trimmed = rawInput.trim();
      if (!trimmed) return false;

      const {
        icon,
        mode = 'smart',
        respectManualIcon = false,
        isVoice = false,
        byokConfig,
      } = options;

      // 一般模式：僅用本機規則純整理；智慧模式：先以本機規則作為降級備案，再呼叫 AI
      const fallbackParsed = parseVoiceOrTextNote(trimmed, isVoice);
      let parsedList: ParsedNoteInput[] = [fallbackParsed];
      let aiParsed = false;

      if (mode === 'smart' && byokConfig?.enabled) {
        try {
          const byokResults = await parseNoteWithByok(trimmed, byokConfig);
          if (byokResults.length > 0) {
            parsedList = byokResults;
            aiParsed = true;
          }
        } catch {
          // 忽略 AI 金鑰端點失敗，改由 Workers AI 或本機規則處理
        }
      }

      if (!aiParsed && mode === 'smart' && normalizedApiBase && trimmed.length >= 12) {
        try {
          const aiRes = await fetch(`${normalizedApiBase}/api/voice/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: trimmed }),
          });
          if (aiRes.ok) {
            const aiData = (await aiRes.json()) as {
              source?: string;
              title?: string;
              contextNote?: string;
              tags?: string[];
            };
            if (aiData.source === 'workers-ai' && aiData.title) {
              parsedList = [
                {
                  title: aiData.title,
                  contextNote: aiData.contextNote ?? fallbackParsed.contextNote,
                  transcript: trimmed,
                  tags: aiData.tags?.length ? aiData.tags : fallbackParsed.tags,
                },
              ];
            }
          }
        } catch {
          // 忽略 AI 端點失敗，直接使用本機拆解結果
        }
      }

      const now = new Date().toISOString();
      const newTodos: Todo[] = parsedList.map((item, idx) => ({
        id: crypto.randomUUID(),
        title: item.title,
        contextNote: item.contextNote,
        transcript: item.transcript,
        tags: item.tags,
        color: 'amber',
        icon: respectManualIcon ? icon : (item.icon ?? icon),
        completed: false,
        order: idx,
        createdAt: now,
        updatedAt: now,
      }));

      setTodos((prev) => [
        ...newTodos,
        ...prev.map((item, idx) => ({ ...item, order: idx + newTodos.length })),
      ]);

      if (normalizedApiBase) {
        try {
          await Promise.all(
            newTodos.map((newTodo) =>
              fetch(`${normalizedApiBase}/api/todos`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Space-Key': spaceKey,
                },
                body: JSON.stringify(newTodo),
              })
            )
          );
          setSyncStatus((prev) => ({
            ...prev,
            lastSyncedAt: new Date().toISOString(),
            error: null,
          }));
        } catch {
          setSyncStatus((prev) => ({ ...prev, error: '已存於本機，雲端同步稍後重試' }));
        }
      }

      return true;
    },
    [normalizedApiBase, spaceKey]
  );

  const updateTodo = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Todo, 'title' | 'contextNote' | 'tags' | 'color' | 'icon' | 'completed'>>
    ) => {
      const now = new Date().toISOString();
      setTodos((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
              ...item,
              ...patch,
              updatedAt: now,
            }
            : item
        )
      );

      if (normalizedApiBase) {
        try {
          await fetch(`${normalizedApiBase}/api/todos/${id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-Space-Key': spaceKey,
            },
            body: JSON.stringify(patch),
          });
        } catch {
          setSyncStatus((prev) => ({ ...prev, error: '更新已暫存本機，雲端同步失敗' }));
        }
      }
    },
    [normalizedApiBase, spaceKey]
  );

  const toggleTodo = useCallback(
    async (id: string) => {
      const target = todosRef.current.find((t) => t.id === id);
      if (!target) return;
      const nextCompleted = !target.completed;
      const now = new Date().toISOString();

      setTodos((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, completed: nextCompleted, updatedAt: now }
            : item
        )
      );

      if (normalizedApiBase) {
        try {
          await fetch(`${normalizedApiBase}/api/todos/${id}/toggle`, {
            method: 'PATCH',
            headers: { 'X-Space-Key': spaceKey },
          });
        } catch {
          setSyncStatus((prev) => ({ ...prev, error: '狀態已暫存本機，雲端同步失敗' }));
        }
      }
    },
    [normalizedApiBase, spaceKey]
  );

  const deleteTodo = useCallback(
    async (id: string) => {
      setTodos((prev) => prev.filter((item) => item.id !== id));

      if (normalizedApiBase) {
        try {
          await fetch(`${normalizedApiBase}/api/todos/${id}`, {
            method: 'DELETE',
            headers: { 'X-Space-Key': spaceKey },
          });
        } catch {
          setSyncStatus((prev) => ({ ...prev, error: '刪除已套用本機，雲端同步失敗' }));
        }
      }
    },
    [normalizedApiBase, spaceKey]
  );

  const reorderTodos = useCallback(
    async (orderedTodos: Todo[]) => {
      const normalized = orderedTodos.map((item, index) => ({
        ...item,
        order: index,
      }));
      setTodos(normalized);

      if (normalizedApiBase) {
        try {
          await fetch(`${normalizedApiBase}/api/todos/reorder`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Space-Key': spaceKey,
            },
            body: JSON.stringify({ todoIds: normalized.map((t) => t.id) }),
          });
        } catch {
          setSyncStatus((prev) => ({ ...prev, error: '排序已套用本機，雲端同步失敗' }));
        }
      }
    },
    [normalizedApiBase, spaceKey]
  );

  return {
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
  };
}
