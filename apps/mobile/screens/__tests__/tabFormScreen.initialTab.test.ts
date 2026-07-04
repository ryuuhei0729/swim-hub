/**
 * Mobile: タブフォームスクリーン 初期タブ・エントリータブ表示制御テスト
 *
 * Sprint Contract 検証観点 (仕様変更後):
 *   [V-ENTRY-TAB-M] 大会「エントリー」タブは日付が未来のときのみ表示される (mobile)
 *                   今日・過去・null/undefined/空文字 → 非表示 (false)
 *   [V-UNSAVED-M]   hasUnsavedChanges: 値が変わったとき true、変わらないとき false
 *
 * 注意: Phase A の「初期タブ最適化 (日付分岐)」は PM 最終裁定で廃止。
 *       練習タブの初期タブは常に "practice" (固定)。
 *       大会タブの初期タブは常に "competition" (固定)。
 *       代わりに「エントリータブの表示/非表示」制御を検証する。
 *
 * テスト対象:
 *   isEntryTabVisible  (apps/mobile/utils/tabFormUtils.ts)
 *   hasUnsavedChanges  (apps/mobile/utils/tabFormUtils.ts)
 *   diffPracticeLogDraft (apps/mobile/utils/tabFormUtils.ts)
 *   diffRecordDraft      (apps/mobile/utils/tabFormUtils.ts)
 */

import { describe, it, expect } from "vitest";
import {
  isEntryTabVisible,
  hasUnsavedChanges,
  diffPracticeLogDraft,
  diffRecordDraft,
} from "../../utils/tabFormUtils";

// ============================================================
// ヘルパー: テスト用日付生成
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

// ============================================================
// [V-ENTRY-TAB-M] isEntryTabVisible: 大会エントリータブ表示制御 (mobile)
// ============================================================

describe("[V-ENTRY-TAB-M] isEntryTabVisible: 大会エントリータブ表示制御 (mobile)", () => {
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

  it("空白文字のとき false を返す", () => {
    expect(isEntryTabVisible("   ")).toBe(false);
  });

  it("不正な日付文字列のとき false を返す", () => {
    expect(isEntryTabVisible("invalid-date")).toBe(false);
  });

  it("遠い将来の日付 (2099-12-31) のとき true を返す", () => {
    expect(isEntryTabVisible("2099-12-31")).toBe(true);
  });
});

// ============================================================
// [V-UNSAVED-M] hasUnsavedChanges: 未保存変更の判定 (mobile)
// ============================================================

describe("[V-UNSAVED-M] hasUnsavedChanges: 未保存変更の判定", () => {
  it("同一オブジェクトは false を返す (変更なし)", () => {
    const state = { date: "2024-06-01", title: "練習" };
    expect(hasUnsavedChanges(state, { ...state })).toBe(false);
  });

  it("値が変わると true を返す", () => {
    const snapshot = { date: "2024-06-01", title: "練習" };
    const current = { date: "2024-06-01", title: "変更後" };
    expect(hasUnsavedChanges(current, snapshot)).toBe(true);
  });

  it("ネストしたオブジェクトの変更を検出する", () => {
    const snapshot = { practice: { date: "2024-06-01", title: "" } };
    const current = { practice: { date: "2024-06-02", title: "" } };
    expect(hasUnsavedChanges(current, snapshot)).toBe(true);
  });

  it("配列の追加を変更として検出する", () => {
    const snapshot = { menus: [] as string[] };
    const current = { menus: ["menu-1"] };
    expect(hasUnsavedChanges(current, snapshot)).toBe(true);
  });

  it("配列が同じ内容なら変更なし", () => {
    const snapshot = { menus: ["menu-1"] };
    const current = { menus: ["menu-1"] };
    expect(hasUnsavedChanges(current, snapshot)).toBe(false);
  });

  it("null と undefined は変更なしにならない", () => {
    expect(hasUnsavedChanges(null, undefined)).toBe(true);
  });
});

// ============================================================
// [V-DIFF-LOG-M] diffPracticeLogDraft: 練習ログ差分計算 (mobile)
// ============================================================

describe("[V-DIFF-LOG-M] diffPracticeLogDraft: 練習ログ差分計算 (mobile)", () => {
  it("空のドラフトと空の existingIds では差分がない", () => {
    const result = diffPracticeLogDraft([], []);
    expect(result.creates).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
    expect(result.deletes).toHaveLength(0);
  });

  it("existingLogId なしのドラフトは creates に含まれる (新規追加)", () => {
    const drafts = [{ draftId: "local-1" }];
    const result = diffPracticeLogDraft(drafts, []);
    expect(result.creates).toContain("local-1");
    expect(result.updates).toHaveLength(0);
    expect(result.deletes).toHaveLength(0);
  });

  it("existingLogId ありのドラフトは updates に含まれる (既存ログの編集)", () => {
    const existingId = "db-log-uuid-1";
    const drafts = [{ draftId: "local-1", existingLogId: existingId }];
    const result = diffPracticeLogDraft(drafts, [existingId]);
    expect(result.updates).toContain(existingId);
    expect(result.creates).toHaveLength(0);
    expect(result.deletes).toHaveLength(0);
  });

  it("existingIds にあるがドラフトにない ID は deletes に含まれる (削除)", () => {
    const existingId = "db-log-uuid-1";
    const result = diffPracticeLogDraft([], [existingId]);
    expect(result.deletes).toContain(existingId);
    expect(result.creates).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it("create/update/delete が混在するケース", () => {
    const existingId1 = "db-log-1";
    const existingId2 = "db-log-2";
    const drafts = [
      { draftId: "local-new", existingLogId: undefined },     // create
      { draftId: "local-edit", existingLogId: existingId1 }, // update
      // existingId2 はドラフトに存在しない → delete
    ];
    const result = diffPracticeLogDraft(drafts, [existingId1, existingId2]);
    expect(result.creates).toContain("local-new");
    expect(result.updates).toContain(existingId1);
    expect(result.deletes).toContain(existingId2);
  });
});

// ============================================================
// [V-DIFF-RECORD-M] diffRecordDraft: レコード差分計算 (mobile)
// ============================================================

describe("[V-DIFF-RECORD-M] diffRecordDraft: レコード差分計算 (mobile)", () => {
  it("空のドラフトと空の existingIds では差分がない", () => {
    const result = diffRecordDraft([], []);
    expect(result.creates).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
    expect(result.deletes).toHaveLength(0);
  });

  it("existingRecordId なしのドラフトは creates に含まれる (新規レコード)", () => {
    const drafts = [{ draftId: "record-local-1" }];
    const result = diffRecordDraft(drafts, []);
    expect(result.creates).toContain("record-local-1");
  });

  it("existingRecordId ありのドラフトは updates に含まれる", () => {
    const existingId = "db-record-uuid-1";
    const drafts = [{ draftId: "local-1", existingRecordId: existingId }];
    const result = diffRecordDraft(drafts, [existingId]);
    expect(result.updates).toContain(existingId);
    expect(result.creates).toHaveLength(0);
  });

  it("existingIds にあるがドラフトにない ID は deletes に含まれる", () => {
    const existingId = "db-record-uuid-1";
    const result = diffRecordDraft([], [existingId]);
    expect(result.deletes).toContain(existingId);
  });
});
