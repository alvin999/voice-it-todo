import type {
  ByokConfig,
  ByokProvider,
  ParsedNoteInput,
  Todo,
  VoiceEditSuggestion,
} from '../types';
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
    if (id === 'sticky-note') continue;
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
    '輸入內容可能來自台灣中文語音辨識，請依上下文自動修正明顯同音錯字與語助詞（如「那個、就是」），但勿擅自改變專有名詞或原本的行動原意。',
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

async function callByokLlm(
  systemPrompt: string,
  userPrompt: string,
  config: ByokConfig,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const preset = PROVIDER_PRESETS[config.provider];
  if (!config.enabled) {
    throw new Error('尚未啟用 AI 金鑰設定');
  }
  if (preset.requiresKey && !config.apiKey.trim()) {
    throw new Error(`請先填寫 ${preset.label} API 金鑰`);
  }

  const baseUrl = (config.baseUrl || preset.defaultBaseUrl).replace(/\/+$/, '');
  const model = config.model.trim();
  if (!model) {
    throw new Error('請先選擇或輸入 AI 模型名稱');
  }

  const temperature = options.temperature ?? 0.2;
  const maxTokens = options.maxTokens ?? 512;

  if (config.provider === 'gemini') {
    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      config.apiKey.trim()
    )}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API 錯誤 (${res.status})`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  if (config.provider === 'claude') {
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
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API 錯誤 (${res.status})`);
    const data = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    return data.content?.find((b) => b.type === 'text')?.text ?? '';
  }

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
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${preset.label} API 錯誤 (${res.status})`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? '';
}

export async function parseNoteWithByok(
  rawText: string,
  config: ByokConfig
): Promise<ParsedNoteInput[]> {
  const preset = PROVIDER_PRESETS[config.provider];
  if (!config.enabled) return [];
  if (preset.requiresKey && !config.apiKey.trim()) return [];
  if (!config.model.trim()) return [];

  const systemPrompt = buildSystemPrompt();
  const rawResponseText = await callByokLlm(systemPrompt, rawText, config);
  return extractParsedItems(rawResponseText, rawText);
}

/**
 * 僅校對台灣中文語音辨識產生的同音錯字、贅詞與標點，不拆分卡片。
 */
export async function proofreadTranscriptWithByok(
  input: { title: string; contextNote: string },
  config: ByokConfig
): Promise<{ title: string; contextNote: string }> {
  const systemPrompt = [
    '你是台灣繁體中文語音逐字稿校對助手。',
    '使用者透過語音輸入待辦標題與脈絡備註，可能含有同音錯字、漏字或標點混亂。',
    '請依上下文僅做錯字修正與標點順稿，保持原意、語氣與 #標籤 不變，不要拆成多筆，也不要憑空新增內容。',
    '只輸出合法 JSON：{"title":"修正後標題","contextNote":"修正後備註"}',
  ].join('\n');

  const userPrompt = JSON.stringify({
    title: input.title,
    contextNote: input.contextNote,
  });

  const rawResponseText = await callByokLlm(systemPrompt, userPrompt, config, {
    temperature: 0.1,
    maxTokens: 512,
  });

  const match = rawResponseText.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('AI 未回傳有效的校對結果');
  }

  const parsed = JSON.parse(match[0]) as { title?: unknown; contextNote?: unknown };
  const nextTitle = typeof parsed.title === 'string' ? parsed.title.trim() : input.title;
  const nextContext =
    typeof parsed.contextNote === 'string' ? parsed.contextNote.trim() : input.contextNote;

  return {
    title: nextTitle || input.title,
    contextNote: nextContext,
  };
}

/**
 * 依據使用者的口述修改指令，更新既有待辦事項並回傳預覽建議。
 */
export async function editTodoWithVoice(
  todo: Pick<Todo, 'title' | 'contextNote' | 'tags' | 'icon'>,
  instruction: string,
  config: ByokConfig
): Promise<VoiceEditSuggestion> {
  const systemPrompt = [
    '你是繁體中文待辦便利貼的語音編輯助手。',
    '請根據使用者的「語音修改指令」更新現有待辦事項（只修改指令要求調整的部分，未提及的欄位請保持原樣）。',
    '注意語音指令本身也可能有台灣中文同音錯字，請先依上下文理解原意再套用修改。',
    `icon 請從以下 ID 擇一（若無須變更請保留原值）：${ICON_GUIDE}。`,
    '只輸出合法 JSON：',
    '{"title":"更新後標題","contextNote":"更新後脈絡備註","tags":["標籤"],"icon":"圖示ID","summary":"一句話說明本次改動"}',
  ].join('\n');

  const userPrompt = JSON.stringify({
    currentTodo: {
      title: todo.title,
      contextNote: todo.contextNote,
      tags: todo.tags,
      icon: todo.icon ?? 'sticky-note',
    },
    voiceInstruction: instruction,
  });

  const rawResponseText = await callByokLlm(systemPrompt, userPrompt, config, {
    temperature: 0.15,
    maxTokens: 512,
  });

  const match = rawResponseText.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('AI 未回傳有效的修改建議');
  }

  const parsed = JSON.parse(match[0]) as {
    title?: unknown;
    contextNote?: unknown;
    tags?: unknown;
    icon?: unknown;
    summary?: unknown;
  };

  const title =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : todo.title;
  const contextNote =
    typeof parsed.contextNote === 'string' ? parsed.contextNote.trim() : todo.contextNote;
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t) => String(t).trim()).filter(Boolean)
    : todo.tags;
  const icon = isNoteIconId(parsed.icon) ? parsed.icon : todo.icon;
  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : '已依語音指令調整內容';

  return {
    title,
    contextNote,
    tags,
    icon,
    summary,
  };
}
