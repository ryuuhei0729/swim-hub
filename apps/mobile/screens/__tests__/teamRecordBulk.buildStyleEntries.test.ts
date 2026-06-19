// QA Phase B: mobile 移植版 buildStyleEntriesFromExisting の検証。
// Web 正準と同じくリレー検出・累計算出・leg内/全体距離の自動判定 (split 変換) を確認する。
// 重点: leg境界・距離変換 (Contract Checklist #4, #6 編集モードのロード)。
import { describe, it, expect } from "vitest";
import {
  buildStyleEntriesFromExisting,
  ExistingRecord,
} from "../teamRecordBulk/buildStyleEntries";

function makeRecord(
  overrides: Partial<ExistingRecord> & { style_id: number; time: number },
): ExistingRecord {
  return {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    is_relaying: false,
    reaction_time: null,
    note: null,
    split_times: [],
    users: { id: "u1", name: "Swimmer" },
    ...overrides,
  };
}

const STYLES = [
  { id: 2, name_jp: "50m 自由形" },
  { id: 3, name_jp: "100m 自由形" },
  { id: 4, name_jp: "200m 自由形" },
  { id: 9, name_jp: "50m 平泳ぎ" },
  { id: 13, name_jp: "50m 背泳ぎ" },
  { id: 17, name_jp: "50m バタフライ" },
];

function makeRelay4x100Free(
  legSplits: Array<{ distance: number; split_time: number }[]>,
): ExistingRecord[] {
  const times = [57.0, 58.5, 57.8, 56.7];
  const flags = [false, true, true, true];
  return times.map((time, idx) => ({
    id: `r-${idx}`,
    user_id: `user-${idx}`,
    style_id: 3,
    time,
    is_relaying: flags[idx],
    reaction_time: null,
    note: null,
    split_times: legSplits[idx].map((st, j) => ({ id: `st-${idx}-${j}`, distance: st.distance, split_time: st.split_time })),
    users: { id: `user-${idx}`, name: `Swimmer ${idx + 1}` },
  }));
}

describe("[mobile] buildStyleEntriesFromExisting 基本", () => {
  it("空配列は空 StyleEntry を1つ返す", () => {
    const result = buildStyleEntriesFromExisting([], STYLES);
    expect(result).toHaveLength(1);
    expect(result[0].styleId).toBe("");
    expect(result[0].memberRecords).toHaveLength(0);
  });

  it("個人種目1件はそのまま", () => {
    const result = buildStyleEntriesFromExisting([makeRecord({ style_id: 2, time: 27.5 })], STYLES);
    expect(result[0].styleId).toBe(2);
    expect(result[0].relayEventId).toBeUndefined();
    expect(result[0].memberRecords[0].time).toBe(27.5);
  });
});

describe("[mobile] メドレーリレー検出と累計", () => {
  it("is_relaying パターン + メドレー styleId 順で 1 entry にまとまり累計が正しい", () => {
    const records = [
      makeRecord({ style_id: 13, time: 15.0, is_relaying: false }),
      makeRecord({ style_id: 9, time: 16.0, is_relaying: true }),
      makeRecord({ style_id: 17, time: 14.5, is_relaying: true }),
      makeRecord({ style_id: 2, time: 13.5, is_relaying: true }),
    ];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result).toHaveLength(1);
    expect(result[0].relayEventId).toBe("relay_4x50_medley");
    const mrs = result[0].memberRecords;
    expect(mrs.map((m) => m.cumulativeTimeSeconds)).toEqual([15.0, 31.0, 45.5, 59.0]);
  });
});

describe("[mobile] split の leg内距離⇄全体距離の自動判定 (Checklist #4)", () => {
  it("leg1 distance=100 (= legDist) は全体距離 200 に変換される (旧UI互換)", () => {
    const records = makeRelay4x100Free([[], [{ distance: 100, split_time: 58.5 }], [], []]);
    const entry = buildStyleEntriesFromExisting(records, STYLES).find((e) => e.relayEventId === "relay_4x100_free")!;
    const splits = entry.relaySplitTimes ?? [];
    expect(splits.find((s) => s.distance === 200)).toBeDefined();
    expect(splits.find((s) => s.distance === 200)!.splitTime).toBe(58.5);
    expect(splits.find((s) => s.distance === 100)).toBeUndefined();
  });

  it("leg1 distance=200 (> legDist, 全体距離) は変換なし", () => {
    const records = makeRelay4x100Free([[], [{ distance: 200, split_time: 115.5 }], [], []]);
    const entry = buildStyleEntriesFromExisting(records, STYLES).find((e) => e.relayEventId === "relay_4x100_free")!;
    const s = (entry.relaySplitTimes ?? []).find((x) => x.distance === 200);
    expect(s).toBeDefined();
    expect(s!.splitTime).toBe(115.5);
  });

  it("leg0 distance=100 (= legDist, offset0) は全体距離 100 のまま", () => {
    const records = makeRelay4x100Free([[{ distance: 100, split_time: 57.0 }], [], [], []]);
    const entry = buildStyleEntriesFromExisting(records, STYLES).find((e) => e.relayEventId === "relay_4x100_free")!;
    expect((entry.relaySplitTimes ?? []).find((s) => s.distance === 100)).toBeDefined();
  });
});

describe("[mobile] Phase1 誤検出防止", () => {
  it("is_relaying パターン一致でも detectRelayEventId が null なら個別扱い", () => {
    const records = [
      makeRecord({ style_id: 99, time: 10, is_relaying: false }),
      makeRecord({ style_id: 99, time: 11, is_relaying: true }),
      makeRecord({ style_id: 99, time: 12, is_relaying: true }),
      makeRecord({ style_id: 99, time: 13, is_relaying: true }),
    ];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result.find((e) => e.relayEventId)).toBeUndefined();
  });
});
