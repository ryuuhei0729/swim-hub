/**
 * hasRecordInputBesidesTime / hasRecordInput / hasPracticeMenuData 単体テスト (mobile)
 *
 * 背景: 大会記録はタイムが空だと保存時に除外されるため、タイム以外の入力 (スプリット・メモ・
 * 動画など) が黙って捨てられ、編集中の既存記録は確認なしで DB から削除されていた。
 * また ItemTabs の × は確認なしで即削除していた。これらの判定に使う述語を検証する。
 */

import { describe, it, expect } from "vitest";
import {
  hasRecordInputBesidesTime,
  hasRecordInput,
  hasPracticeMenuData,
  type RecordRowForInputCheck,
  type PracticeMenuForDataCheck,
} from "../tabFormUtils";

const emptyRecord = (overrides: Partial<RecordRowForInputCheck> = {}): RecordRowForInputCheck => ({
  time: 0,
  timeDisplayValue: "",
  note: "",
  reactionTime: "",
  splitTimes: [],
  videoPath: null,
  ...overrides,
});

describe("hasRecordInputBesidesTime", () => {
  it("何も入力していない行は false (種目は見ない)", () => {
    expect(hasRecordInputBesidesTime(emptyRecord(), 100, false)).toBe(false);
  });

  it("既存 DB 記録は中身に関わらず true (タイムを消すと保存時に削除されるため)", () => {
    expect(hasRecordInputBesidesTime(emptyRecord({ existingRecordId: "rec-1" }), 100, false)).toBe(
      true,
    );
  });

  it.each([
    ["メモ", { note: "予選" }],
    ["リアクション", { reactionTime: "0.65" }],
    ["既存動画", { videoPath: "videos/a.mp4" }],
  ] as const)("%s があれば true", (_label, overrides) => {
    expect(hasRecordInputBesidesTime(emptyRecord(overrides), 100, false)).toBe(true);
  });

  it("空白だけのメモ・リアクションは入力とみなさない", () => {
    expect(
      hasRecordInputBesidesTime(emptyRecord({ note: "  ", reactionTime: " " }), 100, false),
    ).toBe(false);
  });

  it("未アップロードの動画があれば true", () => {
    expect(hasRecordInputBesidesTime(emptyRecord(), 100, true)).toBe(true);
  });

  it("途中スプリット (種目距離と異なる距離) に値があれば true", () => {
    const record = emptyRecord({ splitTimes: [{ distance: 50, splitTime: 30.12 }] });
    expect(hasRecordInputBesidesTime(record, 100, false)).toBe(true);
  });

  it("文字列の距離でも途中スプリットとして数える", () => {
    const record = emptyRecord({ splitTimes: [{ distance: "50", splitTime: 30.12 }] });
    expect(hasRecordInputBesidesTime(record, 100, false)).toBe(true);
  });

  it("ゴール地点スプリット (種目距離と同じ距離) は数えない — タイムを消すと残る写しで、画面から削除できないため", () => {
    const record = emptyRecord({ splitTimes: [{ distance: 100, splitTime: 61.23 }] });
    expect(hasRecordInputBesidesTime(record, 100, false)).toBe(false);
  });

  it("文字列のゴール地点距離も数えない", () => {
    const record = emptyRecord({ splitTimes: [{ distance: "100", splitTime: 61.23 }] });
    expect(hasRecordInputBesidesTime(record, 100, false)).toBe(false);
  });

  it("値が 0 のスプリット行 (距離だけ入れた行) は数えない", () => {
    const record = emptyRecord({ splitTimes: [{ distance: 50, splitTime: 0 }] });
    expect(hasRecordInputBesidesTime(record, 100, false)).toBe(false);
  });

  it("種目未選択 (raceDistance undefined) ならスプリットはすべて途中扱い", () => {
    const record = emptyRecord({ splitTimes: [{ distance: 100, splitTime: 61.23 }] });
    expect(hasRecordInputBesidesTime(record, undefined, false)).toBe(true);
  });
});

describe("hasRecordInput", () => {
  it("何も入力していない行は false", () => {
    expect(hasRecordInput(emptyRecord(), 100, false)).toBe(false);
  });

  it("タイムがあれば true", () => {
    expect(hasRecordInput(emptyRecord({ time: 61.23, timeDisplayValue: "1:01.23" }), 100, false)).toBe(
      true,
    );
  });

  it("解釈できないタイム文字列だけでも true (入力途中の値を確認なしで消さない)", () => {
    expect(hasRecordInput(emptyRecord({ timeDisplayValue: "1.2.3.4" }), 100, false)).toBe(true);
  });

  it("タイム以外の入力だけでも true", () => {
    expect(hasRecordInput(emptyRecord({ note: "決勝" }), 100, false)).toBe(true);
  });
});

describe("hasPracticeMenuData", () => {
  const emptyMenu: PracticeMenuForDataCheck = { times: [], note: "", tags: [], videoPath: null };

  it("既定値のままのメニューは false", () => {
    expect(hasPracticeMenuData(emptyMenu, false)).toBe(false);
  });

  const menuCases: Array<[string, Partial<PracticeMenuForDataCheck>]> = [
    ["既存ログ", { existingLogId: "log-1" }],
    ["タイム", { times: [{ setNumber: 1, repNumber: 1, time: 75 }] }],
    ["メモ", { note: "EN2" }],
    ["タグ", { tags: [{ id: "tag-1" }] }],
    ["既存動画", { videoPath: "videos/m.mp4" }],
  ];
  it.each(menuCases)("%s があれば true", (_label, overrides) => {
    expect(hasPracticeMenuData({ ...emptyMenu, ...overrides }, false)).toBe(true);
  });

  it("未アップロードの動画があれば true", () => {
    expect(hasPracticeMenuData(emptyMenu, true)).toBe(true);
  });

  it("空白だけのメモは入力とみなさない", () => {
    expect(hasPracticeMenuData({ ...emptyMenu, note: "   " }, false)).toBe(false);
  });
});
