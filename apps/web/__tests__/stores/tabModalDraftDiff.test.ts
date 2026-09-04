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
import { isDefaultUntouchedEntry } from "../../utils/tabModalDiff";

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

// NOTE: `toUpdate[0]!` / `toAdd[0]!` を多用する。各テストは直前に `toHaveLength(1)` で
// 件数を確認済みで、その範囲内のインデックスのみアクセスしている。

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
    expect(result.toUpdate[0]!.id).toBe(UUID_1);
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
    expect(result.toUpdate[0]!.id).toBe(UUID_1);
    expect(result.toDelete).toEqual([UUID_2]);
  });

  it("変更のない既存ログは toUpdate に含まれる (差分なし確認はDB層の責務)", () => {
    // ドラフトに同一UUIDが存在する場合、変更の有無にかかわらず toUpdate に入る
    const log = makePracticeLog({ tempMenuId: UUID_1 });
    const result = computePracticeLogDiff([log], [UUID_1]);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.id).toBe(UUID_1);
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
    expect(result.toAdd[0]!.styleId).toBe("1");
  });

  it("id が DB UUID で originalIds に存在するエントリーは toUpdate に含まれる", () => {
    const editedEntry = makeEntry({ id: UUID_1, styleId: "5" });
    const result = computeEntryDiff([editedEntry], [UUID_1]);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.id).toBe(UUID_1);
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
    expect(result.toUpdate[0]!.id).toBe(UUID_1);
    expect(result.toUpdate[0]!.data.time).toBe(9999);
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
    expect(result.toUpdate[0]!.id).toBe(UUID_1);
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

// ============================================================
// [V-01〜V-05-WEB] isDefaultUntouchedEntry — 未編集デフォルトエントリー行の判定
//
// Sprint Contract 検証観点 (バグ: 未来大会でエントリータブ未操作のまま保存すると
// 25m Fr の未編集デフォルト行まで登録されてしまう):
//   [V-01] エントリータブ未操作のまま保存 → エントリーは0件
//   [V-02] 種目・タイム・メモ・リレーいずれかを編集した行は保存される
//   [V-03] 複数行のうち未編集デフォルト行のみ除外、編集済み行は保存 (行数無関係の per-row フィルタ)
//   [V-04] 種目だけ変更しタイム空のまま → シードタイム未定エントリーとして保存される
//   [V-05] 編集モードの既存エントリーは、値がデフォルトと一致していても除外されない
//
// テスト対象: isDefaultUntouchedEntry (apps/web/utils/tabModalDiff.ts)
//
// 注意:
//   - web の EntryDraft は existingEntryId を持たず、id が DB UUID かどうか (isDbUuid) で
//     「新規行か既存DB行か」を判定する (computeEntryDiff と同じ規約)。
//   - このテストは実装をローカルに再定義しない。期待値はすべて仕様から手で記述する。
//   - 呼び出し側での使用イメージ (CompetitionTabModal.tsx handleSave 内、実装済み):
//       const entriesToSave = entries.filter(
//         (e) => !isDefaultUntouchedEntry(e, defaultStyleId),
//       );
// ============================================================

const DEFAULT_STYLE_ID_WEB = "1"; // styles[0]?.id?.toString() 相当 (先頭種目)

/** isDefaultUntouchedEntry に渡す想定のエントリー行 (web EntryDraft 相当)。 */
interface EntryDraftFixture {
  id: string;
  styleId: string;
  entryTime: number;
  entryTimeDisplayValue: string;
  note: string;
  isRelaying: boolean;
}

/** 未編集のデフォルト行 (id は非UUIDのローカルID = 新規行を表す)。 */
function makeUntouchedDefaultEntryWeb(
  overrides: Partial<EntryDraftFixture> = {},
): EntryDraftFixture {
  return {
    id: "entry-1",
    styleId: DEFAULT_STYLE_ID_WEB,
    entryTime: 0,
    entryTimeDisplayValue: "",
    note: "",
    isRelaying: false,
    ...overrides,
  };
}

// フィクスチャ自体の健全性確認 (production コード非依存。it.todo が有効化されるまでの
// unused-var 対策も兼ねる)。
describe("テストフィクスチャ: makeUntouchedDefaultEntryWeb", () => {
  it("デフォルト値は id=非UUID(新規行), styleId=デフォルト種目, 他は空/0/false を返す", () => {
    const entry = makeUntouchedDefaultEntryWeb();
    expect(entry).toEqual({
      id: "entry-1",
      styleId: DEFAULT_STYLE_ID_WEB,
      entryTime: 0,
      entryTimeDisplayValue: "",
      note: "",
      isRelaying: false,
    });
  });

  it("overrides で個別フィールドを上書きできる", () => {
    const entry = makeUntouchedDefaultEntryWeb({ note: "メモ" });
    expect(entry.note).toBe("メモ");
    expect(entry.styleId).toBe(DEFAULT_STYLE_ID_WEB);
  });
});

describe("isDefaultUntouchedEntry — 単一行の判定 (web)", () => {
  it("未編集デフォルト行 (styleId=デフォルト, entryTime=0, displayValue='', note='', isRelaying=false, id=非UUID) は true (除外される)", () => {
    const entry = makeUntouchedDefaultEntryWeb();
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(true);
  });

  it("[V-04] 種目のみデフォルトから変更した行 (styleId が defaultStyleId と不一致) は false (保存対象・シードタイム未定エントリー)", () => {
    const entry = makeUntouchedDefaultEntryWeb({ styleId: "2" });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(false);
  });

  it("[V-02] タイムのみ入力した行 (entryTime>0 かつ displayValue 非空、styleId はデフォルトのまま) は false (保存対象)", () => {
    const entry = makeUntouchedDefaultEntryWeb({
      entryTime: 65.2,
      entryTimeDisplayValue: "1:05.20",
    });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(false);
  });

  it("[V-02] メモのみ入力した行 (note 非空、他はデフォルトのまま) は false (保存対象)", () => {
    const entry = makeUntouchedDefaultEntryWeb({ note: "自己ベスト更新目標" });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(false);
  });

  it("[V-02] isRelaying のみ true にした行 (他はデフォルトのまま) は false (保存対象)", () => {
    const entry = makeUntouchedDefaultEntryWeb({ isRelaying: true });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(false);
  });
});

describe("isDefaultUntouchedEntry — 既存 DB エントリーの非退行確認 (web)", () => {
  it("[V-05] id が DB UUID (既存行) の場合、他の値がすべてデフォルトと一致していても false (誤って保存除外・削除されない)", () => {
    // 既存編集行がたまたま「未編集デフォルト」と同じ値に見えるケース
    // (例: ユーザーが一度入力してから全部消して保存した既存行)。
    // id が isDbUuid(true) であるという事実だけで除外対象から外れなければならない。
    const entry = makeUntouchedDefaultEntryWeb({ id: "11111111-1111-1111-1111-111111111111" });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(false);
  });
});

describe("isDefaultUntouchedEntry — 境界値 (web)", () => {
  it("entryTimeDisplayValue が空白のみ ('   ') の行は空文字と同等に扱われ true (trim() 前提)", () => {
    const entry = makeUntouchedDefaultEntryWeb({ entryTimeDisplayValue: "   " });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(true);
  });

  it("note が空白のみ ('   ') の行は空文字と同等に扱われ true (trim() 前提)", () => {
    const entry = makeUntouchedDefaultEntryWeb({ note: "   " });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(true);
  });

  it("デフォルト styleId に手動で戻した行は区別できず true (仕様上の既知の限界。値ベース判定のため意図的に除外される)", () => {
    // 値ベースの純粋関数は「一度も触られていない」と「他の値に変更後デフォルトへ戻した」を
    // 区別できない。PM 確定の仕様により、この false negative (誤って除外) は許容する。
    const entry = makeUntouchedDefaultEntryWeb(); // 見た目上は case1 と同一
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(true);
  });

  it("styles 未取得で defaultStyleId='' かつ styleId='' の行 (初期状態) は true (除外される)", () => {
    const entry = makeUntouchedDefaultEntryWeb({ styleId: "" });
    expect(isDefaultUntouchedEntry(entry, "")).toBe(true);
  });

  it("entryTime が負数の行 (異常値) は false (0 と等価でないため保存対象・上位バリデーションに委ねる)", () => {
    const entry = makeUntouchedDefaultEntryWeb({ entryTime: -1 });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID_WEB)).toBe(false);
  });
});

describe("isDefaultUntouchedEntry — 複数行 per-row フィルタ適用 (web)", () => {
  it("[V-03] 1行のみ (未編集デフォルト) → filter 適用後の配列は空 (保存0件)", () => {
    const entries = [makeUntouchedDefaultEntryWeb()];
    const result = entries.filter((e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID_WEB));
    expect(result).toHaveLength(0);
  });

  it("[V-03] 3行 (先頭のみ未編集デフォルト、2/3行目は編集済み) → filter 適用後は編集済み2行のみ残る (順序維持)", () => {
    const entries = [
      makeUntouchedDefaultEntryWeb(), // 1行目: 未編集デフォルト → 除外
      makeUntouchedDefaultEntryWeb({ id: "entry-2", styleId: "2", entryTime: 60, entryTimeDisplayValue: "1:00.00" }),
      makeUntouchedDefaultEntryWeb({ id: "entry-3", styleId: "3", note: "メモ" }),
    ];
    const result = entries.filter((e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID_WEB));
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.styleId)).toEqual(["2", "3"]);
  });

  it("[V-03] 全行が未編集デフォルト (同一 styleId で重複) → filter 適用後は空 (0件保存)", () => {
    const entries = [makeUntouchedDefaultEntryWeb(), makeUntouchedDefaultEntryWeb({ id: "entry-2" })];
    const result = entries.filter((e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID_WEB));
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// [V-05 非退行の保証] isDefaultUntouchedEntry フィルタ → computeEntryDiff 連結
//
// web の handleSave は元々 entryFormData を無条件で onSave に渡す設計 (entries.length に
// よるガードは存在しない) だが、mobile 側で Reviewer Critical (effectiveEntries.length > 0
// ガードによる delete 抜け) が見つかったため、web でも同種の退行が無いことを
// フィルタ→computeEntryDiff の連結で明示的に保証する。
// ============================================================

describe("isDefaultUntouchedEntry → computeEntryDiff 連結 (web)", () => {
  it("[V-05 非退行の保証] 編集モードで既存エントリーを全削除し未編集の空行のみ残して保存 → 全既存エントリーが toDelete に含まれる", () => {
    // シナリオ: 編集画面で既存2エントリーの行を両方削除し、
    // フォームには未編集の空行 (isDefaultUntouchedEntry=true) だけが残った状態で保存する。
    const originalEntryIds = [UUID_1, UUID_2];
    const draftEntries = [makeUntouchedDefaultEntryWeb({ id: "entry-1" })];

    // Step 1: CompetitionTabModal.tsx handleSave と同じ per-row フィルタ
    const effectiveDraftEntries = draftEntries.filter(
      (e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID_WEB),
    );
    expect(effectiveDraftEntries).toHaveLength(0); // 未編集行はフィルタで除外される

    // Step 2: フィルタ後の行を EntryFormData に変換 (handleSave と同一ロジック)
    const entryFormData: EntryFormData[] = effectiveDraftEntries.map((e) => ({
      id: e.id,
      styleId: e.styleId,
      entryTime: e.entryTime,
      note: e.note,
      isRelaying: e.isRelaying,
    }));

    // Step 3: computeEntryDiff に渡す (useDashboardHandlers.ts の一括保存ハンドラーと同一)
    const result = computeEntryDiff(entryFormData, originalEntryIds);

    // フィルタ後 entryFormData=[] でも、既存2件は「フォームから消えた」として全件 toDelete される
    expect(result.toAdd).toEqual([]);
    expect(result.toUpdate).toEqual([]);
    expect(result.toDelete).toEqual([UUID_1, UUID_2]);
  });

  it("[V-05 非退行の保証・対比] 編集済み行が1件残っていれば、その既存エントリーは toDelete されず toUpdate される", () => {
    // 対比ケース: 未編集の空行に加えて、既存 UUID_1 を編集した行も残っている場合、
    // UUID_1 は toUpdate、UUID_2 のみ toDelete される。
    const originalEntryIds = [UUID_1, UUID_2];
    const draftEntries = [
      makeUntouchedDefaultEntryWeb({ id: "entry-new" }), // 未編集の新規空行 → 除外される
      makeUntouchedDefaultEntryWeb({
        id: UUID_1,
        styleId: "5",
        entryTime: 3000,
        entryTimeDisplayValue: "30.00",
      }), // 既存エントリーの編集 → 残る
    ];

    const effectiveDraftEntries = draftEntries.filter(
      (e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID_WEB),
    );
    expect(effectiveDraftEntries).toHaveLength(1);

    const entryFormData: EntryFormData[] = effectiveDraftEntries.map((e) => ({
      id: e.id,
      styleId: e.styleId,
      entryTime: e.entryTime,
      note: e.note,
      isRelaying: e.isRelaying,
    }));

    const result = computeEntryDiff(entryFormData, originalEntryIds);

    expect(result.toAdd).toEqual([]);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.id).toBe(UUID_1);
    expect(result.toDelete).toEqual([UUID_2]);
  });
});
