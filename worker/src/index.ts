import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  AI?: {
    run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
  };
};

interface TodoRow {
  id: string;
  space_key: string;
  title: string;
  context_note: string;
  transcript: string;
  tags: string;
  color: string;
  completed: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface TodoDTO {
  id: string;
  title: string;
  contextNote: string;
  transcript: string;
  tags: string[];
  color: string;
  completed: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

const VALID_COLORS = new Set(['amber', 'sage', 'sky', 'rose', 'slate']);

function serializeRow(row: TodoRow): TodoDTO {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((t): t is string => typeof t === 'string');
    }
  } catch {
    tags = [];
  }

  return {
    id: row.id,
    title: row.title,
    contextNote: row.context_note,
    transcript: row.transcript,
    tags,
    color: VALID_COLORS.has(row.color) ? row.color : 'amber',
    completed: row.completed === 1,
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSpaceKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  // 限制長度與字元，避免異常輸入
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Space-Key'],
  })
);

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-workers',
    aiEnabled: Boolean(c.env.AI),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/todos', async (c) => {
  const spaceKey = getSpaceKey(c.req.header('X-Space-Key') ?? c.req.query('space'));
  if (!spaceKey) {
    return c.json({ error: '缺少或無效的 X-Space-Key' }, 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, space_key, title, context_note, transcript, tags, color, completed, sort_order, created_at, updated_at
     FROM todos
     WHERE space_key = ?
     ORDER BY sort_order ASC, created_at DESC`
  )
    .bind(spaceKey)
    .all<TodoRow>();

  return c.json((results ?? []).map(serializeRow));
});

app.post('/api/todos', async (c) => {
  const spaceKey = getSpaceKey(c.req.header('X-Space-Key'));
  if (!spaceKey) {
    return c.json({ error: '缺少或無效的 X-Space-Key' }, 400);
  }

  const body = await c.req.json<{
    id?: string;
    title?: string;
    contextNote?: string;
    transcript?: string;
    tags?: string[];
    color?: string;
  }>();

  const title = body.title?.trim();
  if (!title) {
    return c.json({ error: '待辦事項標題不可為空' }, 400);
  }

  const id = body.id?.trim() || crypto.randomUUID();
  const now = new Date().toISOString();
  const color = body.color && VALID_COLORS.has(body.color) ? body.color : 'amber';
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
    : [];

  // 新項目預設放在最上方 (min sort_order - 1)
  const minRow = await c.env.DB.prepare(
    'SELECT COALESCE(MIN(sort_order), 1) AS min_order FROM todos WHERE space_key = ?'
  )
    .bind(spaceKey)
    .first<{ min_order: number }>();

  const sortOrder = (minRow?.min_order ?? 1) - 1;

  await c.env.DB.prepare(
    `INSERT INTO todos (id, space_key, title, context_note, transcript, tags, color, completed, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  )
    .bind(
      id,
      spaceKey,
      title,
      body.contextNote?.trim() ?? '',
      body.transcript?.trim() ?? '',
      JSON.stringify(tags),
      color,
      sortOrder,
      now,
      now
    )
    .run();

  return c.json(
    {
      id,
      title,
      contextNote: body.contextNote?.trim() ?? '',
      transcript: body.transcript?.trim() ?? '',
      tags,
      color,
      completed: false,
      order: sortOrder,
      createdAt: now,
      updatedAt: now,
    } satisfies TodoDTO,
    201
  );
});

app.put('/api/todos/:id', async (c) => {
  const spaceKey = getSpaceKey(c.req.header('X-Space-Key'));
  if (!spaceKey) {
    return c.json({ error: '缺少或無效的 X-Space-Key' }, 400);
  }

  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    'SELECT * FROM todos WHERE id = ? AND space_key = ?'
  )
    .bind(id, spaceKey)
    .first<TodoRow>();

  if (!existing) {
    return c.json({ error: '找不到該待辦事項' }, 404);
  }

  const body = await c.req.json<{
    title?: string;
    contextNote?: string;
    transcript?: string;
    tags?: string[];
    color?: string;
    completed?: boolean;
  }>();

  const nextTitle = body.title !== undefined ? body.title.trim() : existing.title;
  if (!nextTitle) {
    return c.json({ error: '待辦事項標題不可為空' }, 400);
  }

  const nextContext =
    body.contextNote !== undefined ? body.contextNote.trim() : existing.context_note;
  const nextTranscript =
    body.transcript !== undefined ? body.transcript.trim() : existing.transcript;
  const nextTags =
    body.tags !== undefined
      ? JSON.stringify(body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6))
      : existing.tags;
  const nextColor =
    body.color !== undefined && VALID_COLORS.has(body.color) ? body.color : existing.color;
  const nextCompleted =
    body.completed !== undefined ? (body.completed ? 1 : 0) : existing.completed;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE todos
     SET title = ?, context_note = ?, transcript = ?, tags = ?, color = ?, completed = ?, updated_at = ?
     WHERE id = ? AND space_key = ?`
  )
    .bind(
      nextTitle,
      nextContext,
      nextTranscript,
      nextTags,
      nextColor,
      nextCompleted,
      now,
      id,
      spaceKey
    )
    .run();

  const updated = await c.env.DB.prepare(
    'SELECT * FROM todos WHERE id = ? AND space_key = ?'
  )
    .bind(id, spaceKey)
    .first<TodoRow>();

  return c.json(serializeRow(updated!));
});

app.patch('/api/todos/:id/toggle', async (c) => {
  const spaceKey = getSpaceKey(c.req.header('X-Space-Key'));
  if (!spaceKey) {
    return c.json({ error: '缺少或無效的 X-Space-Key' }, 400);
  }

  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    'SELECT * FROM todos WHERE id = ? AND space_key = ?'
  )
    .bind(id, spaceKey)
    .first<TodoRow>();

  if (!existing) {
    return c.json({ error: '找不到該待辦事項' }, 404);
  }

  const nextCompleted = existing.completed === 1 ? 0 : 1;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'UPDATE todos SET completed = ?, updated_at = ? WHERE id = ? AND space_key = ?'
  )
    .bind(nextCompleted, now, id, spaceKey)
    .run();

  return c.json(
    serializeRow({
      ...existing,
      completed: nextCompleted,
      updated_at: now,
    })
  );
});

app.delete('/api/todos/:id', async (c) => {
  const spaceKey = getSpaceKey(c.req.header('X-Space-Key'));
  if (!spaceKey) {
    return c.json({ error: '缺少或無效的 X-Space-Key' }, 400);
  }

  const id = c.req.param('id');
  const result = await c.env.DB.prepare('DELETE FROM todos WHERE id = ? AND space_key = ?')
    .bind(id, spaceKey)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return c.json({ error: '找不到該待辦事項' }, 404);
  }

  return c.body(null, 204);
});

app.post('/api/todos/reorder', async (c) => {
  const spaceKey = getSpaceKey(c.req.header('X-Space-Key'));
  if (!spaceKey) {
    return c.json({ error: '缺少或無效的 X-Space-Key' }, 400);
  }

  const body = await c.req.json<{ todoIds?: string[] }>();
  if (!Array.isArray(body.todoIds) || body.todoIds.length === 0) {
    return c.json({ error: 'todoIds 不可為空' }, 400);
  }

  const now = new Date().toISOString();
  const statements = body.todoIds.map((id, index) =>
    c.env.DB.prepare(
      'UPDATE todos SET sort_order = ?, updated_at = ? WHERE id = ? AND space_key = ?'
    ).bind(index, now, id, spaceKey)
  );

  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

app.post('/api/todos/sync', async (c) => {
  const spaceKey = getSpaceKey(c.req.header('X-Space-Key'));
  if (!spaceKey) {
    return c.json({ error: '缺少或無效的 X-Space-Key' }, 400);
  }

  const body = await c.req.json<{ todos?: TodoDTO[] }>();
  if (!Array.isArray(body.todos)) {
    return c.json({ error: 'todos 格式錯誤' }, 400);
  }

  const statements = body.todos.slice(0, 200).map((item, idx) =>
    c.env.DB.prepare(
      `INSERT INTO todos (id, space_key, title, context_note, transcript, tags, color, completed, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         context_note = excluded.context_note,
         transcript = excluded.transcript,
         tags = excluded.tags,
         color = excluded.color,
         completed = excluded.completed,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at
       WHERE todos.space_key = excluded.space_key`
    ).bind(
      item.id,
      spaceKey,
      item.title,
      item.contextNote ?? '',
      item.transcript ?? '',
      JSON.stringify(item.tags ?? []),
      VALID_COLORS.has(item.color) ? item.color : 'amber',
      item.completed ? 1 : 0,
      item.order ?? idx,
      item.createdAt || new Date().toISOString(),
      item.updatedAt || new Date().toISOString()
    )
  );

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM todos WHERE space_key = ? ORDER BY sort_order ASC, created_at DESC`
  )
    .bind(spaceKey)
    .all<TodoRow>();

  return c.json((results ?? []).map(serializeRow));
});

app.post('/api/voice/parse', async (c) => {
  const body = await c.req.json<{ text?: string }>();
  const rawText = body.text?.trim();
  if (!rawText) {
    return c.json({ error: '文字內容不可為空' }, 400);
  }

  if (!c.env.AI) {
    return c.json({
      source: 'fallback',
      title: rawText,
      contextNote: '',
      tags: [],
    });
  }

  try {
    const aiResult = (await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        {
          role: 'system',
          content:
            '你是繁體中文待辦事項整理助手。請將使用者的口語輸入拆解為 JSON，格式為 {"title":"精簡行動標題(15字內)","contextNote":"補充脈絡與原因細節","tags":["最多2個簡短時間或分類標籤"]}。只輸出合法 JSON，不要其他文字。',
        },
        {
          role: 'user',
          content: rawText,
        },
      ],
      max_tokens: 200,
    })) as { response?: string };

    const jsonText = aiResult?.response?.match(/\{[\s\S]*\}/)?.[0];
    if (jsonText) {
      const parsed = JSON.parse(jsonText) as {
        title?: string;
        contextNote?: string;
        tags?: string[];
      };
      return c.json({
        source: 'workers-ai',
        title: parsed.title?.trim() || rawText,
        contextNote: parsed.contextNote?.trim() || '',
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [],
      });
    }
  } catch {
    // AI 失敗時回傳基本結果，不中斷使用者流程
  }

  return c.json({
    source: 'fallback',
    title: rawText,
    contextNote: '',
    tags: [],
  });
});

export default app;
