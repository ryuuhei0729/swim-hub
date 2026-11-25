// =============================================================================
// RecordFormScreen.storeReview.test.tsx
// =============================================================================
//
// 記録を新しく登録して保存できたときだけ、ストアの評価を依頼する。
// 既存の記録の編集や、保存に失敗したときは依頼しない。

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordStore } from "@/stores/recordStore";
import { createWrapper, harness, resetRecordFormHarness } from "./recordFormScreenHarness";
import { RecordFormScreen } from "../RecordFormScreen";

const style = { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 };
const competition = {
  id: "comp-1",
  title: "テスト大会",
  date: "2026-07-01",
  pool_type: 1,
  image_paths: [] as string[],
};
const existingRecord = {
  id: "record-1",
  user_id: "user-1",
  competition_id: "comp-1",
  style_id: 2,
  time: 30.5,
  note: null,
  is_relaying: false,
  reaction_time: null,
  pool_type: 1,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  competition,
  style,
  split_times: [],
};

/** 新規作成の画面はマウント時にストアを初期化するので、描画後に種目とタイムを入れる */
async function fillNewRecord() {
  await screen.findByText("保存");
  act(() => {
    useRecordStore.getState().setStyleId(style.id);
    useRecordStore.getState().setTime(31.2);
  });
}

describe("RecordFormScreen — ストアの評価の依頼", () => {
  beforeEach(() => {
    useRecordStore.getState().reset();
    resetRecordFormHarness();
    harness.records = [existingRecord];
    harness.competitions = [competition];
    harness.competitionByIdResponses[`pool_type:${competition.id}`] = {
      data: { pool_type: competition.pool_type },
      error: null,
    };
    harness.competitionByIdResponses[`image_paths,title:${competition.id}`] = {
      data: { image_paths: competition.image_paths, title: competition.title },
      error: null,
    };
    harness.getStyles.mockResolvedValue([style]);
    harness.getAccessToken.mockResolvedValue("test-access-token");
    harness.createMutateAsync.mockResolvedValue({ id: "record-new" });
    harness.updateMutateAsync.mockResolvedValue({ id: "record-1" });
    harness.replaceSplitTimesMutateAsync.mockResolvedValue([]);
  });

  it("新規作成の保存に成功したら依頼してから前の画面に戻る", async () => {
    harness.routeParams.competitionId = competition.id;
    render(<RecordFormScreen />, { wrapper: createWrapper() });
    await fillNewRecord();

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => expect(harness.goBack).toHaveBeenCalledTimes(1));
    expect(harness.createMutateAsync).toHaveBeenCalledTimes(1);
    expect(harness.requestStoreReviewOnce).toHaveBeenCalledTimes(1);
    // マイルストーン達成の確認ダイアログが出るときは見送る判定を渡している
    expect(harness.requestStoreReviewOnce).toHaveBeenCalledWith(expect.any(Function));
  });

  it("新規作成の保存に失敗したら依頼しない", async () => {
    harness.routeParams.competitionId = competition.id;
    harness.createMutateAsync.mockRejectedValue(new Error("network"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<RecordFormScreen />, { wrapper: createWrapper() });
    await fillNewRecord();

    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(harness.goBack).not.toHaveBeenCalled();
    expect(harness.requestStoreReviewOnce).not.toHaveBeenCalled();
  });

  it("既存の記録を編集して保存したときは依頼しない", async () => {
    harness.routeParams.recordId = existingRecord.id;
    render(<RecordFormScreen />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByText("テスト大会")).toBeDefined());
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => expect(harness.goBack).toHaveBeenCalledTimes(1));
    expect(harness.updateMutateAsync).toHaveBeenCalledTimes(1);
    expect(harness.requestStoreReviewOnce).not.toHaveBeenCalled();
  });
});
