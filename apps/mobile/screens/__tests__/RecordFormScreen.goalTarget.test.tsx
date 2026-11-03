// =============================================================================
// RecordFormScreen.goalTarget.test.tsx
// =============================================================================
//
// 大会記録フォーム (RecordFormScreen) の本人の「目標: xx.xx」バッジ。
// 判定は CompetitionTabFormScreen と同じ findGoalTargetTime を通す:
//   - 本人・その大会・その種目の active / achieved の目標があれば出る
//   - cancelled / 別大会 / 別種目 / 別ユーザーでは出ない
//   - 引き継ぎあり (is_relaying=true) の記録では出ない
//   - 大会未紐付けレコード (一括入力) では出ない
//   - 目標の取得が失敗/読み込み中 (data 無し) でも画面は描画される (バッジが出ないだけ)

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRecordStore } from "@/stores/recordStore";
import { formatTimeBest } from "@apps/shared/utils/time";
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

const baseRecord = {
  id: "record-1",
  user_id: "user-1",
  competition_id: "comp-1",
  style_id: 2,
  time: 31.5,
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

const relayRecord = { ...baseRecord, id: "record-relay", is_relaying: true };
const standaloneRecord = {
  ...baseRecord,
  id: "record-standalone",
  competition_id: null,
  competition: null,
};

const goal = (overrides: Record<string, unknown> = {}) => ({
  id: "goal-1",
  user_id: "user-1",
  competition_id: "comp-1",
  style_id: 2,
  target_time: 30,
  status: "active",
  ...overrides,
});

const GOAL_TEXT = `目標: ${formatTimeBest(30)}`;

/** 編集対象を読み込んで大会名が出るまで待つ (目標判定に必要な大会・種目がストアに入った状態) */
async function renderAndWaitLoaded(recordId: string, loadedText: RegExp | string) {
  harness.routeParams.recordId = recordId;
  render(<RecordFormScreen />, { wrapper: createWrapper() });
  await waitFor(() => {
    expect(screen.getByText(loadedText)).toBeDefined();
  });
  // 種目一覧の取得完了 (種目名の表示) まで待つ
  await waitFor(() => {
    expect(screen.getByText(/50m自由形|50m Freestyle/)).toBeDefined();
  });
}

describe("RecordFormScreen — 目標バッジ", () => {
  beforeEach(() => {
    useRecordStore.getState().reset();
    resetRecordFormHarness();
    harness.records = [baseRecord, relayRecord, standaloneRecord];
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
  });

  it.each(["active", "achieved"])(
    "本人・同大会・同種目の %s の目標があれば出る",
    async (status) => {
      harness.goalTargetsQuery = { data: [goal({ status })] };
      await renderAndWaitLoaded("record-1", "テスト大会");
      expect(screen.getByText(GOAL_TEXT)).toBeDefined();
    },
  );

  it.each([
    ["cancelled", goal({ status: "cancelled" })],
    ["別大会", goal({ competition_id: "comp-other" })],
    ["別種目", goal({ style_id: 9 })],
    ["別ユーザー", goal({ user_id: "user-other" })],
  ])("%s の目標では出ない", async (_label, target) => {
    harness.goalTargetsQuery = { data: [target] };
    await renderAndWaitLoaded("record-1", "テスト大会");
    expect(screen.queryByText(/目標: /)).toBeNull();
  });

  it("引き継ぎあり (is_relaying=true) の記録では出ない", async () => {
    harness.goalTargetsQuery = { data: [goal()] };
    await renderAndWaitLoaded("record-relay", "テスト大会");
    expect(screen.queryByText(/目標: /)).toBeNull();
  });

  it("大会未紐付けレコード (一括入力) では出ない", async () => {
    harness.goalTargetsQuery = { data: [goal({ competition_id: null })] };
    await renderAndWaitLoaded("record-standalone", /一括入力/);
    expect(screen.queryByText(/目標: /)).toBeNull();
  });

  it("目標の取得が失敗/読み込み中 (data 無し) でも画面は描画され、バッジが出ないだけ", async () => {
    harness.goalTargetsQuery = { data: undefined };
    await renderAndWaitLoaded("record-1", "テスト大会");
    expect(screen.queryByText(/目標: /)).toBeNull();
    expect(screen.getByText("保存")).toBeDefined();
  });

  it("未ログイン (user なし) では出ない", async () => {
    harness.user = null;
    harness.goalTargetsQuery = { data: [goal()] };
    await renderAndWaitLoaded("record-1", "テスト大会");
    expect(screen.queryByText(/目標: /)).toBeNull();
  });
});
