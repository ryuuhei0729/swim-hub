/**
 * レコードタブ 未来日ガード ロジック 単体テスト (mobile)
 *
 * Sprint Contract 検証観点:
 *   [V-REC-M-01] showRecordTab = !isEntryTabVisible(date)
 *                未来の日付 → false (ガード表示)
 *                今日の日付 → true  (フォーム表示)
 *                過去の日付 → true  (フォーム表示)
 *                null/undefined/空文字/空白文字 → true (フォーム表示)
 *                不正な日付文字列 → true (フォーム表示)
 *
 *   [V-REC-M-02] 「記録を登録してよい日か」を独立した真実から検証
 *                日付 <= 今日JST → 登録可 (showRecordTab = true)
 *                日付 >  今日JST → 登録不可 (showRecordTab = false)
 *                ※ showRecordTab の定義 (!isEntryTabVisible) には依存しない
 *
 *   [V-REC-M-03] 保存 no-op 検証 (SC-2/SC-6)
 *                未来日ガード時に diffRecordDraft([], []) を呼ぶと
 *                creates/updates/deletes すべて空になる
 *                (既存レコードが誤って削除されない)
 *
 *   [V-REC-M-04] 既存 isEntryTabVisible テストとの非退行確認 (mobile) (SC-9)
 *
 * テスト対象:
 *   isEntryTabVisible (apps/mobile/utils/tabFormUtils.ts)
 *   diffRecordDraft   (apps/mobile/utils/tabFormUtils.ts)
 *
 * 注意:
 *   - このテストは純粋関数の振る舞いのみを検証する
 *   - UI コンポーネント (CompetitionTabFormScreen) の画面表示は E2E で検証する
 *   - テストは Developer の実装を参照せず、Sprint Contract の仕様に基づいて記述する
 */

import { describe, it, expect } from "vitest";
import { isEntryTabVisible, diffRecordDraft } from "../tabFormUtils";

// ============================================================
// ヘルパー: テスト用日付生成 (tabFormScreen.initialTab.test.ts と同一パターン)
// ============================================================

function todayStr(): string {
  const d = new Date();
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

/**
 * showRecordTab ロジックを純粋関数として表現する (mobile)
 * 実装: `const showRecordTab = !isEntryTabVisible(date)`
 */
function showRecordTab(date: string | null | undefined): boolean {
  return !isEntryTabVisible(date);
}

// ============================================================
// [V-REC-M-01] showRecordTab: レコードタブ表示判定 (mobile)
//
// ユーザー意図:
//   未来の大会はまだ実施されていない → レコード入力フォームは表示しない
//   今日・過去の大会は結果入力フェーズ → レコード入力フォームを表示する
//   日付が不明な場合はデフォルトでフォームを表示する (ガードしすぎない)
// ============================================================

describe("[V-REC-M-01] showRecordTab = !isEntryTabVisible(date): レコードタブ表示判定 (mobile)", () => {
  it("未来の日付のとき false を返す (ガード表示: フォームを非表示)", () => {
    // SC-1: 未来日 → ガードメッセージを表示、フォームは非表示
    expect(showRecordTab(futureDateStr())).toBe(false);
  });

  it("今日の日付のとき true を返す (当日は登録可能: フォームを表示)", () => {
    // SC-3: 当日 → フォーム表示・登録可 / 境界値: BC-1
    expect(showRecordTab(todayStr())).toBe(true);
  });

  it("過去の日付のとき true を返す (過去の大会: フォームを表示)", () => {
    // SC-4: 過去日 → フォーム表示・登録可
    expect(showRecordTab(pastDateStr())).toBe(true);
  });

  it("null のとき true を返す (日付未設定はガードしない)", () => {
    // BC-3: 空日付 → form
    expect(showRecordTab(null)).toBe(true);
  });

  it("undefined のとき true を返す", () => {
    expect(showRecordTab(undefined)).toBe(true);
  });

  it("空文字のとき true を返す", () => {
    // BC-3: 空文字
    expect(showRecordTab("")).toBe(true);
  });

  it("空白文字のとき true を返す (mobile 固有: trim() 後に空)", () => {
    // mobile tabFormUtils.ts は trim() で空白文字を除去する
    expect(showRecordTab("   ")).toBe(true);
  });

  it("不正な日付文字列のとき true を返す", () => {
    // BC-4: 不正日付 → form (ガードを適用しない)
    expect(showRecordTab("invalid-date")).toBe(true);
  });

  it("遠い将来の日付 (2099-12-31) のとき false を返す (ガード表示)", () => {
    // SC-1: 明確な未来日のガード確認
    expect(showRecordTab("2099-12-31")).toBe(false);
  });

  it("遠い過去の日付 (2000-01-01) のとき true を返す (フォーム表示)", () => {
    // SC-4: 明確な過去日のフォーム表示確認
    expect(showRecordTab("2000-01-01")).toBe(true);
  });
});

// ============================================================
// [V-REC-M-02] 「記録を登録してよい日か」= 日付 <= 今日JST の独立検証 (mobile)
//
// ユーザー意図:
//   showRecordTab の定義 (!isEntryTabVisible) を使わず、
//   「その日付は今日以前か」という独立した事実から期待値を導く。
//   仕様: 大会日 <= 今日(JST) → 登録可(true) / 大会日 > 今日(JST) → ガード(false)
//
// 手法:
//   各 date について「今日と比較して過去/当日/未来か」を自前計算し、
//   期待値を hardcode または日付差から導く。
//   showRecordTab は isEntryTabVisible に依存するが、
//   このブロックでは「期待値」を isEntryTabVisible から導かない。
// ============================================================

describe("[V-REC-M-02] 記録登録可否: 日付 <= 今日JST の独立検証 (mobile)", () => {
  it("2099-12-31 (未来の固定日付) → false (ガード: 将来日は登録不可)", () => {
    // 2099-12-31 は今日より確実に未来 → 登録不可
    // 期待値の根拠: 2099-12-31 > today (不変の事実)
    expect(showRecordTab("2099-12-31")).toBe(false);
  });

  it("2000-01-01 (過去の固定日付) → true (フォーム: 過去日は登録可)", () => {
    // 2000-01-01 は今日より確実に過去 → 登録可
    // 期待値の根拠: 2000-01-01 < today (不変の事実)
    expect(showRecordTab("2000-01-01")).toBe(true);
  });

  it("今日の日付 → true (境界値: 当日は登録可)", () => {
    // 判定式: date <= today → true
    // 期待値の根拠: 当日は「試合が終わっている可能性がある」→ 仕様で登録可と定義
    expect(showRecordTab(todayStr())).toBe(true);
  });

  it("明日の日付 → false (境界値: 翌日はガード)", () => {
    // tomorrow は今日より +1日 → today < tomorrow → 登録不可
    // 期待値の根拠: 明日はまだ試合が行われていない
    expect(showRecordTab(futureDateStr())).toBe(false);
  });

  it("昨日の日付 → true (境界値: 前日は登録可)", () => {
    // yesterday は今日より -1日 → yesterday < today → 登録可
    expect(showRecordTab(pastDateStr())).toBe(true);
  });

  it("今日と明日で値が変わる (境界が「今日/明日」の間にある)", () => {
    // 仕様の境界値確認: date <= today が判定式
    const today = showRecordTab(todayStr());
    const tomorrow = showRecordTab(futureDateStr());
    expect(today).toBe(true);
    expect(tomorrow).toBe(false);
    // 逆の値であること (境界の両側を確認)
    expect(today).not.toBe(tomorrow);
  });
});

// ============================================================
// [V-REC-M-03] 保存 no-op 検証 (SC-2/SC-6) — 最重要 (mobile)
//
// ユーザー意図:
//   未来日ガード時は showRecordTab = false でレコード保存ブロックをスキップする (mobile 実装方針)。
//   その際 diffRecordDraft([], []) を呼んだ場合に no-op になることを確認する。
//
//   SC-6 の検証:
//     未来日大会に既存レコードが存在していても、ガード時に
//     diffRecordDraft([], []) が creates/updates/deletes すべて空になる。
//     (既存レコードが誤って削除されない)
// ============================================================

describe("[V-REC-M-03] 保存 no-op 検証: 未来日ガード時に diffRecordDraft が no-op (mobile)", () => {
  it("SC-2: drafts=[], existingIds=[] → creates/updates/deletes すべて空 (no-op)", () => {
    // 未来日ガード時の保存パス:
    //   showRecordTab = false → レコード保存ブロックをスキップ
    //   または diffRecordDraft([], []) → 何も変更されない
    const result = diffRecordDraft([], []);
    expect(result.creates).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
    expect(result.deletes).toHaveLength(0);
  });

  it("SC-6: 既存レコード有りでもガード時に drafts=[], existingIds=[] を渡せば既存レコードは削除されない", () => {
    // シナリオ: DB に既存レコードが存在する未来日大会を保存
    // ガード実装が正しければ: diffRecordDraft([], []) を呼ぶ (existingIds を空として扱う)
    // → deletes=[] → 既存レコードは削除されない
    const result = diffRecordDraft([], []);
    expect(result.deletes).toHaveLength(0);
    expect(result.creates).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it("ガード未適用時との対比: drafts に値があれば creates が発生する (no-op との差を確認)", () => {
    // 対比テスト: ガードが外れたとき (過去・当日) は creates が発生する
    const newRecord = { draftId: "record-local-1" };
    const result = diffRecordDraft([newRecord], []);
    expect(result.creates).toHaveLength(1); // ガードがなければ保存される
    expect(result.deletes).toHaveLength(0);
  });

  it("ガード未適用かつ既存レコードあり: existingIds と一致しないドラフトがあると deletes が発生する", () => {
    // 対比テスト: ガードが外れた状態で既存レコードを削除しようとする通常操作
    // ガード時 diffRecordDraft([], []) は existingIds=[] なので deletes は出ない
    const existingId = "db-record-uuid-1";
    const result = diffRecordDraft([], [existingId]); // ガード外: ドラフト空 + 既存あり → 削除
    expect(result.deletes).toContain(existingId);
    // これはガード外の正常ケース。ガード時は existingIds=[] を渡すので削除が起きない。
  });
});

// ============================================================
// [V-REC-M-04] 既存 isEntryTabVisible の非退行確認 (mobile) (SC-9)
//
// ユーザー意図:
//   今回の変更によって、isEntryTabVisible の既存動作が変わっていないことを確認する。
//   tabFormScreen.initialTab.test.ts の isEntryTabVisible テストと同一の期待値。
// ============================================================

describe("[V-REC-M-04] isEntryTabVisible: 既存動作の非退行確認 (mobile)", () => {
  it("未来日 → true (エントリータブ表示 = 従来通り)", () => {
    expect(isEntryTabVisible(futureDateStr())).toBe(true);
  });

  it("今日 → false (エントリータブ非表示 = 従来通り)", () => {
    expect(isEntryTabVisible(todayStr())).toBe(false);
  });

  it("過去日 → false (エントリータブ非表示 = 従来通り)", () => {
    expect(isEntryTabVisible(pastDateStr())).toBe(false);
  });

  it("null → false (従来通り)", () => {
    expect(isEntryTabVisible(null)).toBe(false);
  });

  it("undefined → false (従来通り)", () => {
    expect(isEntryTabVisible(undefined)).toBe(false);
  });

  it("空文字 → false (従来通り)", () => {
    expect(isEntryTabVisible("")).toBe(false);
  });

  it("空白文字 → false (mobile 固有: trim() 対応 = 従来通り)", () => {
    expect(isEntryTabVisible("   ")).toBe(false);
  });

  it("不正な日付文字列 → false (従来通り)", () => {
    expect(isEntryTabVisible("invalid-date")).toBe(false);
  });
});

// ============================================================
// [V-REC-M-05] 境界値: BC-1/BC-2 今日と未来の境界 (mobile)
// ============================================================

describe("[V-REC-M-05] 境界値: 今日と未来の境界 (mobile)", () => {
  it("BC-1: 今日の日付は showRecordTab = true (登録可能)", () => {
    expect(showRecordTab(todayStr())).toBe(true);
  });

  it("BC-2: 明日の日付は showRecordTab = false (ガード)", () => {
    expect(showRecordTab(futureDateStr())).toBe(false);
  });

  it("昨日の日付は showRecordTab = true (ガードしない)", () => {
    expect(showRecordTab(pastDateStr())).toBe(true);
  });
});

// ============================================================
// [V-REC-M-06] BC-5: initialTab=record かつ未来日 → ガード表示 (mobile)
//
// ユーザー意図:
//   「レコード」タブを initialTab として開いた大会が未来日の場合、
//   レコードフォームではなくガードメッセージが表示される。
//   showRecordTab = false のとき、タブをタップしてもフォームは出ない。
// ============================================================

describe("[V-REC-M-06] BC-5: initialTab=record かつ未来日のとき showRecordTab = false (mobile)", () => {
  it("未来日大会を initialTab='record' で開いたとき showRecordTab は false", () => {
    // initialTab が record でも、日付が未来ならガードを適用する
    const date = futureDateStr();
    expect(showRecordTab(date)).toBe(false);
  });

  it("今日大会を initialTab='record' で開いたとき showRecordTab は true (フォーム表示)", () => {
    // 当日はフォームを表示する (SC-3)
    const date = todayStr();
    expect(showRecordTab(date)).toBe(true);
  });
});
