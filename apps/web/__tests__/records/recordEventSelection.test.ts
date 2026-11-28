/**
 * 大会記録の代理入力 - 開く種目の URL 表現 (?style= / ?relay=) と種目一覧カードの純粋関数
 */
import { describe, it, expect } from "vitest";
import {
  buildRecordEventPath,
  buildRecordListPath,
  isEntryOfSelection,
  parseRecordEventSelection,
} from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/recordEventSelection";
import {
  countEntryUsersByStyleId,
  groupConsecutive,
} from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/styleListCards";
import type { StyleEntry } from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/buildStyleEntries";

describe("parseRecordEventSelection", () => {
  it("?style= は個人種目、?relay= はリレー種目として解釈する", () => {
    expect(parseRecordEventSelection({ style: "12" })).toEqual({ kind: "individual", styleId: 12 });
    expect(parseRecordEventSelection({ relay: "relay_4x100_medley" })).toEqual({
      kind: "relay",
      relayEventId: "relay_4x100_medley",
    });
  });

  it("クエリが無ければ種目一覧 (null)", () => {
    expect(parseRecordEventSelection({})).toBeNull();
  });

  it("解釈できない値は種目一覧として扱う (数値でない style・未知のリレー・多重指定・0)", () => {
    expect(parseRecordEventSelection({ style: "abc" })).toBeNull();
    expect(parseRecordEventSelection({ style: "1.5" })).toBeNull();
    expect(parseRecordEventSelection({ style: "0" })).toBeNull();
    expect(parseRecordEventSelection({ style: ["2", "3"] })).toBeNull();
    expect(parseRecordEventSelection({ relay: "relay_4x400_free" })).toBeNull();
  });
});

describe("buildRecordEventPath / buildRecordListPath", () => {
  it("種目一覧と、種目を開いた URL を組み立てる (parse と往復できる)", () => {
    expect(buildRecordListPath("t1", "c1")).toBe("/teams/t1/competitions/c1/records");
    expect(buildRecordEventPath("t1", "c1", { kind: "individual", styleId: 9 })).toBe(
      "/teams/t1/competitions/c1/records?style=9",
    );
    const relayPath = buildRecordEventPath("t1", "c1", {
      kind: "relay",
      relayEventId: "relay_4x50_free",
    });
    expect(relayPath).toBe("/teams/t1/competitions/c1/records?relay=relay_4x50_free");
    const query = Object.fromEntries(new URLSearchParams(relayPath.split("?")[1]));
    expect(parseRecordEventSelection(query)).toEqual({
      kind: "relay",
      relayEventId: "relay_4x50_free",
    });
  });
});

describe("isEntryOfSelection", () => {
  const relayEntry: StyleEntry = {
    id: "r",
    styleId: 2,
    styleName: "",
    relayEventId: "relay_4x50_free",
    memberRecords: [],
  };
  const individualEntry: StyleEntry = { id: "i", styleId: 2, styleName: "", memberRecords: [] };

  it("リレーのレグは個人種目と同じ style_id でも、個人種目の組には含めない", () => {
    expect(isEntryOfSelection(relayEntry, { kind: "individual", styleId: 2 })).toBe(false);
    expect(isEntryOfSelection(individualEntry, { kind: "individual", styleId: 2 })).toBe(true);
    expect(isEntryOfSelection(relayEntry, { kind: "relay", relayEventId: "relay_4x50_free" })).toBe(
      true,
    );
    expect(isEntryOfSelection(relayEntry, { kind: "relay", relayEventId: "relay_4x50_medley" })).toBe(
      false,
    );
  });
});

describe("種目一覧カードの補助関数", () => {
  it("countEntryUsersByStyleId は style_id ごとの distinct なエントリー人数を数える", () => {
    const counts = countEntryUsersByStyleId([
      { user_id: "a", style_id: 2 },
      { user_id: "a", style_id: 2 },
      { user_id: "b", style_id: 2 },
      { user_id: "a", style_id: 9 },
    ]);
    expect(counts.get(2)).toBe(2);
    expect(counts.get(9)).toBe(1);
    expect(counts.get(1)).toBeUndefined();
  });

  it("groupConsecutive は隣り合う同じキーだけをまとめる (泳法が変わったら改行する)", () => {
    expect(groupConsecutive(["Fr1", "Fr2", "Br1", "Fr3"], (s) => s.slice(0, 2))).toEqual([
      ["Fr1", "Fr2"],
      ["Br1"],
      ["Fr3"],
    ]);
    expect(groupConsecutive([], (s: string) => s)).toEqual([]);
  });
});
