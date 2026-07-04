/**
 * レコードタブ 未来日ガード ロジック 単体テスト (web)
 *
 * Sprint Contract 検証観点:
 *   [V-REC-01] showRecordTab = !isEntryTabVisible(date)
 *              未来の日付 → false (ガード表示)
 *              今日の日付 → true  (フォーム表示)
 *              過去の日付 → true  (フォーム表示)
 *              null/undefined/空文字 → true (フォーム表示)
 *              不正な日付文字列 → true (フォーム表示)
 *
 *   [V-REC-02] 「記録を登録してよい日か」を独立した真実から検証
 *              日付 <= 今日JST → 登録可 (showRecordTab = true)
 *              日付 >  今日JST → 登録不可 (showRecordTab = false)
 *              ※ showRecordTab の定義 (!isEntryTabVisible) には依存しない
 *
 *   [V-REC-03] 保存 no-op 検証 (SC-2/SC-6)
 *              未来日ガード時に records:[], originalRecordIds:[] を渡した場合
 *              computeRecordDiff が toAdd/toUpdate/toDelete すべて空になる
 *              (既存レコードが誤って DELETE されない)
 *
 *   [V-REC-04] 既存 isEntryTabVisible テストとの非退行確認 (SC-9)
 *
 * テスト対象:
 *   isEntryTabVisible  (apps/web/utils/tabModalUtils.ts)
 *   computeRecordDiff  (apps/web/utils/tabModalDiff.ts)
 *
 * 注意:
 *   - このテストは純粋関数の振る舞いのみを検証する
 *   - UI コンポーネント (CompetitionTabModal) のレンダリングは E2E で検証する
 *   - テストは Developer の実装を参照せず、Sprint Contract の仕様に基づいて記述する
 */

import { describe, it, expect } from "vitest";
import { isEntryTabVisible } from "../../utils/tabModalUtils";
import { computeRecordDiff } from "../../utils/tabModalDiff";

// ============================================================
// ヘルパー: テスト用日付生成 (tabModalInitialTab.test.ts と同一パターン)
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
 * showRecordTab ロジックを純粋関数として表現する
 * 実装: `const showRecordTab = !isEntryTabVisible(date)`
 */
function showRecordTab(date: string | null | undefined): boolean {
  return !isEntryTabVisible(date);
}

// ============================================================
// [V-REC-01] showRecordTab: レコードタブ表示判定
//
// ユーザー意図:
//   未来の大会はまだ実施されていない → レコード入力フォームは表示しない
//   今日・過去の大会は結果入力フェーズ → レコード入力フォームを表示する
//   日付が不明な場合はデフォルトでフォームを表示する (ガードしすぎない)
// ============================================================

describe("[V-REC-01] showRecordTab = !isEntryTabVisible(date): レコードタブ表示判定 (web)", () => {
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
// [V-REC-02] 「記録を登録してよい日か」= 日付 <= 今日JST の独立検証
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

describe("[V-REC-02] 記録登録可否: 日付 <= 今日JST の独立検証 (web)", () => {
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
    // today は今日 → today <= today → 登録可
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
    // 今日は true、明日は false → 境界はその間
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
// [V-REC-03] 保存 no-op 検証 (SC-2/SC-6) — 最重要
//
// ユーザー意図:
//   未来日ガード時は records:[], originalRecordIds:[] を onSave に渡す (web 実装方針)。
//   この状態で computeRecordDiff を呼ぶと、
//   toAdd/toUpdate/toDelete すべてが空 = no-op であることを確認する。
//
//   SC-6 の検証:
//     未来日大会に既存レコードが存在していても、ガード時に渡す
//     originalIds=[] は「ガードがかかっているので差分比較をしない」という意味。
//     computeRecordDiff([], []) は既存レコードの DELETE を発行しない。
//
//   この保証がないと、ガード実装の不具合で既存レコードが誤削除されるリスクがある。
// ============================================================

describe("[V-REC-03] 保存 no-op 検証: 未来日ガード時に computeRecordDiff が no-op (web)", () => {
  it("SC-2: records=[], originalRecordIds=[] → toAdd/toUpdate/toDelete すべて空 (no-op)", () => {
    // 未来日ガード時の保存パス:
    //   onSave({ records: [], originalRecordIds: [] }) が呼ばれる
    //   computeRecordDiff([], []) → 何も変更されない
    const result = computeRecordDiff([], []);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
  });

  it("SC-6: 既存レコード有り(originalIds)でもガード時に records=[], originalIds=[] を渡せば既存レコードは削除されない", () => {
    // シナリオ: DB に UUID_1 のレコードが存在する未来日大会を保存
    // ガード実装が正しければ: onSave({ records: [], originalRecordIds: [] }) を呼ぶ
    // ※ originalRecordIds=[] は「DB に何もない」ではなく「ガードなので差分しない」という意図
    // computeRecordDiff([], []) → toDelete=[] → 既存レコードは削除されない
    const result = computeRecordDiff([], []);
    expect(result.toDelete).toHaveLength(0);
    // 追加確認: toAdd も toUpdate も空
    expect(result.toAdd).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
  });

  it("ガード未適用時との対比: records に値があれば toAdd が発生する (no-op との差を確認)", () => {
    // 対比テスト: ガードが外れたとき (過去・当日) は toAdd が発生する
    // これにより「ガード時 records=[] → no-op」が意味のある検証であることを示す
    const newRecord = {
      styleId: "1",
      time: 5500,
      isRelaying: false,
      splitTimes: [],
    };
    const result = computeRecordDiff([newRecord], []);
    expect(result.toAdd).toHaveLength(1); // ガードがなければ保存される
    expect(result.toDelete).toHaveLength(0);
  });

  it("ガード未適用かつ既存レコードあり: originalIds と一致しないドラフトがあると toDelete が発生する", () => {
    // 対比テスト: ガードが外れた状態で既存レコードを削除しようとする通常操作
    // ガード時 computeRecordDiff([], []) は originalIds=[] なので toDelete は出ない
    const UUID_1 = "11111111-1111-1111-1111-111111111111";
    const result = computeRecordDiff([], [UUID_1]); // ガード外: ドラフト空 + 既存あり → 削除
    expect(result.toDelete).toContain(UUID_1);
    // これはガード外の正常ケース。ガード時は originalIds=[] を渡すので削除が起きない。
  });
});

// ============================================================
// [V-REC-04] 既存 isEntryTabVisible の非退行確認 (SC-9)
//
// ユーザー意図:
//   今回の変更 (showRecordTab の追加) によって、
//   isEntryTabVisible の既存動作が変わっていないことを確認する。
//   tabModalInitialTab.test.ts の isEntryTabVisible テストと同一の期待値。
// ============================================================

describe("[V-REC-04] isEntryTabVisible: 既存動作の非退行確認 (web)", () => {
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

  it("不正な日付文字列 → false (従来通り)", () => {
    expect(isEntryTabVisible("invalid-date")).toBe(false);
  });
});

// ============================================================
// [V-REC-05] 境界値: BC-1/BC-2 今日と未来の境界 (web)
//
// ユーザー意図:
//   BC-1: 今日は「登録可能」の側 (showRecordTab = true)
//   BC-2: 未来は「ガード」の側 (showRecordTab = false)
//   判定境界: 大会日 <= 今日(JST) → フォーム / > 今日(JST) → ガード
// ============================================================

describe("[V-REC-05] 境界値: 今日と未来の境界 (web)", () => {
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
