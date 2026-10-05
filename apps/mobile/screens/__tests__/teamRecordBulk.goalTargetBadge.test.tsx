// =============================================================================
// teamRecordBulk.goalTargetBadge.test.tsx — チーム記録代理入力 (M2) の「目標: xx.xx」バッジ
// Sprint Contract goal_target_badge
//   - 個人行・リレー第1泳者に出る。リレー第2〜4泳者 (引き継ぎあり) には出ない
//   - メンバー A の目標が B の行に出ない。cancelled / 別大会 / 別種目では出ない
//   - 目標取得は RPC 1回 ({teamId, competitionId} 引数)。メンバー一覧の変化で再実行されない
//   - 取得失敗でも画面は描画され、バッジが出ないだけ (入力・保存を止めない)
//   - 目標バッジはベストバッジの後ろ (DOM 順で直下)
// =============================================================================

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
  };
});

const mocks = vi.hoisted(() => {
  const styles = [
    { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 },
    { id: 9, name_jp: "50m平泳ぎ", name: "50m Breaststroke", style: "Br", distance: 50 },
    { id: 13, name_jp: "50m背泳ぎ", name: "50m Backstroke", style: "Ba", distance: 50 },
    { id: 17, name_jp: "50mバタフライ", name: "50m Butterfly", style: "Fly", distance: 50 },
  ];

  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: Record<string, unknown> = {
          select: (..._a: unknown[]) => {
            if (!op) op = "select";
            return builder;
          },
          eq: () => builder,
          order: () => builder,
          in: () => builder,
          single: () => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
          then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
            resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        };
        return builder;
      },
    };
  }

  return {
    styles,
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" } as Record<string, unknown>,
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    getBestTimesDetailedForUsers: vi.fn(),
    listForCompetition: vi.fn(),
    teamMembers: [
      { user_id: "user-1", role: "admin", users: { id: "user-1", name: "管理者" } },
    ] as Array<{ user_id: string; role: string; users: { id: string; name: string } }>,
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  usePreventRemove: () => undefined,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    subscription: null,
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.teamMembers, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesDetailedForUsers = mocks.getBestTimesDetailedForUsers;
  },
}));

vi.mock("@apps/shared/api/teams/goalTargets", () => ({
  TeamGoalTargetsAPI: class {
    listForCompetition = mocks.listForCompetition;
  },
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records/LapTimeDisplay", () => ({ LapTimeDisplay: () => null }));
vi.mock("@/components/teams/MemberSelectModal", () => ({ MemberSelectModal: () => null }));

import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const LABEL = ja.forms.recordLog;

const createWrapper = (queryClient: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeRecord(opts: {
  id: string;
  userId: string;
  name: string;
  styleId: number;
  time: number;
  isRelaying: boolean;
}) {
  return {
    id: opts.id,
    user_id: opts.userId,
    style_id: opts.styleId,
    time: opts.time,
    is_relaying: opts.isRelaying,
    reaction_time: null,
    note: null,
    split_times: [],
    users: { id: opts.userId, name: opts.name },
  };
}

function makeBestTime(opts: {
  styleId: number;
  time: number;
  poolType: number;
  relayingTime?: number;
}) {
  const style = mocks.styles.find((s) => s.id === opts.styleId)!;
  return {
    id: `bt-${opts.styleId}-${opts.poolType}`,
    time: opts.time,
    created_at: "2025-06-01T00:00:00Z",
    pool_type: opts.poolType,
    is_relaying: false,
    style_id: style.id,
    style: { name_jp: style.name_jp, distance: style.distance },
    ...(opts.relayingTime !== undefined
      ? {
          relayingTime: {
            id: `bt-relay-${opts.styleId}-${opts.poolType}`,
            time: opts.relayingTime,
            created_at: "2025-06-01T00:00:00Z",
          },
        }
      : {}),
  };
}

/** メドレーリレー (背→平→バタ→自) の4件連続並び */
function medleyRelayRecords() {
  return [
    makeRecord({ id: "r1", userId: "user-10", name: "山田", styleId: 13, time: 31.0, isRelaying: false }),
    makeRecord({ id: "r2", userId: "user-11", name: "鈴木", styleId: 9, time: 33.5, isRelaying: true }),
    makeRecord({ id: "r3", userId: "user-12", name: "佐藤", styleId: 17, time: 29.8, isRelaying: true }),
    makeRecord({ id: "r4", userId: "user-13", name: "田中", styleId: 2, time: 27.0, isRelaying: true }),
  ];
}


const GOAL_LABEL = ja.forms.recordLog.goalTargetLabel;
const goalText = (time: string) => `${GOAL_LABEL}: ${time}`;
const goalBadges = (): string[] =>
  screen
    .queryAllByText((_c, el) => normalize(el?.textContent).startsWith(`${GOAL_LABEL}: `) && el?.tagName === "SPAN")
    .map((el) => normalize(el.textContent));

const goal = (over: Record<string, unknown> = {}) => ({
  competition_id: "comp-1",
  user_id: "user-10",
  style_id: 2,
  target_time: 28.5,
  status: "active",
  ...over,
});

const normalize = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

function renderScreen() {
  const queryClient = makeQueryClient();
  return render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });
}

describe("TeamRecordStyleDetailScreen — 目標バッジ (M2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };
    mocks.getStyles.mockResolvedValue(mocks.styles);
    mocks.getBestTimesDetailedForUsers.mockResolvedValue(new Map());
    mocks.listForCompetition.mockResolvedValue([]);
    mocks.responses["select:competitions"] = { data: { id: "comp-1", title: "テスト大会", pool_type: 0 }, error: null };
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.responses["select:records"] = {
      data: [makeRecord({ id: "r1", userId: "user-10", name: "山田", styleId: 2, time: 27.0, isRelaying: false })],
      error: null,
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("個人種目カード", () => {
    it("目標があれば「目標: 28.50」が出て、RPC は (teamId, competitionId) で1回だけ呼ばれる", async () => {
      mocks.listForCompetition.mockResolvedValue([goal()]);
      renderScreen();
      await waitFor(() => expect(goalBadges()).toEqual([goalText("28.50")]));
      expect(mocks.listForCompetition).toHaveBeenCalledTimes(1);
      expect(mocks.listForCompetition).toHaveBeenCalledWith("team-1", "comp-1");
    });

    it("目標が無ければ出ない (アンカー対: 同じ描画で RPC の戻りだけが表示を変える)", async () => {
      renderScreen();
      await waitFor(() => expect(mocks.listForCompetition).toHaveBeenCalled());
      expect(screen.getByDisplayValue("27.00")).toBeDefined();
      expect(goalBadges()).toEqual([]);
    });

    it("cancelled / 別大会 / 別種目 / 別メンバーの目標は山田の行に出ない", async () => {
      mocks.listForCompetition.mockResolvedValue([
        goal({ status: "cancelled" }),
        goal({ competition_id: "comp-OTHER", target_time: 20 }),
        goal({ style_id: 9, target_time: 21 }),
        goal({ user_id: "user-99", target_time: 22 }),
      ]);
      renderScreen();
      await waitFor(() => expect(mocks.listForCompetition).toHaveBeenCalled());
      expect(screen.getByDisplayValue("27.00")).toBeDefined();
      expect(goalBadges()).toEqual([]);
    });

    it("achieved は出る", async () => {
      mocks.listForCompetition.mockResolvedValue([goal({ status: "achieved", target_time: 27.5 })]);
      renderScreen();
      await waitFor(() => expect(goalBadges()).toEqual([goalText("27.50")]));
    });

    it("同じ種目の2選手: それぞれ自分の目標が自分の行に出る (混線しない)。目標の無い選手の行には出ない", async () => {
      mocks.responses["select:records"] = {
        data: [
          makeRecord({ id: "r1", userId: "user-10", name: "山田", styleId: 2, time: 27.0, isRelaying: false }),
          makeRecord({ id: "r2", userId: "user-11", name: "鈴木", styleId: 2, time: 28.0, isRelaying: false }),
          makeRecord({ id: "r3", userId: "user-12", name: "佐藤", styleId: 2, time: 29.0, isRelaying: false }),
        ],
        error: null,
      };
      mocks.listForCompetition.mockResolvedValue([
        goal({ user_id: "user-10", target_time: 26 }),
        goal({ user_id: "user-11", target_time: 27 }),
      ]);
      renderScreen();
      // 画面は選手ごとのタブ (1人ずつ表示)。山田 → 鈴木 → 佐藤 と切り替えて、各タブの目標を確認する
      await waitFor(() => expect(goalBadges()).toEqual([goalText("26.00")]));
      fireEvent.click(screen.getByText("鈴木"));
      await waitFor(() => expect(goalBadges()).toEqual([goalText("27.00")]));
      fireEvent.click(screen.getByText("佐藤"));
      await waitFor(() => expect(screen.getByDisplayValue("29.00")).toBeDefined());
      expect(goalBadges()).toEqual([]);
    });

    it("ベストバッジがあるとき、目標バッジは DOM 順でベストバッジの後ろ (直下)", async () => {
      mocks.listForCompetition.mockResolvedValue([goal()]);
      mocks.getBestTimesDetailedForUsers.mockResolvedValue(
        new Map([["user-10", [makeBestTime({ styleId: 2, time: 26.5, poolType: 0 })]]]),
      );
      renderScreen();
      await waitFor(() => expect(goalBadges()).toHaveLength(1));
      const best = screen.getByText((_c, el) => el?.tagName === "SPAN" && normalize(el.textContent) === `${LABEL.bestTimeLabel}: 26.50`);
      const goalEl = screen.getByText((_c, el) => el?.tagName === "SPAN" && normalize(el.textContent) === goalText("28.50"));
      expect(best.compareDocumentPosition(goalEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("ベストタイムが無くても目標は出る", async () => {
      mocks.listForCompetition.mockResolvedValue([goal()]);
      renderScreen();
      await waitFor(() => expect(goalBadges()).toEqual([goalText("28.50")]));
    });

    it("メンバー一覧が変化しても目標の RPC は再実行されない (依存は supabase/teamId/competitionId のみ)", async () => {
      mocks.listForCompetition.mockResolvedValue([goal()]);
      const queryClient = makeQueryClient();
      const view = render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });
      await waitFor(() => expect(goalBadges()).toHaveLength(1));
      mocks.teamMembers = [
        { user_id: "user-1", role: "admin", users: { id: "user-1", name: "管理者" } },
        { user_id: "user-10", role: "user", users: { id: "user-10", name: "山田" } },
      ];
      view.rerender(<TeamRecordStyleDetailScreen />);
      await waitFor(() => expect(screen.getByDisplayValue("27.00")).toBeDefined());
      expect(mocks.listForCompetition).toHaveBeenCalledTimes(1);
    });

    it("目標取得が reject しても画面は描画され入力でき、バッジだけ出ない (エラー文も出ない)", async () => {
      mocks.listForCompetition.mockRejectedValue(new Error("rpc down"));
      renderScreen();
      await waitFor(() => expect(mocks.listForCompetition).toHaveBeenCalled());
      expect(await screen.findByDisplayValue("27.00")).toBeDefined();
      expect(goalBadges()).toEqual([]);
      expect(screen.queryByText(/rpc down/)).toBeNull();
    });
  });

  describe("リレー4レグ", () => {
    beforeEach(() => {
      mocks.routeParams = { competitionId: "comp-1", teamId: "team-1", relayEventId: "relay_4x50_medley" };
      mocks.responses["select:records"] = { data: medleyRelayRecords(), error: null };
    });
    const legGoals = () => [
      goal({ user_id: "user-10", style_id: 13, target_time: 30 }), // 第1泳者 (背)
      goal({ user_id: "user-11", style_id: 9, target_time: 33 }), // 第2泳者 (平)
      goal({ user_id: "user-12", style_id: 17, target_time: 29 }), // 第3泳者 (バタ)
      goal({ user_id: "user-13", style_id: 2, target_time: 26 }), // 第4泳者 (自)
    ];

    it("第1泳者 (引き継ぎなし) にだけ出る。第2〜4泳者 (引き継ぎあり) には目標があっても出ない", async () => {
      mocks.listForCompetition.mockResolvedValue(legGoals());
      renderScreen();
      await waitFor(() => expect(mocks.listForCompetition).toHaveBeenCalled());
      await waitFor(() => expect(goalBadges()).toEqual([goalText("30.00")]));
    });

    it("第1泳者でもレグの種目と違う種目の目標しか無ければ出ない", async () => {
      mocks.listForCompetition.mockResolvedValue([goal({ user_id: "user-10", style_id: 2, target_time: 30 })]);
      renderScreen();
      await waitFor(() => expect(mocks.listForCompetition).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 30));
      expect(goalBadges()).toEqual([]);
    });
  });
});
