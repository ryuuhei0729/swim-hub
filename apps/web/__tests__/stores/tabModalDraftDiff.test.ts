/**
 * タブモーダル: ドラフト差分計算ロジック 単体テスト
 *
 * Sprint Contract 検証観点:
 *   [V-05] 編集: 子の追加/更新/削除の差分が正しく計算される
 *
 * テスト対象:
 *   computePracticeLogDiff (apps/web/utils/tabModalDiff.ts)
 *   computeEntryDiff       (apps/web/utils/tabModalDiff.ts)
 *   computeRecordDiff      (apps/web/utils/tabModalDiff.ts)
 *
 * ユーザー意図を表現するテスト方針:
 *   - 差分関数に「ドラフト状態」と「元DB状態の ID リスト」を渡す
 *   - toAdd / toUpdate / toDelete が意図通りの項目を含むか確認する
 *   - 実装の内部状態(isDbUuid等)に依存せず、ユーザー操作の結果を確認する
 */

import { describe, it, expect } from "vitest";
import {
  computePracticeLogDiff,
  computeEntryDiff,
  computeRecordDiff,
} from "../../utils/tabModalDiff";
import type { PracticeMenuFormData, EntryFormData, RecordFormDataInput } from "../../stores/types";

// ============================================================
// テスト用フィクスチャ
// ============================================================

const UUID_1 = "11111111-1111-1111-1111-111111111111";
const UUID_2 = "22222222-2222-2222-2222-222222222222";
const UUID_3 = "33333333-3333-3333-3333-333333333333";

function makePracticeLog(overrides: Partial<PracticeMenuFormData> = {}): PracticeMenuFormData {
  return {
    style: "Fr",
    swimCategory: "Swim",
    reps: 4,
    sets: 1,
    distance: 100,
    circleTime: 90,
    note: "",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<EntryFormData> = {}): EntryFormData {
  return {
    id: `temp-${Math.random()}`,
    styleId: "1",
    entryTime: 6000,
    note: "",
    isRelaying: false,
    ...overrides,
  };
}

function makeRecord(overrides: Partial<RecordFormDataInput & { id?: string }> = {}): RecordFormDataInput & { id?: string } {
  return {
    styleId: "1",
    time: 5500,
    isRelaying: false,
    splitTimes: [],
    ...overrides,
  };
}

// ============================================================
// [V-05-P1] 練習ログ差分計算
// ============================================================

describe("[V-05-P1] computePracticeLogDiff: 練習ログ差分計算", () => {
  it("空のドラフトと空の originalIds では差分がない", () => {
    const result = computePracticeLogDiff([], []);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
  });

  it("新規ログ (tempMenuId なし) は toAdd に含まれる", () => {
    // ユーザーが新しいメニューを追加した場合
    const newLog = makePracticeLog({ tempMenuId: undefined });
    const result = computePracticeLogDiff([newLog], []);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
  });

  it("新規ログ (tempMenuId が非UUID) は toAdd に含まれる", () => {
    // ドラフトID は "menu-1234" のような一時IDの場合
    const newLog = makePracticeLog({ tempMenuId: "menu-local-123" });
    const result = computePracticeLogDiff([newLog], []);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(0);
  });

  it("既存ログ (tempMenuId が DB UUID で originalIds に存在) は toUpdate に含まれる", () => {
    // ユーザーが既存ログを編集した場合
    const editedLog = makePracticeLog({ tempMenuId: UUID_1 });
    const result = computePracticeLogDiff([editedLog], [UUID_1]);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0].id).toBe(UUID_1);
    expect(result.toDelete).toHaveLength(0);
  });

  it("originalIds にあるがドラフトにないログは toDelete に含まれる", () => {
    // ユーザーが既存ログを削除した場合
    const result = computePracticeLogDiff([], [UUID_1, UUID_2]);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toContain(UUID_1);
    expect(result.toDelete).toContain(UUID_2);
    expect(result.toDelete).toHaveLength(2);
  });

  it("add/update/delete が混在するケース", () => {
    // UUID_1: 既存 → 編集 (toUpdate)
    // UUID_2: 既存 → 削除済み (toDelete)
    // 新規: ドラフトのみ (toAdd)
    const draftLogs = [
      makePracticeLog({ tempMenuId: UUID_1 }),  // 既存ログの編集
      makePracticeLog({ tempMenuId: undefined }), // 新規追加
    ];
    const result = computePracticeLogDiff(draftLogs, [UUID_1, UUID_2]);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0].id).toBe(UUID_1);
    expect(result.toDelete).toEqual([UUID_2]);
  });

  it("変更のない既存ログは toUpdate に含まれる (差分なし確認はDB層の責務)", () => {
    // ドラフトに同一UUIDが存在する場合、変更の有無にかかわらず toUpdate に入る
    const log = makePracticeLog({ tempMenuId: UUID_1 });
    const result = computePracticeLogDiff([log], [UUID_1]);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0].id).toBe(UUID_1);
  });
});

// ============================================================
// [V-05-C1] 大会エントリー差分計算
// ============================================================

describe("[V-05-C1] computeEntryDiff: 大会エントリー差分計算", () => {
  it("空のドラフトと空の originalIds では差分がない", () => {
    const result = computeEntryDiff([], []);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
  });

  it("id が非UUIDのエントリーは toAdd に含まれる", () => {
    // ユーザーが新規エントリーを追加した場合
    const newEntry = makeEntry({ id: "entry-local-1" });
    const result = computeEntryDiff([newEntry], []);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0].styleId).toBe("1");
  });

  it("id が DB UUID で originalIds に存在するエントリーは toUpdate に含まれる", () => {
    const editedEntry = makeEntry({ id: UUID_1, styleId: "5" });
    const result = computeEntryDiff([editedEntry], [UUID_1]);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0].id).toBe(UUID_1);
    expect(result.toDelete).toHaveLength(0);
  });

  it("originalIds にあるがドラフトにないエントリーは toDelete に含まれる", () => {
    // ユーザーが既存エントリーを削除した場合
    const result = computeEntryDiff([], [UUID_1]);
    expect(result.toDelete).toContain(UUID_1);
  });

  it("add/update/delete が混在するケース", () => {
    const draftEntries = [
      makeEntry({ id: UUID_1 }),          // 既存エントリーの編集
      makeEntry({ id: "entry-local-2" }), // 新規追加
    ];
    const result = computeEntryDiff(draftEntries, [UUID_1, UUID_2]);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toDelete).toEqual([UUID_2]);
  });

  it("3件追加・2件更新・1件削除の複雑なケース", () => {
    const draftEntries = [
      makeEntry({ id: UUID_1 }),           // update
      makeEntry({ id: UUID_2 }),           // update
      makeEntry({ id: "local-a" }),        // add
      makeEntry({ id: "local-b" }),        // add
      makeEntry({ id: "local-c" }),        // add
    ];
    // UUID_3 はドラフトに存在しない → delete
    const result = computeEntryDiff(draftEntries, [UUID_1, UUID_2, UUID_3]);
    expect(result.toAdd).toHaveLength(3);
    expect(result.toUpdate).toHaveLength(2);
    expect(result.toDelete).toEqual([UUID_3]);
  });
});

// ============================================================
// [V-05-C2] 大会レコード差分計算
// ============================================================

describe("[V-05-C2] computeRecordDiff: 大会レコード差分計算", () => {
  it("空のドラフトと空の originalIds では差分がない", () => {
    const result = computeRecordDiff([], []);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
  });

  it("id なし/非UUIDのレコードは toAdd に含まれる", () => {
    const newRecord = makeRecord({ id: undefined });
    const result = computeRecordDiff([newRecord], []);
    expect(result.toAdd).toHaveLength(1);
    // toAdd は id を含まない RecordFormDataInput
    expect(result.toAdd[0]).not.toHaveProperty("id");
  });

  it("id が DB UUID で originalIds に存在するレコードは toUpdate に含まれる", () => {
    const editedRecord = makeRecord({ id: UUID_1, time: 9999 });
    const result = computeRecordDiff([editedRecord], [UUID_1]);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0].id).toBe(UUID_1);
    expect(result.toUpdate[0].data.time).toBe(9999);
  });

  it("originalIds にあるがドラフトにないレコードは toDelete に含まれる", () => {
    const result = computeRecordDiff([], [UUID_1, UUID_2]);
    expect(result.toDelete).toContain(UUID_1);
    expect(result.toDelete).toContain(UUID_2);
  });

  it("add/update/delete が混在するケース", () => {
    const draftRecords = [
      makeRecord({ id: UUID_1 }),       // 既存レコードの編集
      makeRecord({ id: undefined }),    // 新規追加
    ];
    const result = computeRecordDiff(draftRecords, [UUID_1, UUID_2]);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toDelete).toEqual([UUID_2]);
  });
});

// ============================================================
// [V-09-WEB] 子INSERT失敗後の再試行時: 差分関数の再送可能性確認
// ============================================================

describe("[V-09-WEB] 親INSERT成功後の子INSERT失敗: 差分関数の再試行可能性", () => {
  it("子INSERT失敗後の再試行: ローカルIDのみのログは全件 toAdd に含まれる", () => {
    // シナリオ: 練習INSERT成功 → 練習ログINSERT失敗 → 再試行
    // 再試行時にもドラフトはローカルID保持 → 全件 toAdd として再送される
    const draftLogs = [
      makePracticeLog({ tempMenuId: "local-1" }),
      makePracticeLog({ tempMenuId: "local-2" }),
    ];
    const result = computePracticeLogDiff(draftLogs, []);
    expect(result.toAdd).toHaveLength(2);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
    // 親のINSERTはdiff関数の責務外: diff関数は子の差分のみを計算する
  });

  it("エントリーINSERT失敗後の再試行: ローカルIDのみのエントリーは全件 toAdd", () => {
    const draftEntries = [makeEntry({ id: "local-new-1" })];
    const result = computeEntryDiff(draftEntries, []);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
  });
});

// ============================================================
// [V-05-CW-record / C-R2-1] RecordLogFormState 型 → computeRecordDiff
//   useRecordLogForm が RecordLogEditData を RecordLogFormState に変換した後、
//   その FormState が computeRecordDiff の入力として正しく機能するか検証。
//   スナップショット型一致 (C-R2-2) の副次確認:
//     FormState の styleId は string、reactionTime は string — diff 関数がこれを処理できるか。
// ============================================================

describe("[V-05-CW-record / C-R2-1/C-R2-2] RecordLogFormState 型での computeRecordDiff 動作", () => {
  // FormState 由来の record (useRecordLogForm の変換後を模倣)
  function makeFormStateRecord(overrides: Partial<RecordFormDataInput & { id?: string }> = {}): RecordFormDataInput & { id?: string } {
    return {
      // styleId は FormState では string (number でなく)
      styleId: "5",
      time: 5432,
      isRelaying: false,
      splitTimes: [],
      // reactionTime は FormState では string (number|null でなく)
      reactionTime: "0.65",
      note: "",
      videoPath: null,
      ...overrides,
    };
  }

  it("DB UUID を持つ FormState レコードは toUpdate に含まれる (変更なし扱いでも diff 関数は通過する)", () => {
    const record = makeFormStateRecord({ id: UUID_1 });
    const result = computeRecordDiff([record], [UUID_1]);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0].id).toBe(UUID_1);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
  });

  it("originalRecordIds に含まれない UUID を持つレコードは toAdd に含まれる (重複INSERT防止確認)", () => {
    // originalRecordIds が全件正しく設定されていれば、既存レコードは toUpdate に入る。
    // 設定が不完全(単一IDのみ等)なら他のレコードが toAdd に入り重複INSERTが発生する。
    // C-NEW-1/C-R2-1 修正後は originalRecordIds が全件含むことを別途コードレビューで確認。
    const record = makeFormStateRecord({ id: UUID_2 });
    const result = computeRecordDiff([record], []); // originalIds が空 = フェッチ未設定の旧バグ再現
    expect(result.toAdd).toHaveLength(1); // 旧バグでは既存レコードが toAdd に入り重複INSERT
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
  });

  it("originalRecordIds が全件設定されていれば既存レコードは全て toUpdate に入り重複INSERTしない", () => {
    const records = [
      makeFormStateRecord({ id: UUID_1 }),
      makeFormStateRecord({ id: UUID_2 }),
      makeFormStateRecord({ id: UUID_3 }),
    ];
    const originalIds = [UUID_1, UUID_2, UUID_3];
    const result = computeRecordDiff(records, originalIds);
    expect(result.toAdd).toHaveLength(0); // 重複INSERTなし
    expect(result.toUpdate).toHaveLength(3);
    expect(result.toDelete).toHaveLength(0);
  });

  it("ドラフトから削除されたレコードは toDelete に含まれ DB から削除される", () => {
    // ユーザーがレコード2件中1件を削除した場合
    const remainingRecord = makeFormStateRecord({ id: UUID_1 });
    const originalIds = [UUID_1, UUID_2]; // UUID_2 をドラフトから削除
    const result = computeRecordDiff([remainingRecord], originalIds);
    expect(result.toDelete).toEqual([UUID_2]);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toAdd).toHaveLength(0);
  });

  it("id なし (新規) FormState レコードは toAdd に含まれ id フィールドは除外される", () => {
    const newRecord = makeFormStateRecord(); // id なし
    const result = computeRecordDiff([newRecord], []);
    expect(result.toAdd).toHaveLength(1);
    expect((result.toAdd[0] as unknown as Record<string, unknown>).id).toBeUndefined();
  });
});
