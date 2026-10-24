/**
 * hasRecordInputBesidesTime / hasRecordInput / hasPracticeMenuData 単体テスト (web)
 *
 * 背景: 大会記録はタイムが空だと送信対象から除外されるため、タイム以外の入力 (スプリット・
 * メモ・動画など) が黙って捨てられ、編集中の既存記録は確認なしで削除されていた。また ItemTabs の
 * × は確認なしで即削除していた。これらの判定に使う述語を検証する
 * (mobile の tabFormUtils.inputPredicates.test.ts と同じ規則)。
 */

import { describe, it, expect } from "vitest";
import {
  hasRecordInputBesidesTime,
  hasRecordInput,
  hasPracticeMenuData,
  type RecordRowForInputCheck,
  type PracticeMenuForDataCheck,
} from "@/utils/tabModalDiff";

const DB_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

const emptyRecord = (overrides: Partial<RecordRowForInputCheck> = {}): RecordRowForInputCheck => ({
  time: 0,
  timeDisplayValue: "",
  note: "",
  reactionTime: "",
  splitTimes: [],
  videoPath: null,
  ...overrides,
});

describe("hasRecordInputBesidesTime (web)", () => {
  it("何も入力していない行は false (種目・リレー区分は見ない)", () => {
    expect(hasRecordInputBesidesTime(emptyRecord(), 100)).toBe(false);
  });

  const trueCases: Array<[string, Partial<RecordRowForInputCheck>]> = [
    ["既存 DB 記録", { existingRecordId: DB_UUID }],
    ["メモ", { note: "予選" }],
    ["リアクション", { reactionTime: "0.65" }],
    ["既存動画", { videoPath: "videos/a.mp4" }],
    ["保留中の動画", { pendingVideo: { file: "x" } }],
    ["途中スプリット", { splitTimes: [{ distance: 50, splitTime: 30.12 }] }],
    ["文字列距離の途中スプリット", { splitTimes: [{ distance: "50", splitTime: 30.12 }] }],
  ];
  it.each(trueCases)("%s があれば true", (_label, overrides) => {
    expect(hasRecordInputBesidesTime(emptyRecord(overrides), 100)).toBe(true);
  });

  it("ゴール地点スプリット (種目距離と同じ距離) は数えない — 表示用に補完される写しのため", () => {
    expect(
      hasRecordInputBesidesTime(emptyRecord({ splitTimes: [{ distance: 100, splitTime: 61.2 }] }), 100),
    ).toBe(false);
  });

  it("値が 0 のスプリット行は数えない", () => {
    expect(
      hasRecordInputBesidesTime(emptyRecord({ splitTimes: [{ distance: 50, splitTime: 0 }] }), 100),
    ).toBe(false);
  });
});

describe("hasRecordInput (web)", () => {
  it("何も入力していない行は false", () => {
    expect(hasRecordInput(emptyRecord(), 100)).toBe(false);
  });

  it("タイムがあれば true", () => {
    expect(hasRecordInput(emptyRecord({ time: 61.23 }), 100)).toBe(true);
  });

  it("解釈できないタイム文字列だけでも true", () => {
    expect(hasRecordInput(emptyRecord({ timeDisplayValue: "1.2.3.4" }), 100)).toBe(true);
  });

  it("timeDisplayValue が未定義でも落ちない", () => {
    expect(hasRecordInput(emptyRecord({ timeDisplayValue: undefined }), 100)).toBe(false);
  });
});

describe("hasPracticeMenuData (web)", () => {
  const emptyMenu: PracticeMenuForDataCheck = { id: "1", times: [], note: "", tags: [], videoPath: null };

  it("新規の既定値メニューは false", () => {
    expect(hasPracticeMenuData(emptyMenu, false)).toBe(false);
  });

  const trueCases: Array<[string, Partial<PracticeMenuForDataCheck>]> = [
    ["既存ログ (DB UUID の id)", { id: DB_UUID }],
    ["タイム", { times: [{ setNumber: 1, repNumber: 1, time: 75 }] }],
    ["メモ", { note: "EN2" }],
    ["タグ", { tags: [{ id: "tag-1" }] }],
    ["既存動画", { videoPath: "videos/m.mp4" }],
  ];
  it.each(trueCases)("%s があれば true", (_label, overrides) => {
    expect(hasPracticeMenuData({ ...emptyMenu, ...overrides }, false)).toBe(true);
  });

  it("保留中の動画があれば true", () => {
    expect(hasPracticeMenuData(emptyMenu, true)).toBe(true);
  });
});
