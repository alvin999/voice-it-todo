-- PostItTodo / VoiceItTodo D1 Schema
-- 透過 Google OAuth 登入的 user_id 隔離不同使用者的待辦資料

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  context_note TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  icon TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 必建複合索引：避免全表掃描，節省 D1 免費版每日 row reads 額度
CREATE INDEX IF NOT EXISTS idx_todos_user_order
  ON todos (user_id, sort_order ASC, created_at DESC);
