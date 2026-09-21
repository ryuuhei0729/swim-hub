/**
 * mergeEntriesIntoRecords / isDefaultUntouchedRecord 単体テスト (mobile)
 *
 * Sprint Contract: CompetitionTabFormScreen のエントリータブで入力した種目を、
 * 記録タブを開いたときに自動で記録行として引き継ぐ (SC-6 自動引き継ぎ)。
 * 実装 (apps/mobile/utils/tabFormUtils.ts) から関数を実 import して検証する。
 * テスト内にロジックを再実装しない (過去に「テスト内にプロダクションロジックを
 * 再実装し、赤も緑も無意味になった」事故があるため)。
 */

import { describe, it, expect } from "vitest";
import {
  mergeEntriesIntoRecords,
  isDefaultUntouchedRecord,
  type RecordRowForMerge,
  type EntryRowForDefaultCheck,
} from "../tabFormUtils";

// ============================================================
// テスト用ファクトリ
// ============================================================

interface TestRecord extends RecordRowForMerge {
  draftId: string;
}

function makeRecord(overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    draftId: "draft-default",
    styleId: "",
    time: 0,
    timeDisplayValue: "",
    note: "",
    isRelaying: false,
    reactionTime: "",
    splitTimes: [],
    videoPath: null,
    videoThumbnailPath: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<EntryRowForDefaultCheck> = {}): EntryRowForDefaultCheck {
  return {
    styleId: "",
    entryTime: 0,
    entryTimeDisplayValue: "",
    note: "",
    isRelaying: false,
    ...overrides,
  };
}

function createRecordFactory(): (styleId: string) => TestRecord {
  let seq = 0;
  return (styleId: string) => makeRecord({ draftId: `new-${++seq}`, styleId });
}

const NO_MERGED = new Set<string>();

// ============================================================
// isDefaultUntouchedRecord
// ============================================================

describe("isDefaultUntouchedRecord", () => {
  const DEFAULT_STYLE = "style-1";

  it("全項目が初期値かつ styleId がデフォルトと一致するとき true", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(true);
  });

  it("existingRecordId がある (DB復元済み) → false", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE, existingRecordId: "rec-1" });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("time が 0 以外 → false", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE, time: 30.5 });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("timeDisplayValue が空文字以外 → false", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE, timeDisplayValue: "1:05.00" });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("note が空文字以外 → false", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE, note: "メモあり" });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("isRelaying が true → false", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE, isRelaying: true });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("reactionTime が空文字以外 → false", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE, reactionTime: "0.65" });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("splitTimes が空配列以外 → false", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE, splitTimes: [{ distance: 50, time: 30 }] });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("videoPath がある → false", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE, videoPath: "video/path.mp4" });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("videoThumbnailPath がある → false", () => {
    const record = makeRecord({ styleId: DEFAULT_STYLE, videoThumbnailPath: "thumb/path.jpg" });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("styleId がデフォルトと不一致 → false (ユーザーが種目を選び直した)", () => {
    const record = makeRecord({ styleId: "style-2" });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(false);
  });

  it("styleId='' (未取得) だが defaultStyleId は既に非空 (種目取得 effect が既存データ初期化 effect より先に解決した場合) → true (OR 条件の左辺 styleId==='' 単独で除外される。関数コメント L262-273 が明示する主眼のケース)", () => {
    const record = makeRecord({ styleId: "" });
    expect(isDefaultUntouchedRecord(record, DEFAULT_STYLE)).toBe(true);
  });
});

// ============================================================
// mergeEntriesIntoRecords
// ============================================================

describe("mergeEntriesIntoRecords", () => {
  const DEFAULT_STYLE = "style-default";

  it("空の記録配列 + エントリー2件 → 2行生成される", () => {
    const entries = [makeEntry({ styleId: "style-A" }), makeEntry({ styleId: "style-B" })];
    const result = mergeEntriesIntoRecords([], entries, DEFAULT_STYLE, createRecordFactory(), NO_MERGED);

    expect(result.records).toHaveLength(2);
    expect(result.records.map((r) => r.styleId).sort()).toEqual(["style-A", "style-B"]);
    expect(result.addedStyleIds.sort()).toEqual(["style-A", "style-B"]);
  });

  it("未編集デフォルト空行1件のみ + エントリー2件 → 2行に置換される (空行が残らない)", () => {
    const emptyRow = makeRecord({ draftId: "empty-1", styleId: DEFAULT_STYLE });
    const entries = [makeEntry({ styleId: "style-A" }), makeEntry({ styleId: "style-B" })];

    const result = mergeEntriesIntoRecords(
      [emptyRow],
      entries,
      DEFAULT_STYLE,
      createRecordFactory(),
      NO_MERGED,
    );

    expect(result.records).toHaveLength(2);
    expect(result.records.some((r) => r.draftId === "empty-1")).toBe(false);
    expect(result.records.map((r) => r.styleId).sort()).toEqual(["style-A", "style-B"]);
  });

  it("既に同じ styleId の記録行がある → 追加しない (重複しない)", () => {
    const existing = makeRecord({ draftId: "existing-1", styleId: "style-A", time: 30 });
    const entries = [makeEntry({ styleId: "style-A" }), makeEntry({ styleId: "style-B" })];

    const result = mergeEntriesIntoRecords(
      [existing],
      entries,
      DEFAULT_STYLE,
      createRecordFactory(),
      NO_MERGED,
    );

    expect(result.records).toHaveLength(2);
    expect(result.records.filter((r) => r.styleId === "style-A")).toHaveLength(1);
    // 既存行 (time=30) は上書きされていない
    expect(result.records.find((r) => r.styleId === "style-A")).toBe(existing);
    expect(result.addedStyleIds).toEqual(["style-B"]);
  });

  it("alreadyMergedStyleIds に含まれる styleId は追加しない (削除行の復活防止)", () => {
    const entries = [makeEntry({ styleId: "style-A" }), makeEntry({ styleId: "style-B" })];
    const alreadyMerged = new Set(["style-A"]);

    const result = mergeEntriesIntoRecords([], entries, DEFAULT_STYLE, createRecordFactory(), alreadyMerged);

    expect(result.records.map((r) => r.styleId)).toEqual(["style-B"]);
    expect(result.addedStyleIds).toEqual(["style-B"]);
  });

  it("addedStyleIds が正しく返る", () => {
    const entries = [makeEntry({ styleId: "style-A" }), makeEntry({ styleId: "style-B" })];
    const result = mergeEntriesIntoRecords([], entries, DEFAULT_STYLE, createRecordFactory(), NO_MERGED);

    expect(result.addedStyleIds.sort()).toEqual(["style-A", "style-B"]);
  });

  it("追加すべきものが無いとき、records は引数と同一参照を返す (無限ループ防止)", () => {
    const existing = makeRecord({ draftId: "existing-1", styleId: "style-A" });
    const records = [existing];
    const entries = [makeEntry({ styleId: "style-A" })];

    const result = mergeEntriesIntoRecords(records, entries, DEFAULT_STYLE, createRecordFactory(), NO_MERGED);

    expect(result.records).toBe(records);
    expect(result.addedStyleIds).toEqual([]);
  });

  it("エントリーが空 (追加対象なし) のときも records は同一参照を返す", () => {
    const records = [makeRecord({ draftId: "r-1", styleId: DEFAULT_STYLE })];
    const result = mergeEntriesIntoRecords(records, [], DEFAULT_STYLE, createRecordFactory(), NO_MERGED);

    expect(result.records).toBe(records);
    expect(result.addedStyleIds).toEqual([]);
  });

  it("未編集エントリー行 (isDefaultUntouchedEntry) は無視される", () => {
    const untouchedEntry = makeEntry({ styleId: DEFAULT_STYLE }); // entryTime=0, note="" 等
    const result = mergeEntriesIntoRecords(
      [],
      [untouchedEntry],
      DEFAULT_STYLE,
      createRecordFactory(),
      NO_MERGED,
    );

    expect(result.records).toEqual([]);
    expect(result.addedStyleIds).toEqual([]);
  });

  it("DB 復元済みの記録行 (existingRecordId あり) を削除・上書きしない", () => {
    const restored = makeRecord({
      draftId: "restored-1",
      styleId: "style-A",
      existingRecordId: "rec-db-1",
      time: 45.2,
    });
    const entries = [makeEntry({ styleId: "style-A" }), makeEntry({ styleId: "style-B" })];

    const result = mergeEntriesIntoRecords(
      [restored],
      entries,
      DEFAULT_STYLE,
      createRecordFactory(),
      NO_MERGED,
    );

    // 既存の DB 復元行はそのまま残り (isSingleDefaultRow 判定にも掛からない)、
    // 不足している style-B のみが追加される
    expect(result.records).toContainEqual(restored);
    expect(result.records.find((r) => r.existingRecordId === "rec-db-1")).toBe(restored);
    expect(result.addedStyleIds).toEqual(["style-B"]);
  });

  it("元の配列を破壊的に変更しない", () => {
    const existing = makeRecord({ draftId: "r-1", styleId: "style-A" });
    const records = [existing];
    const originalLength = records.length;
    const originalRef = records[0];
    const entries = [makeEntry({ styleId: "style-A" }), makeEntry({ styleId: "style-B" })];

    mergeEntriesIntoRecords(records, entries, DEFAULT_STYLE, createRecordFactory(), NO_MERGED);

    expect(records).toHaveLength(originalLength);
    expect(records[0]).toBe(originalRef);
  });
});
