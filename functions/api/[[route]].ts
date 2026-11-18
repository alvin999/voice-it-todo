import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { handle } from 'hono/cloudflare-pages';

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

type Bindings = {
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  JWT_SECRET?: string;
};

interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

interface TodoRow {
  id: string;
  user_id: string;
  title: string;
  context_note: string;
  transcript: string;
  tags: string;
  icon: string;
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
  icon?: string;
  completed: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

const AUTH_COOKIE_NAME = 'voiceit_auth';
const OAUTH_STATE_COOKIE = 'voiceit_oauth_state';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 天

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signJwt(userId: string, secret: string): Promise<string> {
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ sub: userId, exp })));
  const data = `${header}.${payload}`;
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verifyJwt(token: string, secret: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  try {
    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(`${header}.${payload}`)
    );
    if (!valid) return null;
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      sub?: string;
      exp?: number;
    };
    if (!decoded.sub || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded.sub;
  } catch {
    return null;
  }
}

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
    icon: row.icon || undefined,
    completed: row.completed === 1,
    order: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isHttpsRequest(reqUrl: string): boolean {
  try {
    return new URL(reqUrl).protocol === 'https:';
  } catch {
    return true;
  }
}

async function getAuthenticatedUserId(c: {
  req: { raw: Request };
  env: Bindings;
}): Promise<string | null> {
  const secret = c.env.JWT_SECRET;
  if (!secret) return null;
  // @ts-expect-error hono getCookie 接受 Context，這裡共用提取邏輯
  const token = getCookie(c, AUTH_COOKIE_NAME);
  if (!token) return null;
  return verifyJwt(token, secret);
}

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-pages-functions',
    oauthConfigured: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET && c.env.JWT_SECRET),
    timestamp: new Date().toISOString(),
  });
});

app.get('/auth/google', (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: '尚未設定 GOOGLE_CLIENT_ID 環境變數' }, 500);
  }

  const url = new URL(c.req.url);
  const state = crypto.randomUUID();
  const redirectUri = `${url.origin}/api/auth/callback`;

  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isHttpsRequest(c.req.url),
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'select_account');

  return c.redirect(authUrl.toString());
});

app.get('/auth/callback', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const jwtSecret = c.env.JWT_SECRET;

  if (!clientId || !clientSecret || !jwtSecret) {
    return c.text('伺服器尚未完成 OAuth 環境變數設定', 500);
  }

  const url = new URL(c.req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = getCookie(c, OAUTH_STATE_COOKIE);

  deleteCookie(c, OAUTH_STATE_COOKIE, { path: '/' });

  if (!code || !state || !savedState || state !== savedState) {
    return c.redirect('/?authError=invalid_state');
  }

  const redirectUri = `${url.origin}/api/auth/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return c.redirect('/?authError=token_exchange_failed');
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    return c.redirect('/?authError=missing_access_token');
  }

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return c.redirect('/?authError=userinfo_failed');
  }

  const profile = (await userRes.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!profile.sub || !profile.email) {
    return c.redirect('/?authError=incomplete_profile');
  }

  const now = new Date().toISOString();
  const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE google_sub = ?')
    .bind(profile.sub)
    .first<{ id: string }>();

  let userId = existingUser?.id;
  if (userId) {
    await c.env.DB.prepare(
      'UPDATE users SET email = ?, name = ?, avatar_url = ?, updated_at = ? WHERE id = ?'
    )
      .bind(profile.email, profile.name ?? profile.email, profile.picture ?? '', now, userId)
      .run();
  } else {
    userId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO users (id, google_sub, email, name, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        userId,
        profile.sub,
        profile.email,
        profile.name ?? profile.email,
        profile.picture ?? '',
        now,
        now
      )
      .run();
  }

  const jwt = await signJwt(userId, jwtSecret);
  setCookie(c, AUTH_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: isHttpsRequest(c.req.url),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return c.redirect('/');
});

app.get('/auth/me', async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ user: null });
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, avatar_url FROM users WHERE id = ?'
  )
    .bind(userId)
    .first<Pick<UserRow, 'id' | 'email' | 'name' | 'avatar_url'>>();

  if (!user) {
    deleteCookie(c, AUTH_COOKIE_NAME, { path: '/' });
    return c.json({ user: null });
  }

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
    },
  });
});

app.post('/auth/logout', (c) => {
  deleteCookie(c, AUTH_COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});

app.get('/todos', async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: '請先登入 Google 帳號' }, 401);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, user_id, title, context_note, transcript, tags, icon, completed, sort_order, created_at, updated_at
     FROM todos
     WHERE user_id = ?
     ORDER BY sort_order ASC, created_at DESC`
  )
    .bind(userId)
    .all<TodoRow>();

  return c.json((results ?? []).map(serializeRow));
});

app.post('/todos', async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: '請先登入 Google 帳號' }, 401);
  }

  const body = await c.req.json<{
    id?: string;
    title?: string;
    contextNote?: string;
    transcript?: string;
    tags?: string[];
    icon?: string;
  }>();

  const title = body.title?.trim();
  if (!title) {
    return c.json({ error: '待辦事項標題不可為空' }, 400);
  }

  const id = body.id?.trim() || crypto.randomUUID();
  const now = new Date().toISOString();
  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
    : [];
  const icon = typeof body.icon === 'string' ? body.icon.trim() : '';

  const minRow = await c.env.DB.prepare(
    'SELECT COALESCE(MIN(sort_order), 1) AS min_order FROM todos WHERE user_id = ?'
  )
    .bind(userId)
    .first<{ min_order: number }>();

  const sortOrder = (minRow?.min_order ?? 1) - 1;

  await c.env.DB.prepare(
    `INSERT INTO todos (id, user_id, title, context_note, transcript, tags, icon, completed, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  )
    .bind(
      id,
      userId,
      title,
      body.contextNote?.trim() ?? '',
      body.transcript?.trim() ?? '',
      JSON.stringify(tags),
      icon,
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
      icon: icon || undefined,
      completed: false,
      order: sortOrder,
      createdAt: now,
      updatedAt: now,
    } satisfies TodoDTO,
    201
  );
});

app.put('/todos/:id', async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: '請先登入 Google 帳號' }, 401);
  }

  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    'SELECT * FROM todos WHERE id = ? AND user_id = ?'
  )
    .bind(id, userId)
    .first<TodoRow>();

  if (!existing) {
    return c.json({ error: '找不到該待辦事項' }, 404);
  }

  const body = await c.req.json<{
    title?: string;
    contextNote?: string;
    transcript?: string;
    tags?: string[];
    icon?: string;
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
  const nextIcon = body.icon !== undefined ? body.icon.trim() : existing.icon;
  const nextCompleted =
    body.completed !== undefined ? (body.completed ? 1 : 0) : existing.completed;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE todos
     SET title = ?, context_note = ?, transcript = ?, tags = ?, icon = ?, completed = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      nextTitle,
      nextContext,
      nextTranscript,
      nextTags,
      nextIcon,
      nextCompleted,
      now,
      id,
      userId
    )
    .run();

  const updated = await c.env.DB.prepare(
    'SELECT * FROM todos WHERE id = ? AND user_id = ?'
  )
    .bind(id, userId)
    .first<TodoRow>();

  return c.json(serializeRow(updated!));
});

app.patch('/todos/:id/toggle', async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: '請先登入 Google 帳號' }, 401);
  }

  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    'SELECT * FROM todos WHERE id = ? AND user_id = ?'
  )
    .bind(id, userId)
    .first<TodoRow>();

  if (!existing) {
    return c.json({ error: '找不到該待辦事項' }, 404);
  }

  const nextCompleted = existing.completed === 1 ? 0 : 1;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'UPDATE todos SET completed = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  )
    .bind(nextCompleted, now, id, userId)
    .run();

  return c.json(
    serializeRow({
      ...existing,
      completed: nextCompleted,
      updated_at: now,
    })
  );
});

app.delete('/todos/:id', async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: '請先登入 Google 帳號' }, 401);
  }

  const id = c.req.param('id');
  const result = await c.env.DB.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return c.json({ error: '找不到該待辦事項' }, 404);
  }

  return c.body(null, 204);
});

app.post('/todos/reorder', async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: '請先登入 Google 帳號' }, 401);
  }

  const body = await c.req.json<{ todoIds?: string[] }>();
  if (!Array.isArray(body.todoIds) || body.todoIds.length === 0) {
    return c.json({ error: 'todoIds 不可為空' }, 400);
  }

  const now = new Date().toISOString();
  const statements = body.todoIds.map((id, index) =>
    c.env.DB.prepare(
      'UPDATE todos SET sort_order = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).bind(index, now, id, userId)
  );

  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});

app.post('/todos/sync', async (c) => {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    return c.json({ error: '請先登入 Google 帳號' }, 401);
  }

  const body = await c.req.json<{ todos?: TodoDTO[] }>();
  if (!Array.isArray(body.todos)) {
    return c.json({ error: 'todos 格式錯誤' }, 400);
  }

  const statements = body.todos.slice(0, 200).map((item, idx) =>
    c.env.DB.prepare(
      `INSERT INTO todos (id, user_id, title, context_note, transcript, tags, icon, completed, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         context_note = excluded.context_note,
         transcript = excluded.transcript,
         tags = excluded.tags,
         icon = excluded.icon,
         completed = excluded.completed,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at
       WHERE todos.user_id = excluded.user_id`
    ).bind(
      item.id,
      userId,
      item.title,
      item.contextNote ?? '',
      item.transcript ?? '',
      JSON.stringify(item.tags ?? []),
      item.icon ?? '',
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
    `SELECT * FROM todos WHERE user_id = ? ORDER BY sort_order ASC, created_at DESC`
  )
    .bind(userId)
    .all<TodoRow>();

  return c.json((results ?? []).map(serializeRow));
});

export const onRequest = handle(app);
