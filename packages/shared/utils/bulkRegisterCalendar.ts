// =============================================================================
// チーム予定のカレンダー型一括登録 (練習: 複数日選択 / 大会: 初日+日数) の純粋関数 - Swim Hub共通パッケージ
// mobile (components/teams/TeamBulkRegisterForm) と web (components/bulk-register/calendar) で共有する。
// =============================================================================

import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isValid,
  parseISO,
  startOfMonth,
} from "date-fns";
import { de, enUS, ja, ko, zhCN } from "date-fns/locale";
import type { Locale } from "date-fns";
import type { BulkRegisterInput } from "../api/teams/bulkRegister";
import type { SupportedLocale } from "./date";

const DATE_FNS_LOCALES: Record<SupportedLocale, Locale> = { ja, en: enUS, zh: zhCN, ko, de };

export const getDateFnsLocale = (locale: SupportedLocale): Locale => DATE_FNS_LOCALES[locale];

/** 曜日の見出し (日曜始まり)。2026-11-15 は日曜日 */
export function weekdayLabels(locale: SupportedLocale): string[] {
  const sunday = new Date(2026, 10, 15);
  return Array.from({ length: 7 }, (_, i) =>
    format(addDays(sunday, i), locale === "ja" || locale === "zh" ? "EEEEE" : "EEEEEE", {
      locale: DATE_FNS_LOCALES[locale],
    }),
  );
}

/** 練習の共通入力 / 日ごとの上書き入力 */
export interface PracticeFields {
  title: string;
  place: string;
  note: string;
  /** 「＋ メモ」を押してメモ欄を開いているか */
  noteOpen: boolean;
}

/** 追加予定の大会 (カレンダーで初日をタップして作る) */
export interface CompetitionDraft {
  id: string;
  /** 初日 (yyyy-MM-dd) */
  date: string;
  /** 開催日数 (1 なら単日) */
  days: number;
  title: string;
  place: string;
  /** 0: 短水路(25m), 1: 長水路(50m) */
  poolType: number;
  note: string;
  noteOpen: boolean;
}

/** 既存の予定 (登録済みの練習・大会) の有無を日付ごとに持つ */
export type ExistingScheduleMap = Record<string, { practice: boolean; competition: boolean }>;

export const EMPTY_PRACTICE_FIELDS: PracticeFields = {
  title: "",
  place: "",
  note: "",
  noteOpen: false,
};

export const toDateKey = (date: Date): string => format(date, "yyyy-MM-dd");

/**
 * 件数を丸数字で表す (①〜㊿)。「11月 6日」だと11月6日と読めてしまうため、
 * 月ごとの選択日数は「11月 ⑥」のように表示する。51 以上は (n) 表記。
 */
export function toCircledNumber(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32b1 + n - 36);
  return `(${n})`;
}

/** 大会の最終日 (yyyy-MM-dd)。days=1 なら初日と同じ */
export function competitionEndDate(date: string, days: number): string {
  const start = parseISO(date);
  if (!isValid(start)) return date;
  return toDateKey(addDays(start, Math.max(1, days) - 1));
}

/** 月カレンダーのセル: 先頭の空白 (null) + 当月の各日 */
export function buildMonthCells(month: Date): (Date | null)[] {
  const start = startOfMonth(month);
  const days = eachDayOfInterval({ start, end: endOfMonth(month) });
  return [...Array<null>(getDay(start)).fill(null), ...days];
}

/** その月の、指定した曜日 (0=日〜6=土) の日付一覧 */
export function datesOfWeekdayInMonth(month: Date, weekday: number): string[] {
  return eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
    .filter((d) => getDay(d) === weekday)
    .map(toDateKey);
}

/**
 * 曜日見出しのタップ: その月の同じ曜日がすべて選択済みなら外し、そうでなければ全部選ぶ。
 * 戻り値は日付順にソート済み。
 */
export function toggleWeekdayInMonth(selected: string[], month: Date, weekday: number): string[] {
  const targets = datesOfWeekdayInMonth(month, weekday);
  const set = new Set(selected);
  const allSelected = targets.length > 0 && targets.every((d) => set.has(d));
  for (const d of targets) {
    if (allSelected) set.delete(d);
    else set.add(d);
  }
  return [...set].sort();
}

/** 1日分の選択を切り替える (日付順にソート済みで返す) */
export function toggleDate(selected: string[], date: string): string[] {
  return selected.includes(date)
    ? selected.filter((d) => d !== date)
    : [...selected, date].sort();
}

/** 選択日を月ごとに数える (yyyy-MM の昇順) */
export function countByMonth(dates: string[]): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const m = d.slice(0, 7);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}

/** 登録済みの練習・大会から、日付ごとの予定の有無を作る (大会は開催期間の全日) */
export function buildExistingScheduleMap(
  practices: readonly { date: string }[],
  competitions: readonly { date: string; end_date?: string | null }[],
): ExistingScheduleMap {
  const map: ExistingScheduleMap = {};
  const mark = (date: string, kind: "practice" | "competition") => {
    const entry = (map[date] ??= { practice: false, competition: false });
    entry[kind] = true;
  };
  for (const p of practices) {
    if (p.date) mark(p.date.slice(0, 10), "practice");
  }
  for (const c of competitions) {
    const start = parseISO(c.date);
    if (!isValid(start)) continue;
    const end = c.end_date ? parseISO(c.end_date) : start;
    if (!isValid(end) || end < start) {
      mark(toDateKey(start), "competition");
      continue;
    }
    for (const d of eachDayOfInterval({ start, end })) mark(toDateKey(d), "competition");
  }
  return map;
}

/** その日を開催期間に含む追加予定の大会 (先に追加したもの優先) */
export function findDraftCovering(
  drafts: readonly CompetitionDraft[],
  date: string,
): CompetitionDraft | undefined {
  return drafts.find((c) => date >= c.date && date <= competitionEndDate(c.date, c.days));
}

/** 期間内に登録済みの大会、または他の追加予定の大会があるか */
export function rangeOverlapsCompetition(
  date: string,
  days: number,
  existing: ExistingScheduleMap,
  drafts: readonly CompetitionDraft[],
  excludeId?: string | null,
): boolean {
  const start = parseISO(date);
  if (!isValid(start)) return false;
  for (let i = 0; i < Math.max(1, days); i++) {
    const key = toDateKey(addDays(start, i));
    if (existing[key]?.competition) return true;
    const draft = findDraftCovering(drafts, key);
    if (draft && draft.id !== excludeId) return true;
  }
  return false;
}

/** 日ごとの上書きがあればそれを、なければ共通の内容を使う */
export function resolvePracticeFields(
  common: PracticeFields,
  override: PracticeFields | undefined,
): { title: string; place: string; note: string } {
  const pick = (key: "title" | "place" | "note") =>
    override?.[key].trim() ? override[key].trim() : common[key].trim();
  return { title: pick("title"), place: pick("place"), note: pick("note") };
}

/** 日ごとの上書きが1項目でも入っているか */
export const hasOverride = (o: PracticeFields | undefined): boolean =>
  !!o && (!!o.title.trim() || !!o.place.trim() || !!o.note.trim());

/** API に渡す入力を組み立てる */
export function buildBulkRegisterInput(
  selectedDates: readonly string[],
  common: PracticeFields,
  overrides: Readonly<Record<string, PracticeFields>>,
  drafts: readonly CompetitionDraft[],
): BulkRegisterInput {
  return {
    practices: [...selectedDates].sort().map((date) => {
      const f = resolvePracticeFields(common, overrides[date]);
      return { date, title: f.title || null, place: f.place || null, note: f.note || null };
    }),
    competitions: [...drafts]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((c) => ({
        date: c.date,
        end_date: c.days > 1 ? competitionEndDate(c.date, c.days) : null,
        title: c.title.trim() || null,
        place: c.place.trim() || null,
        pool_type: c.poolType,
        note: c.note.trim() || null,
      })),
  };
}
