// TeamEntryBulkFormScreen — チームエントリー代理入力 (M3) の「目標: xx.xx」バッジ
// Sprint Contract goal_target_badge
//   - 目標がある (選手, 大会, 種目) の行に出る。cancelled / 別大会 / 別種目 / 別選手では出ない
//   - 選手 A の目標が選手 B の行に出ない。同じ選手の別種目の行はそれぞれの値が出る
//   - 目標取得は RPC 1回 ({teamId, competitionId})。メンバー一覧の変化で再実行されない
//   - 取得失敗でも画面は描画され保存できる状態のまま、バッジが出ないだけ
//   - 目標バッジはベストバッジの後ろ (DOM 順で直下)

import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";

const goalTargetsMocks = vi.hoisted(() => ({ listForCompetition: vi.fn() }));
vi.mock("@apps/shared/api/teams/goalTargets", () => ({
  TeamGoalTargetsAPI: class {
    listForCompetition = goalTargetsMocks.listForCompetition;
  },
}));

import { createWrapper, harness } from "./teamEntryBulkScreenHarness";
import { TeamEntryBulkFormScreen } from "../TeamEntryBulkFormScreen";

harness.members = [];

const styleFree = { id: 3, name_jp: "自由形100m", name: "Freestyle", style: "fr", distance: 100 };
const styleBreast = { id: 9, name_jp: "平泳ぎ50m", name: "Breaststroke", style: "br", distance: 50 };

const GOAL_LABEL = ja.forms.recordLog.goalTargetLabel;
const normalize = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const goalBadges = (): string[] =>
  screen
    .queryAllByText((_c, el) => el?.tagName === "SPAN" && normalize(el.textContent).startsWith(`${GOAL_LABEL}: `))
    .map((el) => normalize(el.textContent));
const goalText = (t: string) => `${GOAL_LABEL}: ${t}`;

const goal = (over: Record<string, unknown> = {}) => ({
  competition_id: "comp-1",
  user_id: "user-1",
  style_id: 3,
  target_time: 58.5,
  status: "active",
  ...over,
});
const entryRow = (id: string, userId: string, styleId: number, name: string) => ({
  id, user_id: userId, style_id: styleId, entry_time: 60.5, note: null, users: { id: userId, name },
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(qc) });
}

describe("TeamEntryBulkFormScreen — 目標バッジ (M3)", () => {
  beforeEach(() => {
    harness.members = [
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
      { user_id: "user-1", role: "user", users: { id: "user-1", name: "選手A" } },
      { user_id: "user-2", role: "user", users: { id: "user-2", name: "選手B" } },
    ];
    harness.getStyles.mockResolvedValue([styleFree, styleBreast]);
    harness.getBestTimesForUsers.mockResolvedValue(new Map());
    goalTargetsMocks.listForCompetition.mockResolvedValue([]);
    harness.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0, date: "2999-01-01", entry_status: "open" },
      error: null,
    };
    harness.responses["select:entries"] = {
      data: [entryRow("e1", "user-1", 3, "選手A"), entryRow("e2", "user-2", 3, "選手B")],
      error: null,
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("目標があれば「目標: 58.50」が出て、RPC は (teamId, competitionId) で1回だけ呼ばれる", async () => {
    goalTargetsMocks.listForCompetition.mockResolvedValue([goal()]);
    renderScreen();
    await waitFor(() => expect(goalBadges()).toEqual([goalText("58.50")]));
    expect(goalTargetsMocks.listForCompetition).toHaveBeenCalledTimes(1);
    expect(goalTargetsMocks.listForCompetition).toHaveBeenCalledWith("team-1", "comp-1");
  });

  it("目標が無ければ出ない (アンカー対)", async () => {
    renderScreen();
    await waitFor(() => expect(goalTargetsMocks.listForCompetition).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("選手A").length).toBeGreaterThan(0));
    expect(goalBadges()).toEqual([]);
  });

  it("cancelled / 別大会 / 別種目の目標は出ない。achieved は出る", async () => {
    goalTargetsMocks.listForCompetition.mockResolvedValue([
      goal({ status: "cancelled" }),
      goal({ competition_id: "comp-OTHER", target_time: 20 }),
      goal({ style_id: 9, target_time: 21 }),
    ]);
    const { unmount } = renderScreen();
    await waitFor(() => expect(goalTargetsMocks.listForCompetition).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("選手A").length).toBeGreaterThan(0));
    expect(goalBadges()).toEqual([]);
    unmount();
    goalTargetsMocks.listForCompetition.mockResolvedValue([goal({ status: "achieved", target_time: 57 })]);
    renderScreen();
    await waitFor(() => expect(goalBadges()).toEqual([goalText("57.00")]));
  });

  it("選手 A の目標が選手 B の行に出ない。同じ種目でも選手ごとの値がそれぞれ出る", async () => {
    goalTargetsMocks.listForCompetition.mockResolvedValue([goal({ user_id: "user-1", target_time: 58 })]);
    const { unmount } = renderScreen();
    await waitFor(() => expect(goalBadges()).toEqual([goalText("58.00")])); // A の行だけ (B の行は無し)
    unmount();
    goalTargetsMocks.listForCompetition.mockResolvedValue([
      goal({ user_id: "user-1", target_time: 58 }),
      goal({ user_id: "user-2", target_time: 61 }),
    ]);
    renderScreen();
    await waitFor(() => expect(goalBadges()).toHaveLength(2));
    expect(goalBadges()).toEqual([goalText("58.00"), goalText("1:01.00")]);
  });

  it("同じ選手の別種目の行は、それぞれの種目の目標が出る", async () => {
    harness.responses["select:entries"] = {
      data: [entryRow("e1", "user-1", 3, "選手A"), entryRow("e2", "user-1", 9, "選手A")],
      error: null,
    };
    goalTargetsMocks.listForCompetition.mockResolvedValue([
      goal({ style_id: 3, target_time: 58 }),
      goal({ style_id: 9, target_time: 31 }),
    ]);
    renderScreen();
    await waitFor(() => expect(goalBadges()).toHaveLength(2));
    expect(goalBadges()).toEqual([goalText("58.00"), goalText("31.00")]);
  });

  it("ベストが無くても目標は出る。ベストがあれば目標は DOM 順でその後ろ (直下)", async () => {
    goalTargetsMocks.listForCompetition.mockResolvedValue([goal()]);
    harness.getBestTimesForUsers.mockResolvedValue(
      new Map([[
        "user-1",
        [{ id: "b", time: 57, created_at: "2025-01-01T00:00:00Z", pool_type: 0, is_relaying: false, style_id: 3,
           style: { name_jp: "自由形100m", distance: 100 } }],
      ]]),
    );
    renderScreen();
    await waitFor(() => expect(goalBadges()).toHaveLength(1));
    const goalEl = screen.getByText((_c, el) => el?.tagName === "SPAN" && normalize(el.textContent) === goalText("58.50"));
    const best = await screen.findByText((_c, el) => el?.tagName === "SPAN" && normalize(el.textContent).startsWith(`${ja.forms.recordLog.bestTimeLabel}: `));
    expect(best.compareDocumentPosition(goalEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("メンバー一覧が変化しても目標の RPC は再実行されない", async () => {
    goalTargetsMocks.listForCompetition.mockResolvedValue([goal()]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(qc) });
    await waitFor(() => expect(goalBadges()).toHaveLength(1));
    harness.members = [...harness.members, { user_id: "user-3", role: "user", users: { id: "user-3", name: "選手C" } }];
    view.rerender(<TeamEntryBulkFormScreen />);
    await waitFor(() => expect(screen.getAllByText("選手A").length).toBeGreaterThan(0));
    expect(goalTargetsMocks.listForCompetition).toHaveBeenCalledTimes(1);
  });

  it("目標取得が reject しても画面は描画され、バッジだけ出ない (エラー文も出ない)", async () => {
    goalTargetsMocks.listForCompetition.mockRejectedValue(new Error("rpc down"));
    renderScreen();
    await waitFor(() => expect(goalTargetsMocks.listForCompetition).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("選手A").length).toBeGreaterThan(0));
    expect(goalBadges()).toEqual([]);
    expect(screen.queryByText(/rpc down/)).toBeNull();
  });
});
