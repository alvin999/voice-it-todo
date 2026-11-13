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
import type { NoteIconId } from '../types';

export interface NoteIconMeta {
  id: NoteIconId;
  label: string;
  hint: string;
  Icon: LucideIcon;
}

export const NOTE_ICON_META: NoteIconMeta[] = [
  { id: 'sticky-note', label: '一般便條', hint: '預設／一般待辦', Icon: StickyNote },
  { id: 'shopping-cart', label: '採買補貨', hint: '買東西、超市、網購', Icon: ShoppingCart },
  { id: 'phone', label: '電話聯絡', hint: '打電話、聯繫、LINE', Icon: Phone },
  { id: 'mail', label: '信件回信', hint: '寄信、回信、通知', Icon: Mail },
  { id: 'calendar', label: '行程期限', hint: '預約、聚會、截止日', Icon: Calendar },
  { id: 'briefcase', label: '工作任務', hint: '會議、簡報、提案、專案', Icon: Briefcase },
  { id: 'home', label: '居家事務', hint: '打掃、家務、家人', Icon: Home },
  { id: 'wrench', label: '修繕維護', hint: '維修、水電、檢查', Icon: Wrench },
  { id: 'wallet', label: '財務繳費', hint: '帳單、銀行、轉帳、報帳', Icon: Wallet },
  { id: 'heart-pulse', label: '醫療健康', hint: '看醫生、拿藥、運動', Icon: HeartPulse },
  { id: 'package', label: '包裹寄件', hint: '領包裹、寄貨、快遞', Icon: Package },
  { id: 'book-open', label: '學習閱讀', hint: '看書、課程、筆記', Icon: BookOpen },
  { id: 'lightbulb', label: '靈感點子', hint: '想法、備忘、創意', Icon: Lightbulb },
];

const ICON_MAP = new Map<NoteIconId, NoteIconMeta>(
  NOTE_ICON_META.map((item) => [item.id, item])
);

export function isNoteIconId(value: unknown): value is NoteIconId {
  return typeof value === 'string' && ICON_MAP.has(value as NoteIconId);
}

export function getNoteIconMeta(id?: NoteIconId): NoteIconMeta {
  if (id && ICON_MAP.has(id)) {
    return ICON_MAP.get(id)!;
  }
  return NOTE_ICON_META[0];
}
