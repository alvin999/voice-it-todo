import type { ParsedNoteInput } from '../types';

const TIME_PATTERNS: Array<{ regex: RegExp; label?: string }> = [
  { regex: /(今天|今晚|今早|今天內)/ },
  { regex: /(明天|明早|明晚)/ },
  { regex: /(後天)/ },
  { regex: /(這週[一二三四五六日天]?|本週[一二三四五六日天]?)/ },
  { regex: /(下週[一二三四五六日天]?|下禮拜[一二三四五六日天]?)/ },
  { regex: /(週末|假日)/ },
  { regex: /(月底|月初|週五前|星期[一二三四五六日天]前?)/ },
  { regex: /(\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}[日號]?)/ },
];

const CATEGORY_RULES: Array<{ keywords: RegExp; tag: string }> = [
  { keywords: /(買|採購|補貨|超市|全聯|網購|下單|牛奶|濾網)/, tag: '採買' },
  { keywords: /(寄信|回信|聯絡|打給|電話|傳訊|LINE|開會|報告|簡報|提案)/i, tag: '溝通' },
  { keywords: /(修|水電|繳費|銀行|預約|看醫生|拿藥|領包裹|寄件)/, tag: '生活' },
];

/**
 * 將自然語言／語音輸入拆解為：
 * - 精簡標題 (title)
 * - 脈絡備註 (contextNote)
 * - 時間／情境標籤 (tags)
 * - 原始逐字稿 (transcript)
 *
 * 讓列表保持清爽，同時避免「過幾天忘記當初為什麼記這件事」。
 */
export function parseVoiceOrTextNote(raw: string, isVoice = false): ParsedNoteInput {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return { title: '', contextNote: '', transcript: '', tags: [] };
  }

  const tags: string[] = [];

  for (const { regex } of TIME_PATTERNS) {
    const match = cleaned.match(regex);
    if (match?.[1] && !tags.includes(match[1])) {
      tags.push(match[1]);
      if (tags.length >= 2) break;
    }
  }

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.test(cleaned) && !tags.includes(rule.tag)) {
      tags.push(rule.tag);
      if (tags.length >= 3) break;
    }
  }

  // 若包含明確換行，第一行為標題，其餘為脈絡備註
  if (raw.includes('\n')) {
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const title = lines[0] ?? cleaned;
    const contextNote = lines.slice(1).join('\n');
    return {
      title,
      contextNote,
      transcript: isVoice ? cleaned : '',
      tags,
    };
  }

  // 依據常見口語分隔符號拆出主行動與補充脈絡
  const segments = cleaned
    .split(/[，,。；;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length >= 2) {
    const first = segments[0];
    const rest = segments.slice(1).join('，');
    // 若第一段太短（例如「記得」），合併前兩段作為標題
    if (first.length <= 4 && segments.length >= 3) {
      return {
        title: `${first} ${segments[1]}`,
        contextNote: segments.slice(2).join('，'),
        transcript: isVoice ? cleaned : cleaned.length > 24 ? cleaned : '',
        tags,
      };
    }
    return {
      title: first,
      contextNote: rest,
      transcript: isVoice ? cleaned : cleaned.length > 24 ? cleaned : '',
      tags,
    };
  }

  // 單句但偏長時，截斷為簡潔標題並保留全文於脈絡備註
  if (cleaned.length > 26) {
    return {
      title: `${cleaned.slice(0, 24)}…`,
      contextNote: cleaned,
      transcript: isVoice ? cleaned : '',
      tags,
    };
  }

  return {
    title: cleaned,
    contextNote: '',
    transcript: isVoice ? cleaned : '',
    tags,
  };
}
