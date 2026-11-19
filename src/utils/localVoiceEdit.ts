import type { Todo, VoiceEditSuggestion } from '../types';

export type LocalVoiceEditResult =
  | { matched: true; suggestion: VoiceEditSuggestion }
  | { matched: false; reason?: string };

const SCOPE_PREFIX = '(?:(標題|脈絡|備註)(?:裡的|中的|的|裡|中)\\s*)?';

function stripQuotes(text: string): string {
  return text.replace(/^[「」『』""''\s]+|[「」『』""''\s]+$/g, '');
}

function removePhrase(source: string, target: string): string {
  return source
    .split(target)
    .join('')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n +/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 在未啟用 AI 金鑰時，於本機解析常見中文語音修改指令（覆寫欄位、詞彙替換、刪除詞彙）。
 */
export function parseLocalVoiceEdit(
  todo: Pick<Todo, 'title' | 'contextNote' | 'tags' | 'icon'>,
  instruction: string
): LocalVoiceEditResult {
  const cleaned = instruction.trim().replace(/[。！!？?，,]+$/, '').trim();
  if (!cleaned) return { matched: false };

  // 1. 指定欄位覆寫
  const titleOverwriteMatch = cleaned.match(
    /^(?:把)?標題(?:改成|改為|換成|設為|變成)[:：]?\s*(.+)$/
  );
  if (titleOverwriteMatch) {
    const nextTitle = stripQuotes(titleOverwriteMatch[1]);
    if (nextTitle) {
      return {
        matched: true,
        suggestion: {
          title: nextTitle,
          contextNote: todo.contextNote,
          tags: todo.tags,
          icon: todo.icon,
          summary: '已依本機規則修改標題（可於下方微調）',
        },
      };
    }
  }

  const contextOverwriteMatch = cleaned.match(
    /^(?:把)?(?:脈絡|備註)(?:改成|改為|換成|設為|變成)[:：]?\s*(.+)$/
  );
  if (contextOverwriteMatch) {
    const nextContext = stripQuotes(contextOverwriteMatch[1]);
    if (nextContext) {
      return {
        matched: true,
        suggestion: {
          title: todo.title,
          contextNote: nextContext,
          tags: todo.tags,
          icon: todo.icon,
          summary: '已依本機規則修改脈絡備註（可於下方微調）',
        },
      };
    }
  }

  // 2. 詞彙替換
  const replaceRegex = new RegExp(
    `^(?:把)?${SCOPE_PREFIX}(.+?)(?:改成|改為|換成|替換成|修正為)\\s*(.+)$`
  );
  const replaceMatch = cleaned.match(replaceRegex);
  if (replaceMatch) {
    const scope = replaceMatch[1];
    const from = stripQuotes(replaceMatch[2]);
    const to = stripQuotes(replaceMatch[3]);

    if (from) {
      const checkTitle = !scope || scope === '標題';
      const checkContext = !scope || scope === '脈絡' || scope === '備註';

      const hasInTitle = checkTitle && todo.title.includes(from);
      const hasInContext = checkContext && todo.contextNote.includes(from);

      if (hasInTitle || hasInContext) {
        const nextTitle = hasInTitle ? todo.title.split(from).join(to) : todo.title;
        const nextContext = hasInContext
          ? todo.contextNote.split(from).join(to)
          : todo.contextNote;

        return {
          matched: true,
          suggestion: {
            title: nextTitle,
            contextNote: nextContext,
            tags: todo.tags,
            icon: todo.icon,
            summary: `已將「${from}」改為「${to}」（可於下方微調）`,
          },
        };
      }

      return {
        matched: false,
        reason: `卡片中找不到「${from}」，請確認辨識字詞或直接編輯`,
      };
    }
  }

  // 3. 詞彙刪除
  const deleteSuffixRegex = new RegExp(
    `^(?:把)?${SCOPE_PREFIX}(.+?)(?:刪掉|刪除|拿掉|移除)$`
  );
  const deletePrefixRegex = new RegExp(
    `^(?:刪掉|刪除|拿掉|移除)\\s*${SCOPE_PREFIX}(.+)$`
  );

  const deleteMatch =
    cleaned.match(deletePrefixRegex) ?? cleaned.match(deleteSuffixRegex);
  if (deleteMatch) {
    const scope = deleteMatch[1];
    const target = stripQuotes(deleteMatch[2]);

    if (target) {
      const checkTitle = !scope || scope === '標題';
      const checkContext = !scope || scope === '脈絡' || scope === '備註';

      const hasInTitle = checkTitle && todo.title.includes(target);
      const hasInContext = checkContext && todo.contextNote.includes(target);

      if (hasInTitle || hasInContext) {
        const nextTitle = hasInTitle ? removePhrase(todo.title, target) : todo.title;
        const nextContext = hasInContext
          ? removePhrase(todo.contextNote, target)
          : todo.contextNote;

        return {
          matched: true,
          suggestion: {
            title: nextTitle,
            contextNote: nextContext,
            tags: todo.tags,
            icon: todo.icon,
            summary: `已移除「${target}」（可於下方微調）`,
          },
        };
      }

      return {
        matched: false,
        reason: `卡片中找不到「${target}」，請確認辨識字詞`,
      };
    }
  }

  // 4. 其餘一般補充語句
  return { matched: false };
}
