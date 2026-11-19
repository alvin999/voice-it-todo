import type { GlossaryEntry, VoiceGlossaryReplacement } from '../types';

const STORAGE_GLOSSARY_KEY = 'voiceittodo_glossary_v1';

export const SAMPLE_GLOSSARY_PAIRS: Array<{ wrong: string; correct: string }> = [
  { wrong: '程經歷', correct: '陳經理' },
  { wrong: '微生紙', correct: '衛生紙' },
  { wrong: '確認信建', correct: '確認信件' },
];

export function loadGlossary(): GlossaryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_GLOSSARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is GlossaryEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.wrong === 'string' &&
        typeof item.correct === 'string' &&
        typeof item.enabled === 'boolean'
    );
  } catch {
    return [];
  }
}

export function saveGlossary(entries: GlossaryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_GLOSSARY_KEY, JSON.stringify(entries));
  } catch {
    // 忽略瀏覽器隱私模式儲存限制
  }
}

export function upsertGlossaryEntry(
  entries: GlossaryEntry[],
  wrong: string,
  correct: string
): GlossaryEntry[] {
  const cleanWrong = wrong.trim();
  const cleanCorrect = correct.trim();
  if (!cleanWrong || !cleanCorrect || cleanWrong === cleanCorrect) {
    return entries;
  }

  const existingIndex = entries.findIndex((e) => e.wrong === cleanWrong);
  if (existingIndex >= 0) {
    const updated = [...entries];
    updated[existingIndex] = {
      ...updated[existingIndex],
      correct: cleanCorrect,
      enabled: true,
    };
    return updated;
  }

  const newEntry: GlossaryEntry = {
    id: crypto.randomUUID(),
    wrong: cleanWrong,
    correct: cleanCorrect,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  return [newEntry, ...entries];
}

/**
 * 依錯字長度由長到短套用啟用中的替換規則，避免短詞先蓋過長詞。
 */
export function applyGlossary(
  input: string,
  entries: GlossaryEntry[]
): { text: string; replacements: VoiceGlossaryReplacement[] } {
  if (!input) return { text: input, replacements: [] };

  const active = entries
    .filter((e) => e.enabled && e.wrong.trim() && e.correct.trim())
    .sort((a, b) => b.wrong.length - a.wrong.length);

  let nextText = input;
  const replacements: VoiceGlossaryReplacement[] = [];

  for (const entry of active) {
    if (nextText.includes(entry.wrong)) {
      nextText = nextText.split(entry.wrong).join(entry.correct);
      replacements.push({ wrong: entry.wrong, correct: entry.correct });
    }
  }

  return { text: nextText, replacements };
}
