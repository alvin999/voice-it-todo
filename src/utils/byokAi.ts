import type { ByokConfig, ByokProvider, ParsedNoteInput } from '../types';
import { isNoteIconId, loadIconTemplates, NOTE_ICON_META } from './noteIcons';

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
  openrouter: {
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: true,
    placeholderKey: 'sk-or-v1-...',
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

  // OpenAI / Groq / OpenRouter / Ollama (皆相容 /models)
  const headers: Record<string, string> = {};
  if (trimmedKey) {
    headers.Authorization = `Bearer ${trimmedKey}`;
  }
  if (provider === 'openrouter') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      headers['HTTP-Referer'] = window.location.origin;
    }
    headers['X-Title'] = 'Voice-it Todo';
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
    data?: Array<{ id?: string; name?: string }>;
  };
  const seen = new Set<string>();
  const results: DetectedModel[] = [];
  for (const item of data.data ?? []) {
    const id = item.id?.trim() ?? '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = item.name && item.name !== id ? `${item.name} (${id})` : id;
    results.push({ id, label });
  }
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

const ICON_GUIDE = NOTE_ICON_META.map((item) => `${item.id}(${item.hint})`).join('、');

export function buildSystemPrompt(): string {
  const templates = loadIconTemplates();
  const rulesWithFields: string[] = [];

  for (const [id, config] of Object.entries(templates)) {
    if (config?.enabled && config.fields.length > 0) {
      const fieldDesc = config.fields.map((f) => `${f}：...`).join(' / ');
      rulesWithFields.push(`- 若 icon 為 "${id}"，contextNote 請整理為：${fieldDesc}`);
    }
  }

  const fieldInstructions =
    rulesWithFields.length > 0
      ? `\n自訂圖示欄位需求：\n${rulesWithFields.join('\n')}`
      : '';

  return [
    '你是繁體中文待辦事項整理助手，請將使用者的輸入整理為結構化待辦清單。',
    '只輸出合法 JSON，格式為：',
    '{"items":[{"title":"行動標題","contextNote":"脈絡備註細節","tags":["標籤"],"icon":"圖示ID"}]}',
    `icon 請從以下 ID 擇一：${ICON_GUIDE}。`,
    fieldInstructions,
  ]
    .filter(Boolean)
    .join('\n');
}

interface RawAiItem {
  title?: unknown;
  contextNote?: unknown;
  tags?: unknown;
  icon?: unknown;
}

function normalizeAiItem(item: RawAiItem, rawText: string): ParsedNoteInput | null {
  if (typeof item.title !== 'string' || !item.title.trim()) {
    return null;
  }
  const icon = isNoteIconId(item.icon) ? item.icon : undefined;

  return {
    title: item.title.trim(),
    contextNote: typeof item.contextNote === 'string' ? item.contextNote.trim() : '',
    transcript: rawText,
    tags: Array.isArray(item.tags)
      ? item.tags.map((t) => String(t).trim()).filter(Boolean)
      : [],
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
      .filter((item): item is ParsedNoteInput => item !== null);
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

  const systemPrompt = buildSystemPrompt();

  if (config.provider === 'gemini') {
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      config.apiKey.trim()
    )}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
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
        system: systemPrompt,
        messages: [{ role: 'user', content: rawText }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API 錯誤 (${res.status})`);
    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    rawResponseText = data.content?.find((b) => b.type === 'text')?.text ?? '';
  } else {
    // OpenAI / Groq / OpenRouter / Ollama (皆相容 /chat/completions)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey.trim()) {
      headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }
    if (config.provider === 'openrouter') {
      if (typeof window !== 'undefined' && window.location?.origin) {
        headers['HTTP-Referer'] = window.location.origin;
      }
      headers['X-Title'] = 'Voice-it Todo';
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 512,
        messages: [
          { role: 'system', content: systemPrompt },
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
