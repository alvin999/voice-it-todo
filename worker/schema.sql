-- PostItTodo D1 Schema
-- 透過 space_key 隔離不同使用者或裝置群組，無需強制註冊登入

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  space_key TEXT NOT NULL,
  title TEXT NOT NULL,
  context_note TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  color TEXT NOT NULL DEFAULT 'amber',
  completed INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 必建複合索引：避免全表掃描，節省 D1 免費版每日 row reads 額度
CREATE INDEX IF NOT EXISTS idx_todos_space_order
  ON todos (space_key, sort_order ASC, created_at DESC);
