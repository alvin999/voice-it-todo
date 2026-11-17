import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Briefcase,
  Calendar,
  HeartPulse,
  Home,
  Lightbulb,
  Mail,
  Package,
  Phone,
  ShoppingCart,
  StickyNote,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { NoteIconId, IconFieldConfig, IconTemplateMap } from '../types';

export interface NoteIconMeta {
  id: NoteIconId;
  label: string;
  hint: string;
  Icon: LucideIcon;
  defaultFields: string[];
}

export const NOTE_ICON_META: NoteIconMeta[] = [
  { id: 'sticky-note', label: '一般便條', hint: '預設／一般待辦', Icon: StickyNote, defaultFields: [] },
  { id: 'shopping-cart', label: '採買補貨', hint: '買東西、超市、網購', Icon: ShoppingCart, defaultFields: ['品項', '數量', '購買通路或預算'] },
  { id: 'phone', label: '電話聯絡', hint: '打電話、聯繫、LINE', Icon: Phone, defaultFields: ['聯絡對象', '電話或帳號', '通話討論重點'] },
  { id: 'mail', label: '信件回信', hint: '寄信、回信、通知', Icon: Mail, defaultFields: ['收件對象', '主旨重點', '附件或截止時間'] },
  { id: 'calendar', label: '行程期限', hint: '預約、聚會、截止日', Icon: Calendar, defaultFields: ['日期時間', '地點', '行前準備事項'] },
  { id: 'briefcase', label: '工作任務', hint: '會議、簡報、提案、專案', Icon: Briefcase, defaultFields: ['專案項目', '負責人或合作對象', '交付成果與期限'] },
  { id: 'home', label: '居家事務', hint: '打掃、家務、家人', Icon: Home, defaultFields: ['空間或項目', '分工對象', '完成時間'] },
  { id: 'wrench', label: '修繕維護', hint: '維修、水電、檢查', Icon: Wrench, defaultFields: ['故障位置', '狀況描述', '師傅或聯絡資訊'] },
  { id: 'wallet', label: '財務繳費', hint: '帳單、銀行、轉帳、報帳', Icon: Wallet, defaultFields: ['繳費項目', '金額', '繳費期限或帳號'] },
  { id: 'heart-pulse', label: '醫療健康', hint: '看醫生、拿藥、運動', Icon: HeartPulse, defaultFields: ['科別或院所', '預約時間或診號', '注意事項或處方'] },
  { id: 'package', label: '包裹寄件', hint: '領包裹、寄貨、快遞', Icon: Package, defaultFields: ['寄件/取件編號', '快遞超商地點', '到貨期限'] },
  { id: 'book-open', label: '學習閱讀', hint: '看書、課程、筆記', Icon: BookOpen, defaultFields: ['章節或單元', '核心觀念', '實踐行動'] },
  { id: 'lightbulb', label: '靈感點子', hint: '想法、備忘、創意', Icon: Lightbulb, defaultFields: ['核心點子', '為什麼想做', '下一步探索'] },
];

export const TEMPLATE_ICON_META: NoteIconMeta[] = NOTE_ICON_META.filter(
  (item) => item.id !== 'sticky-note'
);

const ICON_MAP = new Map<NoteIconId, NoteIconMeta>(
  NOTE_ICON_META.map((item) => [item.id, item])
);

const STORAGE_TEMPLATES_KEY = 'voiceittodo_icon_templates_v1';

export function loadIconTemplates(): IconTemplateMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_TEMPLATES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as IconTemplateMap;
  } catch {
    return {};
  }
}

export function saveIconTemplates(map: IconTemplateMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_TEMPLATES_KEY, JSON.stringify(map));
  } catch {
    // 忽略儲存錯誤
  }
}

export function getIconFieldConfig(id: NoteIconId, map?: IconTemplateMap): IconFieldConfig {
  // 「一般便條」為預設自由輸入狀態，不套用欄位範本
  if (id === 'sticky-note') {
    return { enabled: false, fields: [] };
  }
  const currentMap = map ?? loadIconTemplates();
  const configured = currentMap[id];
  if (configured) {
    return configured;
  }
  const meta = getNoteIconMeta(id);
  return {
    enabled: false,
    fields: meta.defaultFields,
  };
}

export function buildFieldSkeleton(fields: string[]): string {
  if (!fields.length) return '';
  return fields.map((f) => `${f}：`).join('\n');
}

export function isNoteIconId(value: unknown): value is NoteIconId {
  return typeof value === 'string' && ICON_MAP.has(value as NoteIconId);
}

export function getNoteIconMeta(id?: NoteIconId): NoteIconMeta {
  if (id && ICON_MAP.has(id)) {
    return ICON_MAP.get(id)!;
  }
  return NOTE_ICON_META[0];
}
