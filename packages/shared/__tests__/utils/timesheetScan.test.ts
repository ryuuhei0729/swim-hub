import { describe, it, expect } from "vitest";
import {
  autoAssignMembers,
  buildScanMenuDrafts,
  findBestMemberMatch,
  isTimesheetScanResult,
  resolveScanTime,
  scanTimeKey,
  type TimesheetScanResult,
} from "../../utils/timesheetScan";

const members = [
  { user_id: "u-taro", users: { name: "山田太郎" } },
  { user_id: "u-hana", users: { name: "さとう はな" } },
  { user_id: "u-noname", users: null },
];

const scan: TimesheetScanResult = {
  menu: { distance: 50, repCount: 2, setCount: 2, circle: 90, description: "2s x 2 x 50" },
  swimmers: [
    { no: 1, name: "山田", style: "Fr", times: [30.1, 30.5, null, 31.0] },
    { no: 2, name: "サトウ", style: "Br", times: [40.2, 40.8, 41.0, 41.5] },
    { no: 3, name: "", style: "Fr", times: [33.3] },
  ],
};

describe("isTimesheetScanResult", () => {
  it("解析結果の形だけを受け付ける", () => {
    expect(isTimesheetScanResult(scan)).toBe(true);
    expect(isTimesheetScanResult({ error: "x" })).toBe(false);
    expect(isTimesheetScanResult({ menu: scan.menu, swimmers: [{ no: "1" }] })).toBe(false);
    expect(isTimesheetScanResult(null)).toBe(false);
  });
});

describe("findBestMemberMatch / autoAssignMembers", () => {
  it("部分一致・かな違いでも割り当て、名前が空・名前の無いメンバーは対象外", () => {
    expect(findBestMemberMatch("山田", members, new Set())).toBe("u-taro");
    expect(findBestMemberMatch("", members, new Set())).toBeNull();
    expect(autoAssignMembers(scan.swimmers, members)).toEqual({ 1: "u-taro", 2: "u-hana" });
  });

  it("割り当て済みのメンバーは別の選手に割り当てない", () => {
    expect(findBestMemberMatch("山田", members, new Set(["u-taro"]))).toBeNull();
  });
});

describe("buildScanMenuDrafts", () => {
  it("種目ごとにまとめ、割り当てたメンバーのタイムをセット・本数に並べる (空欄は除く)", () => {
    const drafts = buildScanMenuDrafts(scan, { 1: "u-taro", 2: "u-hana" }, {
      [scanTimeKey(1, 1)]: 29.9,
      [scanTimeKey(2, 3)]: null,
    });
    expect(drafts).toEqual([
      {
        style: "Fr",
        distance: 50,
        reps: 2,
        sets: 2,
        circle: 90,
        note: "2s x 2 x 50",
        members: [
          {
            userId: "u-taro",
            times: [
              { setNumber: 1, repNumber: 1, time: 30.1 },
              { setNumber: 1, repNumber: 2, time: 29.9 },
              { setNumber: 2, repNumber: 2, time: 31.0 },
            ],
          },
        ],
      },
      {
        style: "Br",
        distance: 50,
        reps: 2,
        sets: 2,
        circle: 90,
        note: "2s x 2 x 50",
        members: [
          {
            userId: "u-hana",
            times: [
              { setNumber: 1, repNumber: 1, time: 40.2 },
              { setNumber: 1, repNumber: 2, time: 40.8 },
              { setNumber: 2, repNumber: 1, time: 41.0 },
            ],
          },
        ],
      },
    ]);
  });

  it("直したタイムを優先し、空にしたタイムは null として扱う", () => {
    expect(resolveScanTime(scan, {}, 1, 0)).toBe(30.1);
    expect(resolveScanTime(scan, { [scanTimeKey(1, 0)]: 28 }, 1, 0)).toBe(28);
    expect(resolveScanTime(scan, { [scanTimeKey(1, 0)]: null }, 1, 0)).toBeNull();
    expect(resolveScanTime(scan, {}, 9, 0)).toBeNull();
  });
});
