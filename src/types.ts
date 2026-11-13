export type NoteColor = 'amber' | 'sage' | 'sky' | 'rose' | 'slate';

export type InputParseMode = 'normal' | 'smart';

export type NoteIconId =
  | 'sticky-note'
  | 'shopping-cart'
  | 'phone'
  | 'mail'
  | 'calendar'
  | 'briefcase'
  | 'home'
  | 'wrench'
  | 'wallet'
  | 'heart-pulse'
  | 'package'
  | 'book-open'
  | 'lightbulb';

export type FilterType = 'all' | 'active' | 'completed';

export type ByokProvider = 'gemini' | 'groq' | 'openai' | 'claude' | 'ollama';

export type KeyStorageMode = 'transparent' | 'password' | 'plain';

export interface ByokConfig {
  enabled: boolean;
  provider: ByokProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  storageMode: KeyStorageMode;
}

export interface Todo {
  id: string;
  title: string;
  contextNote: string;
  transcript: string;
  tags: string[];
  color: NoteColor;
  icon?: NoteIconId;
  completed: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedNoteInput {
  title: string;
  contextNote: string;
  transcript: string;
  tags: string[];
  color?: NoteColor;
  icon?: NoteIconId;
}

export interface SyncStatus {
  mode: 'local' | 'cloud';
  syncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
}
