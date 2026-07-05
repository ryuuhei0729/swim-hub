/**
 * タブモーダル: エントリータブ表示制御ロジック 単体テスト
 *
 * Sprint Contract 検証観点 (仕様変更後):
 *   [V-ENTRY-TAB] 大会「エントリー」タブは日付が未来のときのみ表示される
 *                 今日・過去・null/undefined/空文字 → 非表示 (false)
 *
 * 注意: Phase A の「初期タブ最適化 (日付分岐)」は PM 最終裁定で廃止。
 *       練習モーダルの初期タブは常に "practice"。
 *       大会モーダルの初期タブは常に "competition"。
 *       代わりに「エントリータブの表示/非表示」制御を検証する。
 *
 * テスト対象:
 *   isEntryTabVisible (apps/web/utils/tabModalUtils.ts)
 *   isDateTodayOrPast (apps/web/utils/tabModalUtils.ts)
 */

import { describe, it, expect } from "vitest";
import { isEntryTabVisible, isDateTodayOrPast } from "../../utils/tabModalUtils";

// ============================================================
// ヘルパー: テスト用日付生成
// ============================================================

function todayStr(): string {
  const d = new Date();
  // ローカル日付を YYYY-MM-DD 形式で返す (parseISO と一致させる)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pastDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function futureDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ============================================================
// [V-ENTRY-TAB] isEntryTabVisible: エントリータブ表示判定
//
// ユーザー意図:
//   過去・当日の大会は結果入力フェーズ → エントリーは不要
//   未来の大会のみエントリー受付中 → タブを表示
// ============================================================

describe("[V-ENTRY-TAB] isEntryTabVisible: 大会エントリータブ表示制御", () => {
  it("未来の日付のとき true を返す (エントリータブ表示)", () => {
    expect(isEntryTabVisible(futureDateStr())).toBe(true);
  });

  it("今日の日付のとき false を返す (エントリータブ非表示)", () => {
    expect(isEntryTabVisible(todayStr())).toBe(false);
  });

  it("過去の日付のとき false を返す (エントリータブ非表示)", () => {
    expect(isEntryTabVisible(pastDateStr())).toBe(false);
  });

  it("null のとき false を返す (日付未設定はエントリー非表示)", () => {
    expect(isEntryTabVisible(null)).toBe(false);
  });

  it("undefined のとき false を返す", () => {
    expect(isEntryTabVisible(undefined)).toBe(false);
  });

  it("空文字のとき false を返す", () => {
    expect(isEntryTabVisible("")).toBe(false);
  });

  it("不正な日付文字列のとき false を返す", () => {
    expect(isEntryTabVisible("invalid-date")).toBe(false);
  });

  it("遠い将来の日付 (2099-12-31) のとき true を返す", () => {
    expect(isEntryTabVisible("2099-12-31")).toBe(true);
  });

  it("遠い過去の日付 (2000-01-01) のとき false を返す", () => {
    expect(isEntryTabVisible("2000-01-01")).toBe(false);
  });
});

// ============================================================
// [V-DATE-PAST] isDateTodayOrPast: 今日以前判定
//
// ユーザー意図:
//   過去・当日の大会 = 記録入力フェーズ
//   未来の大会 = エントリー受付フェーズ
// ============================================================

describe("[V-DATE-PAST] isDateTodayOrPast: 今日以前判定", () => {
  it("今日の日付のとき true を返す", () => {
    expect(isDateTodayOrPast(todayStr())).toBe(true);
  });

  it("過去の日付のとき true を返す", () => {
    expect(isDateTodayOrPast(pastDateStr())).toBe(true);
  });

  it("未来の日付のとき false を返す", () => {
    expect(isDateTodayOrPast(futureDateStr())).toBe(false);
  });

  it("null のとき false を返す", () => {
    expect(isDateTodayOrPast(null)).toBe(false);
  });

  it("undefined のとき false を返す", () => {
    expect(isDateTodayOrPast(undefined)).toBe(false);
  });

  it("不正な日付文字列のとき false を返す", () => {
    expect(isDateTodayOrPast("not-a-date")).toBe(false);
  });
});

// ============================================================
// [V-ENTRY-TAB-COMPLEMENT] isEntryTabVisible と isDateTodayOrPast の補完関係
//
// ユーザー意図:
//   有効な日付では isEntryTabVisible と isDateTodayOrPast は常に逆になる
//   (エントリー表示 ⟺ 記録入力フェーズでない)
// ============================================================

describe("[V-ENTRY-TAB-COMPLEMENT] 有効な日付では2関数の結果が逆になる", () => {
  const validDates = [futureDateStr(), todayStr(), pastDateStr(), "2024-01-01", "2099-06-30"];

  for (const date of validDates) {
    it(`date="${date}" で isEntryTabVisible と isDateTodayOrPast が補完関係`, () => {
      // null/undefined のケースは除外 (両方false になりうる)
      // 有効日付の場合: 片方が true ⟺ もう片方が false
      const entry = isEntryTabVisible(date);
      const todayOrPast = isDateTodayOrPast(date);
      // XOR: 両方 true または両方 false にはならない
      // ただし今日の場合: isEntryTabVisible=false, isDateTodayOrPast=true → OK
      // 未来の場合: isEntryTabVisible=true, isDateTodayOrPast=false → OK
      expect(entry && todayOrPast, `"${date}": 両方 true になってはいけない`).toBe(false);
    });
  }
});
