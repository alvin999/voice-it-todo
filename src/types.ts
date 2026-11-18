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

export type ByokProvider = 'gemini' | 'groq' | 'openai' | 'claude' | 'openrouter' | 'ollama';

export type KeyStorageMode = 'transparent' | 'password' | 'plain';

export interface ByokConfig {
  enabled: boolean;
  provider: ByokProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  storageMode: KeyStorageMode;
}

export interface IconFieldConfig {
  enabled: boolean;
  fields: string[];
}

export type IconTemplateMap = Partial<Record<NoteIconId, IconFieldConfig>>;

export interface Todo {
  id: string;
  title: string;
  contextNote: string;
  transcript: string;
  tags: string[];
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
  icon?: NoteIconId;
}

export interface SyncStatus {
  mode: 'local' | 'cloud';
  syncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
}
