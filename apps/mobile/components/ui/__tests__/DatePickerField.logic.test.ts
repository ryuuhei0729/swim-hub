// =============================================================================
// DatePickerField.logic.test.ts
// QA: DatePickerField のコアロジック検証 (Sprint Contract V-01〜V-07 / Boundary)
//
// DatePickerField.tsx の純粋ロジック（月グリッド生成 / 日付 disable 判定 /
// 初期表示月の決定 / トリガー表示値）を等価なピュア関数として抽出し検証する。
// RN コンポーネント (Modal 等) の描画は既存 RN モックに Modal が無いため
// レンダリングテストは行わず、ロジックを契約ベースで検証する。
// ロケール別フォーマットは実際の共通 formatDate を呼んで検証する。
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  startOfDay,
  format,
} from "date-fns";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";

// ------------------------------------------------------------------
// DatePickerField.tsx と等価なピュアロジック
// ------------------------------------------------------------------

/** buildMonthGrid (DatePickerField.tsx L48-54 と等価): 月初曜日分の先頭 null + 当月の各日 */
function buildMonthGrid(month: Date): (Date | null)[] {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });
  const leadingEmptyDays: null[] = Array(getDay(start)).fill(null);
  return [...leadingEmptyDays, ...days];
}

/** isDateDisabled (DatePickerField.tsx L88-94 と等価) */
function isDateDisabled(date: Date, minDate?: Date, maxDate?: Date): boolean {
  // min/max は日付のみで比較する（時刻が混入しても境界の日が選べるよう正規化）
  const day = startOfDay(date);
  if (minDate && day < startOfDay(minDate)) return true;
  if (maxDate && day > startOfDay(maxDate)) return true;
  return false;
}

/** 初期表示月の決定 (DatePickerField.tsx L73-79 / L84 と等価) */
function resolveInitialMonth(value: string, today: Date): Date {
  const selectedDate = value ? parseISO(value) : null;
  const hasValidSelection = !!selectedDate && isValid(selectedDate);
  return hasValidSelection
    ? startOfMonth(selectedDate as Date)
    : startOfMonth(today);
}

/** トリガー表示値の hasValidSelection 判定 (L73-74) */
function hasValidSelection(value: string): boolean {
  const d = value ? parseISO(value) : null;
  return !!d && isValid(d);
}

// ------------------------------------------------------------------
// V-01 / 月グリッド生成
// ------------------------------------------------------------------
describe("buildMonthGrid - 月グリッド生成", () => {
  it("2026-06 (6/1=月曜) は先頭に日曜分の null が1個 + 30日", () => {
    const grid = buildMonthGrid(parseISO("2026-06-15"));
    // 2026-06-01 は月曜 -> getDay=1 -> 先頭 null 1個
    const leading = grid.filter((d, i) => d === null && i < 1).length;
    expect(grid[0]).toBeNull();
    expect(leading).toBe(1);
    const realDays = grid.filter((d): d is Date => d !== null);
    expect(realDays).toHaveLength(30);
    expect(format(realDays[0], "yyyy-MM-dd")).toBe("2026-06-01");
    expect(format(realDays[realDays.length - 1], "yyyy-MM-dd")).toBe("2026-06-30");
  });

  it("月初が日曜の月は先頭 null が0個 (2026-02-01=日曜)", () => {
    const grid = buildMonthGrid(parseISO("2026-02-10"));
    expect(grid[0]).not.toBeNull();
    expect(format(grid[0] as Date, "yyyy-MM-dd")).toBe("2026-02-01");
    // 2026-02 は28日
    expect(grid.filter((d) => d !== null)).toHaveLength(28);
  });

  it("月初が土曜の月は先頭 null が6個 (2026-08-01=土曜)", () => {
    const grid = buildMonthGrid(parseISO("2026-08-01"));
    const leadingNulls = grid.slice(0, 6).every((d) => d === null);
    expect(leadingNulls).toBe(true);
    expect(grid[6]).not.toBeNull();
    expect(format(grid[6] as Date, "yyyy-MM-dd")).toBe("2026-08-01");
  });

  it("31日月 (2026-07) は31日分の Date を含む", () => {
    const grid = buildMonthGrid(parseISO("2026-07-20"));
    expect(grid.filter((d) => d !== null)).toHaveLength(31);
  });

  it("うるう年2月 (2024-02) は29日分の Date を含む", () => {
    const grid = buildMonthGrid(parseISO("2024-02-10"));
    expect(grid.filter((d) => d !== null)).toHaveLength(29);
  });
});

// ------------------------------------------------------------------
// V-05 / Boundary: min/max disable 判定
// ------------------------------------------------------------------
describe("isDateDisabled - min/max 制約", () => {
  const minDate = parseISO("2026-06-10");

  it("minDate より前は disabled", () => {
    expect(isDateDisabled(parseISO("2026-06-09"), minDate)).toBe(true);
  });

  it("minDate と同日は disabled でない (開始日=終了日を許可)", () => {
    expect(isDateDisabled(parseISO("2026-06-10"), minDate)).toBe(false);
  });

  it("minDate より後は disabled でない", () => {
    expect(isDateDisabled(parseISO("2026-06-11"), minDate)).toBe(false);
  });

  it("maxDate より後は disabled", () => {
    const maxDate = parseISO("2026-06-20");
    expect(isDateDisabled(parseISO("2026-06-21"), undefined, maxDate)).toBe(true);
  });

  it("min/max 未指定なら常に false", () => {
    expect(isDateDisabled(parseISO("1900-01-01"))).toBe(false);
    expect(isDateDisabled(parseISO("2999-12-31"))).toBe(false);
  });

  it("minDate に時刻成分があっても日付のみで比較される", () => {
    const minDateWithTime = new Date("2026-06-10T15:30:00");
    expect(isDateDisabled(parseISO("2026-06-10"), minDateWithTime)).toBe(false);
    expect(isDateDisabled(parseISO("2026-06-09"), minDateWithTime)).toBe(true);
  });

  it("maxDate に時刻成分があっても日付のみで比較される", () => {
    const maxDateWithTime = new Date("2026-06-20T15:30:00");
    expect(isDateDisabled(parseISO("2026-06-20"), undefined, maxDateWithTime)).toBe(false);
    expect(isDateDisabled(parseISO("2026-06-21"), undefined, maxDateWithTime)).toBe(true);
  });
});

// ------------------------------------------------------------------
// V-03 / V-04 / Boundary: 初期表示月の決定
// ------------------------------------------------------------------
describe("resolveInitialMonth - 初期表示月", () => {
  const today = parseISO("2026-06-16");

  it("有効な value があればその月初を返す (V-04 編集時の初期表示)", () => {
    const m = resolveInitialMonth("2026-03-22", today);
    expect(format(m, "yyyy-MM-dd")).toBe("2026-03-01");
  });

  it("route.params.date 起点でもその月が反映される (V-03)", () => {
    const m = resolveInitialMonth("2025-12-25", today);
    expect(format(m, "yyyy-MM-dd")).toBe("2025-12-01");
  });

  it("空文字なら today の月初 (新規作成)", () => {
    const m = resolveInitialMonth("", today);
    expect(format(m, "yyyy-MM-dd")).toBe("2026-06-01");
  });

  it("不正な値でもクラッシュせず today の月初にフォールバック (Boundary: isValid ガード)", () => {
    const m = resolveInitialMonth("not-a-date", today);
    expect(format(m, "yyyy-MM-dd")).toBe("2026-06-01");
  });

  it("空 date でもクラッシュしない", () => {
    expect(() => resolveInitialMonth("", today)).not.toThrow();
  });
});

// ------------------------------------------------------------------
// Boundary: hasValidSelection ガード (不正/空 date でクラッシュしない)
// ------------------------------------------------------------------
describe("hasValidSelection - 値の妥当性ガード", () => {
  it("正しい yyyy-MM-dd は true", () => {
    expect(hasValidSelection("2026-06-16")).toBe(true);
  });
  it("空文字は false", () => {
    expect(hasValidSelection("")).toBe(false);
  });
  it("不正文字列は false (クラッシュしない)", () => {
    expect(hasValidSelection("garbage")).toBe(false);
  });
  it("存在しない日付 (2026-02-30) は parseISO で false 扱い", () => {
    // parseISO("2026-02-30") は Invalid Date -> isValid false
    expect(hasValidSelection("2026-02-30")).toBe(false);
  });
});

// ------------------------------------------------------------------
// V-06 / ロケール別フォーマット (実際の共通 formatDate を使用)
// 月表示は "yearMonth"、トリガーは "numeric"
// ------------------------------------------------------------------
describe("ロケール別フォーマット (V-06)", () => {
  const target = "2026-06-16"; // 2026年6月

  const yearMonthCases: Record<SupportedLocale, string> = {
    ja: "2026年6月",
    en: "June 2026",
    zh: "2026年6月",
    ko: "2026년 6월",
    de: "Juni 2026",
  };

  (Object.keys(yearMonthCases) as SupportedLocale[]).forEach((loc) => {
    it(`yearMonth (月ヘッダ) が ${loc} でローカライズされる`, () => {
      expect(formatDate(target, "yearMonth", loc)).toBe(yearMonthCases[loc]);
    });
  });

  it("numeric (トリガー表示) は ja で yyyy/MM/dd", () => {
    expect(formatDate(target, "numeric", "ja")).toBe("2026/06/16");
  });

  it("numeric (トリガー表示) は de で dd.MM.yyyy", () => {
    expect(formatDate(target, "numeric", "de")).toBe("16.06.2026");
  });

  it("不正な日付文字列は formatDate が '-' を返す (トリガーがクラッシュしない)", () => {
    expect(formatDate("garbage", "numeric", "ja")).toBe("-");
    expect(formatDate("", "numeric", "ja")).toBe("-");
  });
});

// ------------------------------------------------------------------
// V-05 / Boundary: 終了日 minDate 制約の統合シナリオ
// CompetitionBasicFormScreen が minDate={parseISO(date)} を渡す挙動を再現
// ------------------------------------------------------------------
describe("終了日 minDate 制約の統合 (V-05)", () => {
  it("開始日 2026-06-10 のとき、終了日カレンダーで 6/9 は選択不可・6/10以降は可", () => {
    const startDate = "2026-06-10";
    const minDate = isValid(parseISO(startDate)) ? parseISO(startDate) : undefined;
    expect(isDateDisabled(parseISO("2026-06-09"), minDate)).toBe(true);
    expect(isDateDisabled(parseISO("2026-06-10"), minDate)).toBe(false);
    expect(isDateDisabled(parseISO("2026-06-15"), minDate)).toBe(false);
  });

  it("開始日が空/不正なら minDate=undefined となり終了日は無制約", () => {
    const startDate = "";
    const minDate = isValid(parseISO(startDate)) ? parseISO(startDate) : undefined;
    expect(minDate).toBeUndefined();
    expect(isDateDisabled(parseISO("2020-01-01"), minDate)).toBe(false);
  });
});
