import type { ByokConfig, ByokProvider, NoteColor, ParsedNoteInput } from '../types';
import { isNoteIconId, NOTE_ICON_META } from './noteIcons';

export interface ProviderPreset {
  label: string;
  defaultBaseUrl: string;
  requiresKey: boolean;
  placeholderKey: string;
}

export interface DetectedModel {
  id: string;
  label: string;
}

export const PROVIDER_PRESETS: Record<ByokProvider, ProviderPreset> = {
  gemini: {
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresKey: true,
    placeholderKey: 'AIzaSy...',
  },
  groq: {
    label: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    placeholderKey: 'gsk_...',
  },
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    placeholderKey: 'sk-...',
  },
  claude: {
    label: 'Anthropic Claude',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    requiresKey: true,
    placeholderKey: 'sk-ant-...',
  },
  ollama: {
    label: 'Ollama（本機）',
    defaultBaseUrl: 'http://localhost:11434/v1',
    requiresKey: false,
    placeholderKey: '本機 Ollama 免填 Key',
  },
};

export async function fetchAvailableModels(params: {
  provider: ByokProvider;
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<DetectedModel[]> {
  const { provider, baseUrl, apiKey, signal } = params;
  const preset = PROVIDER_PRESETS[provider];
  const trimmedKey = apiKey.trim();

  if (preset.requiresKey && !trimmedKey) {
    return [];
  }

  const cleanBaseUrl = (baseUrl || preset.defaultBaseUrl).replace(/\/+$/, '');

  if (provider === 'gemini') {
    const url = `${cleanBaseUrl}/models?key=${encodeURIComponent(trimmedKey)}`;
    const res = await fetch(url, { method: 'GET', signal });
    if (!res.ok) {
      throw new Error(`無法取得 Gemini 模型清單 (${res.status})`);
    }
    const data = (await res.json()) as {
      models?: Array<{
        name?: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const seen = new Set<string>();
    const results: DetectedModel[] = [];
    for (const item of data.models ?? []) {
      if (
        !Array.isArray(item.supportedGenerationMethods) ||
        !item.supportedGenerationMethods.includes('generateContent')
      ) {
        continue;
      }
      const id = (item.name ?? '').replace(/^models\//, '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      results.push({
        id,
        label: item.displayName ? `${item.displayName} (${id})` : id,
      });
    }
    return results;
  }

  if (provider === 'claude') {
    const res = await fetch(`${cleanBaseUrl}/models`, {
      method: 'GET',
      signal,
      headers: {
        'x-api-key': trimmedKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    if (!res.ok) {
      throw new Error(`無法取得 Claude 模型清單 (${res.status})`);
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string; display_name?: string }>;
    };
    const seen = new Set<string>();
    const results: DetectedModel[] = [];
    for (const item of data.data ?? []) {
      const id = item.id?.trim() ?? '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      results.push({
        id,
        label: item.display_name ? `${item.display_name} (${id})` : id,
      });
    }
    return results;
  }

  // OpenAI / Groq / Ollama (皆相容 /models)
  const headers: Record<string, string> = {};
  if (trimmedKey) {
    headers.Authorization = `Bearer ${trimmedKey}`;
  }
  const res = await fetch(`${cleanBaseUrl}/models`, {
    method: 'GET',
    signal,
    headers,
  });
  if (!res.ok) {
    throw new Error(`無法取得 ${preset.label} 模型清單 (${res.status})`);
  }
  const data = (await res.json()) as {
    data?: Array<{ id?: string }>;
  };
  const seen = new Set<string>();
  const results: DetectedModel[] = [];
  for (const item of data.data ?? []) {
    const id = item.id?.trim() ?? '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    results.push({ id, label: id });
  }
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

const VALID_COLORS = new Set<NoteColor>(['amber', 'sage', 'sky', 'rose', 'slate']);

const ICON_GUIDE = NOTE_ICON_META.map((item) => `${item.id}(${item.hint})`).join('、');

const SYSTEM_PROMPT = [
  '你是繁體中文（台灣用語）待辦事項整理助手。請去除「那個、就是、嗯」等口語贅字，將使用者的口語或隨手記拆解為結構化待辦。',
  '若輸入包含多件彼此獨立的事，請拆成多筆（最多 5 筆）；若只有一件事則輸出 1 筆。',
  '只輸出合法 JSON，不要任何額外文字或 markdown，格式為：',
  '{"items":[{"title":"精簡行動標題(15字內)","contextNote":"補充脈絡與原因細節，避免過幾天忘記","tags":["最多2個簡短時間或分類標籤"],"color":"配色","icon":"圖示ID"}]}',
  'color 只能從以下 5 個擇一：rose(緊急/重要/期限迫近/醫療健康)、amber(日常提醒/採買補貨/生活瑣事)、sky(工作任務/會議/溝通聯絡/學習)、sage(財務繳費/運動習慣/居家綠化)、slate(純備忘/靈感/低優先度)。',
  `icon 只能從以下 ID 擇一：${ICON_GUIDE}。`,
].join('\n');

interface RawAiItem {
  title?: unknown;
  contextNote?: unknown;
  tags?: unknown;
  color?: unknown;
  icon?: unknown;
}

function normalizeAiItem(item: RawAiItem, rawText: string): ParsedNoteInput | null {
  if (typeof item.title !== 'string' || !item.title.trim()) {
    return null;
  }
  const color =
    typeof item.color === 'string' && VALID_COLORS.has(item.color as NoteColor)
      ? (item.color as NoteColor)
      : undefined;
  const icon = isNoteIconId(item.icon) ? item.icon : undefined;

  return {
    title: item.title.trim(),
    contextNote: typeof item.contextNote === 'string' ? item.contextNote.trim() : '',
    transcript: rawText,
    tags: Array.isArray(item.tags)
      ? item.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 3)
      : [],
    color,
    icon,
  };
}

function extractParsedItems(text: string, rawText: string): ParsedNoteInput[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as RawAiItem & { items?: RawAiItem[] };
    const candidates = Array.isArray(parsed.items) ? parsed.items : [parsed];
    return candidates
      .map((item) => normalizeAiItem(item, rawText))
      .filter((item): item is ParsedNoteInput => item !== null)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function parseNoteWithByok(
  rawText: string,
  config: ByokConfig
): Promise<ParsedNoteInput[]> {
  const preset = PROVIDER_PRESETS[config.provider];
  if (!config.enabled) return [];
  if (preset.requiresKey && !config.apiKey.trim()) return [];

  const baseUrl = (config.baseUrl || preset.defaultBaseUrl).replace(/\/+$/, '');
  const model = config.model.trim();
  if (!model) return [];

  let rawResponseText = '';

  if (config.provider === 'gemini') {
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      config.apiKey.trim()
    )}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: rawText }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API 錯誤 (${res.status})`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    rawResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } else if (config.provider === 'claude') {
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: rawText }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API 錯誤 (${res.status})`);
    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    rawResponseText = data.content?.find((b) => b.type === 'text')?.text ?? '';
  } else {
    // OpenAI / Groq / Ollama (皆相容 /chat/completions)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey.trim()) {
      headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 512,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: rawText },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${preset.label} API 錯誤 (${res.status})`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    rawResponseText = data.choices?.[0]?.message?.content ?? '';
  }

  return extractParsedItems(rawResponseText, rawText);
}
