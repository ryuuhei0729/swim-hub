// =============================================================================
// recordFormStore.test.ts - 大会記録フォームストアのユニットテスト
// =============================================================================

import { createMockRecordWithDetails } from "@/__mocks__/supabase";
import { beforeEach, describe, expect, it } from "vitest";
import { useRecordStore } from "../recordStore";

describe("recordFormStore", () => {
  beforeEach(() => {
    // 各テスト前にストアをリセット
    useRecordStore.getState().reset();
  });

  it("初期状態が正しい", () => {
    const state = useRecordStore.getState();

    expect(state.competitionId).toBeNull();
    expect(state.styleId).toBeNull();
    expect(state.time).toBeNull();
    expect(state.reactionTime).toBeNull();
    expect(state.note).toBeNull();
    expect(state.splitTimes).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.errors).toEqual({});
  });

  it("setCompetitionIdで大会IDを設定できる", () => {
    const { setCompetitionId } = useRecordStore.getState();
    const competitionId = "comp-1";

    setCompetitionId(competitionId);

    expect(useRecordStore.getState().competitionId).toBe(competitionId);
  });

  it("setStyleIdで種目IDを設定できる", () => {
    const { setStyleId } = useRecordStore.getState();

    setStyleId(1);
    expect(useRecordStore.getState().styleId).toBe(1);

    setStyleId(null);
    expect(useRecordStore.getState().styleId).toBeNull();
  });

  it("setTimeでタイムを設定できる", () => {
    const { setTime } = useRecordStore.getState();

    setTime(60.5);
    expect(useRecordStore.getState().time).toBe(60.5);

    setTime(null);
    expect(useRecordStore.getState().time).toBeNull();
  });

  it("setReactionTimeで反応時間を設定できる", () => {
    const { setReactionTime } = useRecordStore.getState();

    setReactionTime(0.5);
    expect(useRecordStore.getState().reactionTime).toBe(0.5);

    setReactionTime(null);
    expect(useRecordStore.getState().reactionTime).toBeNull();
  });

  it("setNoteでメモを設定できる", () => {
    const { setNote } = useRecordStore.getState();
    const note = "テストメモ";

    setNote(note);

    expect(useRecordStore.getState().note).toBe(note);
  });

  it("setSplitTimesでスプリットタイムを設定できる", () => {
    const { setSplitTimes } = useRecordStore.getState();
    const splitTimes = [
      { distance: 50, splitTime: 25.5 },
      { distance: 100, splitTime: 60.0 },
    ];

    setSplitTimes(splitTimes);

    expect(useRecordStore.getState().splitTimes).toEqual(splitTimes);
  });

  it("addSplitTimeでスプリットタイムを追加できる", () => {
    const { addSplitTime } = useRecordStore.getState();
    const splitTime1 = { distance: 50, splitTime: 25.5 };
    const splitTime2 = { distance: 100, splitTime: 60.0 };

    addSplitTime(splitTime1);
    addSplitTime(splitTime2);

    const state = useRecordStore.getState();
    expect(state.splitTimes).toHaveLength(2);
    expect(state.splitTimes[0]).toEqual(splitTime1);
    expect(state.splitTimes[1]).toEqual(splitTime2);
  });

  it("removeSplitTimeでスプリットタイムを削除できる", () => {
    const { setSplitTimes, removeSplitTime } = useRecordStore.getState();
    const splitTimes = [
      { distance: 50, splitTime: 25.5 },
      { distance: 100, splitTime: 60.0 },
      { distance: 150, splitTime: 90.0 },
    ];

    setSplitTimes(splitTimes);
    removeSplitTime(1);

    const state = useRecordStore.getState();
    expect(state.splitTimes).toHaveLength(2);
    expect(state.splitTimes[0].distance).toBe(50);
    expect(state.splitTimes[1].distance).toBe(150);
  });

  it("updateSplitTimeでスプリットタイムを更新できる", () => {
    const { setSplitTimes, updateSplitTime } = useRecordStore.getState();
    const splitTimes = [
      { distance: 50, splitTime: 25.5 },
      { distance: 100, splitTime: 60.0 },
    ];

    setSplitTimes(splitTimes);
    updateSplitTime(0, { splitTime: 26.0 });

    const state = useRecordStore.getState();
    expect(state.splitTimes[0].splitTime).toBe(26.0);
    expect(state.splitTimes[0].distance).toBe(50); // 他のプロパティは保持
    expect(state.splitTimes[1]).toEqual(splitTimes[1]); // 他のアイテムは変更されない
  });

  it("setLoadingでローディング状態を設定できる", () => {
    const { setLoading } = useRecordStore.getState();

    setLoading(true);
    expect(useRecordStore.getState().isLoading).toBe(true);

    setLoading(false);
    expect(useRecordStore.getState().isLoading).toBe(false);
  });

  it("setErrorでエラーを設定できる", () => {
    const { setError } = useRecordStore.getState();

    setError("competitionId", "大会IDは必須です");
    expect(useRecordStore.getState().errors.competitionId).toBe("大会IDは必須です");

    setError("time", "タイムは必須です");
    expect(useRecordStore.getState().errors.time).toBe("タイムは必須です");
    expect(useRecordStore.getState().errors.competitionId).toBe("大会IDは必須です"); // 既存のエラーは保持
  });

  it("clearErrorsでエラーをクリアできる", () => {
    const { setError, clearErrors } = useRecordStore.getState();

    setError("competitionId", "大会IDは必須です");
    setError("time", "タイムは必須です");

    clearErrors();

    expect(useRecordStore.getState().errors).toEqual({});
  });

  it("initializeで既存の記録を初期化できる", () => {
    const { initialize } = useRecordStore.getState();
    const mockRecord = createMockRecordWithDetails({
      competition_id: "comp-1",
      style_id: 1,
      time: 60.5,
      reaction_time: 0.5,
      note: "テストメモ",
      split_times: [
        {
          id: "split-1",
          record_id: "record-1",
          distance: 50,
          split_time: 25.5,
          created_at: "2025-01-15T10:00:00Z",
        },
        {
          id: "split-2",
          record_id: "record-1",
          distance: 100,
          split_time: 60.0,
          created_at: "2025-01-15T10:00:00Z",
        },
      ],
    });

    initialize(mockRecord);

    const state = useRecordStore.getState();
    expect(state.competitionId).toBe("comp-1");
    expect(state.styleId).toBe(1);
    expect(state.time).toBe(60.5);
    expect(state.reactionTime).toBe(0.5);
    expect(state.note).toBe("テストメモ");
    expect(state.splitTimes).toHaveLength(2);
    expect(state.splitTimes[0]).toEqual({
      distance: 50,
      splitTime: 25.5,
      id: "split-1",
    });
    expect(state.errors).toEqual({});
  });

  it("initializeで空のフォームを初期化できる", () => {
    const { initialize, setCompetitionId, setStyleId } = useRecordStore.getState();

    // まず値を設定
    setCompetitionId("comp-1");
    setStyleId(1);

    // 空で初期化
    initialize();

    const state = useRecordStore.getState();
    expect(state.competitionId).toBeNull();
    expect(state.styleId).toBeNull();
    expect(state.time).toBeNull();
    expect(state.reactionTime).toBeNull();
    expect(state.note).toBeNull();
    expect(state.splitTimes).toEqual([]);
    expect(state.errors).toEqual({});
  });

  it("resetでストアをリセットできる", () => {
    const { setCompetitionId, setStyleId, setTime, setSplitTimes, reset } =
      useRecordStore.getState();

    setCompetitionId("comp-1");
    setStyleId(1);
    setTime(60.5);
    setSplitTimes([{ distance: 50, splitTime: 25.5 }]);

    reset();

    const state = useRecordStore.getState();
    expect(state.competitionId).toBeNull();
    expect(state.styleId).toBeNull();
    expect(state.time).toBeNull();
    expect(state.reactionTime).toBeNull();
    expect(state.note).toBeNull();
    expect(state.splitTimes).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.errors).toEqual({});
  });
});
