/**
 * タブモーダル: バリデーション観点テスト
 *
 * Sprint Contract 検証観点:
 *   [V-06] 一括保存前バリデーション — 不備タブにエラーバッジが付き、そのタブにフォーカスが移動する
 *   [V-ENTRY-TAB-VALIDATION] エントリータブ非表示時にエントリーを入力した場合の挙動
 *
 * NOTE: PracticeTabModal / CompetitionTabModal は "use client" コンポーネントのため
 *       jsdom 環境でのフルレンダリングは困難。
 *       バリデーション関連のロジックは isEntryTabVisible (純粋関数) で検証済み。
 *       本ファイルは追加の境界値・エッジケースを文書化する。
 *
 * 重要: バリデーション関数がコンポーネント内部に実装されているため、
 *       本ファイルは「検証観点の文書化」と「isEntryTabVisible 経由の間接検証」を担う。
 *       コンポーネント統合テストは Phase B のブラウザ実機検証 (Playwright) で行う。
 */

import { describe, it, expect } from "vitest";
import { isEntryTabVisible } from "../../utils/tabModalUtils";

// ============================================================
// [V-06-ENTRY-HIDDEN] エントリータブが非表示のとき
//
// ユーザー意図:
//   今日以前の大会を登録するとき、エントリータブが表示されない
//   → エントリー未入力でも保存できる (バリデーションエラーにならない)
// ============================================================

describe("[V-06-ENTRY-HIDDEN] エントリータブ非表示条件の境界値", () => {
  it("今日の日付 → エントリータブ非表示 (エラーバッジ対象外)", () => {
    const todayStr = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    expect(isEntryTabVisible(todayStr)).toBe(false);
    // isEntryTabVisible=false → EntryTabは表示されない → バリデーション対象外
  });

  it("大会日付が空文字 → エントリータブ非表示", () => {
    expect(isEntryTabVisible("")).toBe(false);
  });

  it("大会日付が未入力 → エントリータブ非表示", () => {
    expect(isEntryTabVisible(undefined)).toBe(false);
    expect(isEntryTabVisible(null)).toBe(false);
  });
});

// ============================================================
// [V-06-ENTRY-VISIBLE] エントリータブが表示されるとき
//
// ユーザー意図:
//   未来の大会を登録するとき、エントリータブが表示される
//   → エントリー入力は任意だが、バリデーション対象タブになる
// ============================================================

describe("[V-06-ENTRY-VISIBLE] エントリータブ表示条件の確認", () => {
  it("明日以降の日付 → エントリータブ表示 (バリデーション対象になる可能性あり)", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const futureDateStr = `${y}-${m}-${day}`;
    expect(isEntryTabVisible(futureDateStr)).toBe(true);
    // isEntryTabVisible=true → EntryTabが表示される → バリデーション対象
  });

  it("2099年末の日付 → エントリータブ表示", () => {
    expect(isEntryTabVisible("2099-12-31")).toBe(true);
  });
});

// ============================================================
// [V-06-DATE-CHANGE] 日付変更時のエントリータブ切替
//
// ユーザー意図:
//   大会タブで日付を「未来→今日以前」に変更したとき、
//   エントリータブが非表示になり、アクティブタブが自動的に切り替わる
//   (CompetitionTabModal の useEffect で実装済み)
//
// NOTE: このロジックは CompetitionTabModal 内の useEffect に依存するため
//       ブラウザ実機検証 (Playwright) で確認する。
//       ここでは基礎となる isEntryTabVisible の振る舞いを確認する。
// ============================================================

describe("[V-06-DATE-CHANGE] 日付変更時の isEntryTabVisible 遷移", () => {
  it("未来→今日 に変更すると isEntryTabVisible が true→false になる", () => {
    const futureDateStr = "2099-12-31";
    const todayStr = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    expect(isEntryTabVisible(futureDateStr)).toBe(true);
    expect(isEntryTabVisible(todayStr)).toBe(false);
    // この変化を CompetitionTabModal が検知して activeTab を切り替える
  });

  it("今日→未来 に変更すると isEntryTabVisible が false→true になる", () => {
    const todayStr = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    const futureDateStr = "2099-12-31";
    expect(isEntryTabVisible(todayStr)).toBe(false);
    expect(isEntryTabVisible(futureDateStr)).toBe(true);
  });
});
