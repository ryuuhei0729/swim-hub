// TeamEntryBulkFormScreen — チームエントリー代理入力 (M3) の「目標: xx.xx」バッジ
// Sprint Contract goal_target_badge
//   - 目標がある (選手, 大会, 種目) の行に出る。cancelled / 別大会 / 別種目 / 別選手では出ない
//   - 選手 A の目標が選手 B の行に出ない。同じ選手の別種目の行はそれぞれの値が出る
//   - 目標取得は RPC 1回 ({teamId, competitionId})。メンバー一覧の変化で再実行されない
//   - 取得失敗でも画面は描画され保存できる状態のまま、バッジが出ないだけ
//   - 目標バッジはベストバッジの後ろ (DOM 順で直下)
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";

const mocks = vi.hoisted(() => {
  const styleFree = { id: 3, name_jp: "自由形100m", name: "Freestyle", style: "fr", distance: 100 };
  const styleBreast = { id: 9, name_jp: "平泳ぎ50m", name: "Breaststroke", style: "br", distance: 50 };
  const responses: Record<string, { data: unknown; error: unknown }> = {};
  function makeSupabase() {
    return {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.order = vi.fn(() => Promise.resolve(responses[`select:${table}`] ?? { data: null, error: null }));
        builder.single = vi.fn(() => Promise.resolve(responses[`select:${table}`] ?? { data: null, error: null }));
        return builder;
      },
    };
  }
  return {
    styleFree,
    styleBreast,
    responses,
    supabase: makeSupabase(),
    members: [] as Array<{ user_id: string; role: string; users: { id: string; name: string } }>,
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getBestTimesForUsers: vi.fn(),
    listForCompetition: vi.fn(),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  usePreventRemove: () => undefined,
}));
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: mocks.supabase, user: { id: "admin-1" } }),
}));
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.members, isLoading: false }),
}));
vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));
vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    createBulkEntries = vi.fn().mockResolvedValue([]);
    updateEntry = vi.fn().mockResolvedValue({});
    deleteBulkEntries = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesForUsers = mocks.getBestTimesForUsers;
  },
}));
vi.mock("@apps/shared/api/teams/goalTargets", () => ({
  TeamGoalTargetsAPI: class {
    listForCompetition = mocks.listForCompetition;
  },
}));
vi.mock("@/components/teams/MemberSelectModal", () => ({ MemberSelectModal: () => null }));

import { TeamEntryBulkFormScreen } from "../TeamEntryBulkFormScreen";

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

const createWrapper = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(qc) });
}

describe("TeamEntryBulkFormScreen — 目標バッジ (M3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.members = [
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
      { user_id: "user-1", role: "user", users: { id: "user-1", name: "選手A" } },
      { user_id: "user-2", role: "user", users: { id: "user-2", name: "選手B" } },
    ];
    mocks.getStyles.mockResolvedValue([mocks.styleFree, mocks.styleBreast]);
    mocks.getBestTimesForUsers.mockResolvedValue(new Map());
    mocks.listForCompetition.mockResolvedValue([]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0, date: "2999-01-01", entry_status: "open" },
      error: null,
    };
    mocks.responses["select:entries"] = {
      data: [entryRow("e1", "user-1", 3, "選手A"), entryRow("e2", "user-2", 3, "選手B")],
      error: null,
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("目標があれば「目標: 58.50」が出て、RPC は (teamId, competitionId) で1回だけ呼ばれる", async () => {
    mocks.listForCompetition.mockResolvedValue([goal()]);
    renderScreen();
    await waitFor(() => expect(goalBadges()).toEqual([goalText("58.50")]));
    expect(mocks.listForCompetition).toHaveBeenCalledTimes(1);
    expect(mocks.listForCompetition).toHaveBeenCalledWith("team-1", "comp-1");
  });

  it("目標が無ければ出ない (アンカー対)", async () => {
    renderScreen();
    await waitFor(() => expect(mocks.listForCompetition).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("選手A").length).toBeGreaterThan(0));
    expect(goalBadges()).toEqual([]);
  });

  it("cancelled / 別大会 / 別種目の目標は出ない。achieved は出る", async () => {
    mocks.listForCompetition.mockResolvedValue([
      goal({ status: "cancelled" }),
      goal({ competition_id: "comp-OTHER", target_time: 20 }),
      goal({ style_id: 9, target_time: 21 }),
    ]);
    const { unmount } = renderScreen();
    await waitFor(() => expect(mocks.listForCompetition).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("選手A").length).toBeGreaterThan(0));
    expect(goalBadges()).toEqual([]);
    unmount();
    mocks.listForCompetition.mockResolvedValue([goal({ status: "achieved", target_time: 57 })]);
    renderScreen();
    await waitFor(() => expect(goalBadges()).toEqual([goalText("57.00")]));
  });

  it("選手 A の目標が選手 B の行に出ない。同じ種目でも選手ごとの値がそれぞれ出る", async () => {
    mocks.listForCompetition.mockResolvedValue([goal({ user_id: "user-1", target_time: 58 })]);
    const { unmount } = renderScreen();
    await waitFor(() => expect(goalBadges()).toEqual([goalText("58.00")])); // A の行だけ (B の行は無し)
    unmount();
    mocks.listForCompetition.mockResolvedValue([
      goal({ user_id: "user-1", target_time: 58 }),
      goal({ user_id: "user-2", target_time: 61 }),
    ]);
    renderScreen();
    await waitFor(() => expect(goalBadges()).toHaveLength(2));
    expect(goalBadges()).toEqual([goalText("58.00"), goalText("1:01.00")]);
  });

  it("同じ選手の別種目の行は、それぞれの種目の目標が出る", async () => {
    mocks.responses["select:entries"] = {
      data: [entryRow("e1", "user-1", 3, "選手A"), entryRow("e2", "user-1", 9, "選手A")],
      error: null,
    };
    mocks.listForCompetition.mockResolvedValue([
      goal({ style_id: 3, target_time: 58 }),
      goal({ style_id: 9, target_time: 31 }),
    ]);
    renderScreen();
    await waitFor(() => expect(goalBadges()).toHaveLength(2));
    expect(goalBadges()).toEqual([goalText("58.00"), goalText("31.00")]);
  });

  it("ベストが無くても目標は出る。ベストがあれば目標は DOM 順でその後ろ (直下)", async () => {
    mocks.listForCompetition.mockResolvedValue([goal()]);
    mocks.getBestTimesForUsers.mockResolvedValue(
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
    mocks.listForCompetition.mockResolvedValue([goal()]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(qc) });
    await waitFor(() => expect(goalBadges()).toHaveLength(1));
    mocks.members = [...mocks.members, { user_id: "user-3", role: "user", users: { id: "user-3", name: "選手C" } }];
    view.rerender(<TeamEntryBulkFormScreen />);
    await waitFor(() => expect(screen.getAllByText("選手A").length).toBeGreaterThan(0));
    expect(mocks.listForCompetition).toHaveBeenCalledTimes(1);
  });

  it("目標取得が reject しても画面は描画され、バッジだけ出ない (エラー文も出ない)", async () => {
    mocks.listForCompetition.mockRejectedValue(new Error("rpc down"));
    renderScreen();
    await waitFor(() => expect(mocks.listForCompetition).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("選手A").length).toBeGreaterThan(0));
    expect(goalBadges()).toEqual([]);
    expect(screen.queryByText(/rpc down/)).toBeNull();
  });
});
