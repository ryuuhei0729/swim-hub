import { describe, it, expect } from "vitest";
import {
  buildStyleEntriesFromExisting,
  ExistingRecord,
} from "../app/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/buildStyleEntries";

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
  { id: 1, name_jp: "25m 自由形", distance: 25 },
  { id: 2, name_jp: "50m 自由形", distance: 50 },
  { id: 3, name_jp: "100m 自由形", distance: 100 },
  { id: 9, name_jp: "50m 平泳ぎ", distance: 50 },
  { id: 13, name_jp: "50m 背泳ぎ", distance: 50 },
  { id: 17, name_jp: "50m バタフライ", distance: 50 },
];

describe("buildStyleEntriesFromExisting", () => {
  it("空配列の場合、空の StyleEntry を 1 つ返す", () => {
    const result = buildStyleEntriesFromExisting([], STYLES);
    expect(result).toHaveLength(1);
    expect(result[0].styleId).toBe("");
    expect(result[0].memberRecords).toHaveLength(0);
  });

  it("個人種目 1 件のみ: 区間タイムがそのまま表示される", () => {
    const records = [makeRecord({ style_id: 2, time: 27.5 })];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result).toHaveLength(1);
    expect(result[0].styleId).toBe(2);
    expect(result[0].relayEventId).toBeUndefined();
    expect(result[0].memberRecords[0].time).toBe(27.5);
  });

  describe("Phase 1+2: メドレーリレー検出", () => {
    it("is_relaying=[false,true,true,true] + メドレー styleId 順 → 1 つの StyleEntry にまとまる", () => {
      const records = [
        makeRecord({ style_id: 13, time: 15.0, is_relaying: false }),
        makeRecord({ style_id: 9, time: 16.0, is_relaying: true }),
        makeRecord({ style_id: 17, time: 14.5, is_relaying: true }),
        makeRecord({ style_id: 2, time: 13.5, is_relaying: true }),
      ];
      const result = buildStyleEntriesFromExisting(records, STYLES);
      expect(result).toHaveLength(1);
      expect(result[0].relayEventId).toBe("relay_4x50_medley");
      expect(result[0].memberRecords).toHaveLength(4);
    });

    it("累計タイムが正しく算出される", () => {
      const records = [
        makeRecord({ style_id: 13, time: 15.0, is_relaying: false }),
        makeRecord({ style_id: 9, time: 16.0, is_relaying: true }),
        makeRecord({ style_id: 17, time: 14.5, is_relaying: true }),
        makeRecord({ style_id: 2, time: 13.5, is_relaying: true }),
      ];
      const result = buildStyleEntriesFromExisting(records, STYLES);
      const mrs = result[0].memberRecords;
      expect(mrs[0].cumulativeTimeSeconds).toBe(15.0);
      expect(mrs[1].cumulativeTimeSeconds).toBe(31.0);
      expect(mrs[2].cumulativeTimeSeconds).toBe(45.5);
      expect(mrs[3].cumulativeTimeSeconds).toBe(59.0);
    });
  });

  describe("Phase 4: フリーリレー検出", () => {
    it("同一 styleId×4 + is_relaying パターン → フリーリレーとして復元", () => {
      const records = [
        makeRecord({ style_id: 2, time: 27.5, is_relaying: false }),
        makeRecord({ style_id: 2, time: 28.7, is_relaying: true }),
        makeRecord({ style_id: 2, time: 28.3, is_relaying: true }),
        makeRecord({ style_id: 2, time: 27.6, is_relaying: true }),
      ];
      const result = buildStyleEntriesFromExisting(records, STYLES);
      expect(result).toHaveLength(1);
      expect(result[0].relayEventId).toBe("relay_4x50_free");
      expect(result[0].memberRecords).toHaveLength(4);
    });
  });

  describe("個人種目とリレーの混在", () => {
    it("個人種目 + メドレーリレーが混在しても正しく分類される", () => {
      const individual = makeRecord({ style_id: 2, time: 30.0 });
      const relay = [
        makeRecord({ style_id: 13, time: 15.0, is_relaying: false }),
        makeRecord({ style_id: 9, time: 16.0, is_relaying: true }),
        makeRecord({ style_id: 17, time: 14.5, is_relaying: true }),
        makeRecord({ style_id: 2, time: 13.5, is_relaying: true }),
      ];
      const records = [individual, ...relay];
      const result = buildStyleEntriesFromExisting(records, STYLES);

      const relayEntry = result.find((e) => e.relayEventId);
      const individualEntry = result.find((e) => !e.relayEventId);
      expect(relayEntry).toBeDefined();
      expect(relayEntry!.relayEventId).toBe("relay_4x50_medley");
      expect(individualEntry).toBeDefined();
      expect(individualEntry!.memberRecords[0].time).toBe(30.0);
    });
  });

  describe("Phase 1 の誤検出防止", () => {
    it("is_relaying パターンが一致しても detectRelayEventId が null なら個別扱い", () => {
      const records = [
        makeRecord({ style_id: 99, time: 10.0, is_relaying: false }),
        makeRecord({ style_id: 99, time: 11.0, is_relaying: true }),
        makeRecord({ style_id: 99, time: 12.0, is_relaying: true }),
        makeRecord({ style_id: 99, time: 13.0, is_relaying: true }),
      ];
      const result = buildStyleEntriesFromExisting(records, STYLES);
      const relayEntry = result.find((e) => e.relayEventId);
      expect(relayEntry).toBeUndefined();
    });
  });
});
