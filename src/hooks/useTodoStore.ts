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

const SEED_TODO_ID_PREFIX = 'demo-guide-';

export function isSeedTodo(todo: Pick<Todo, 'id'>): boolean {
  return todo.id.startsWith(SEED_TODO_ID_PREFIX);
}

function getSeedTodos(): Todo[] {
  const now = new Date().toISOString();
  const suffix = () => crypto.randomUUID().slice(0, 8);
  return [
    {
      id: `${SEED_TODO_ID_PREFIX}1-${suffix()}`,
      title: '點這張卡片展開，看看語音逐字稿怎麼被整理',
      contextNote:
        '隨口說出完整來龍去脈，系統會自動提煉精簡標題與脈絡備註，主畫面保持清爽，需要時再展開查看原始逐字稿。',
      transcript:
        '那個…幫我記一下，等一下要試試看點擊卡片展開的功能，聽說講話太長的時候，原本的逐字稿也會一起留著不會不見對吧？',
      tags: ['① 語音拆解', '點擊展開'],
      icon: 'lightbulb',
      completed: false,
      order: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${SEED_TODO_ID_PREFIX}2-${suffix()}`,
      title: '點左側圖示更換分類，或按住手把上下拖曳排序',
      contextNote:
        '點擊標題旁的圖示可切換 13 種情境圖示；在「全部」且無搜尋關鍵字時，按住最左側手把即可拖曳調整順序，右側也能編輯或刪除。',
      transcript: '',
      tags: ['② 圖示與排序', '動手試試'],
      icon: 'wrench',
      completed: false,
      order: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${SEED_TODO_ID_PREFIX}3-${suffix()}`,
      title: '設定自備 AI 金鑰，解鎖「智慧解析」自動分類',
      contextNote:
        '未設定金鑰時採用本機規則「一般整理」；點擊上方金鑰設定（支援 Gemini、OpenAI、Claude、Groq 或本機 Ollama），即可自動拆解重點並配對圖示與標籤。',
      transcript: '',
      tags: ['③ 智慧解析', 'BYOK'],
      icon: 'briefcase',
      completed: false,
      order: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `${SEED_TODO_ID_PREFIX}4-${suffix()}`,
      title: '資料預設存在本機，免登入即可離線使用',
      contextNote:
        '所有待辦優先儲存在瀏覽器本機；若需跨裝置同步或搭配 iOS 捷徑寫入，可設定 Cloudflare Worker 與 Space Key。（試著切換上方「全部／進行中／已完成」看看篩選效果）',
      transcript: '',
      tags: ['④ 本機優先', '雲端同步'],
      icon: 'calendar',
      completed: true,
      order: 3,
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
      if (!trimmed) return { ok: false };

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
      let fallbackNotice: string | undefined = undefined;

      if (mode === 'smart' && byokConfig?.enabled) {
        try {
          const byokResults = await parseNoteWithByok(trimmed, byokConfig);
          if (byokResults.length > 0) {
            parsedList = byokResults;
            aiParsed = true;
          }
        } catch {
          // AI 金鑰端點失敗，標註降級提示
          fallbackNotice = 'AI 整理連線異常，已自動切換為本機規則拆解。';
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

      return { ok: true, fallbackNotice };
    },
    [normalizedApiBase, spaceKey]
  );

  const updateTodo = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Todo, 'title' | 'contextNote' | 'tags' | 'icon' | 'completed'>>
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

  const restoreTodo = useCallback(
    async (restoredItem: Todo) => {
      setTodos((prev) => {
        if (prev.some((t) => t.id === restoredItem.id)) return prev;
        return [restoredItem, ...prev];
      });

      if (normalizedApiBase) {
        try {
          await fetch(`${normalizedApiBase}/api/todos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Space-Key': spaceKey,
            },
            body: JSON.stringify(restoredItem),
          });
        } catch {
          setSyncStatus((prev) => ({ ...prev, error: '復原已套用本機，雲端同步稍後重試' }));
        }
      }
    },
    [normalizedApiBase, spaceKey]
  );

  const loadSeedTodos = useCallback(async () => {
    const seeds = getSeedTodos();
    setTodos((prev) => (prev.length === 0 ? seeds : prev));

    if (normalizedApiBase && todosRef.current.length === 0) {
      try {
        await Promise.all(
          seeds.map((item) =>
            fetch(`${normalizedApiBase}/api/todos`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Space-Key': spaceKey,
              },
              body: JSON.stringify(item),
            })
          )
        );
      } catch {
        setSyncStatus((prev) => ({ ...prev, error: '範例已載入本機，雲端同步稍後重試' }));
      }
    }
  }, [normalizedApiBase, spaceKey]);

  const clearSeedTodos = useCallback(async () => {
    const seedIds = todosRef.current.filter(isSeedTodo).map((t) => t.id);
    if (seedIds.length === 0) return;

    setTodos((prev) => prev.filter((item) => !isSeedTodo(item)));

    if (normalizedApiBase) {
      try {
        await Promise.all(
          seedIds.map((id) =>
            fetch(`${normalizedApiBase}/api/todos/${id}`, {
              method: 'DELETE',
              headers: { 'X-Space-Key': spaceKey },
            })
          )
        );
      } catch {
        setSyncStatus((prev) => ({ ...prev, error: '已清除本機範例，雲端同步稍後重試' }));
      }
    }
  }, [normalizedApiBase, spaceKey]);

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
    restoreTodo,
    reorderTodos,
    loadSeedTodos,
    clearSeedTodos,
  };
}
