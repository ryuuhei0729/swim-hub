// TeamDetailScreen の goals case — Sprint Contract v1
//   管理者ビュー OFF: タブも内容も出ない (initialTab=goals で直接開いても描画されない)
//   管理者ビュー ON : タブが出て、選ぶと TeamMemberGoalsTab が teamId つきでマウントされる
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routeParams: { teamId: "team-1", initialTab: undefined as string | undefined },
  goBack: vi.fn(),
  navigate: vi.fn(),
  setOptions: vi.fn(),
  refetch: vi.fn(),
  // V-08 検証用: このセットに含まれる teamId は非管理者メンバーとして扱う
  nonAdminTeamIds: new Set<string>(),
  goalsSpy: vi.fn(),
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => undefined),
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({
    navigate: mocks.navigate,
    goBack: mocks.goBack,
    setOptions: mocks.setOptions,
  }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  // teamId ごとにメンバー権限を切り替えられるようにする (V-08: 別チーム遷移で
  // 管理者ビューが漏れないことの検証に使う。teamId 未指定時は従来通り team-1/admin)。
  useTeamsQuery: (_supabase: unknown, options?: { teamId?: string }) => {
    const teamId = options?.teamId ?? "team-1";
    const isAdmin = mocks.nonAdminTeamIds.has(teamId) ? false : true;
    return {
      currentTeam: {
        id: teamId,
        name: teamId === "team-1" ? "テストチーム" : "テストチーム2",
        description: null,
        invite_code: null,
      },
      members: [{ user_id: "user-1", role: isAdmin ? "admin" : "member" }],
      announcements: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mocks.refetch,
    };
  },
  useListPendingMembersQuery: () => ({ data: [] }),
  useDeleteAnnouncementMutation: () => ({ mutateAsync: vi.fn() }),
}));

// TeamTabs は検証対象 (管理者専用タブの出し分け) のため実物を使う。
// それ以外の重量タブコンテンツ/一覧コンポーネントは薄いスタブに差し替える。
// バレル (@/components/teams) を importOriginal すると group-management 配下の
// BulkAssignModal.tsx が react-native-gesture-handler を読み込みパース不能になるため、
// TeamTabs.tsx のみを直接 importActual する (バレル全体は経由しない)。
vi.mock("@/components/teams", async () => {
  const { TeamTabs } = await vi.importActual<typeof import("@/components/teams/TeamTabs")>(
    "@/components/teams/TeamTabs",
  );
  return {
    TeamTabs,
    TeamMemberList: () => null,
    PendingMembersSection: () => <>PENDING_MEMBERS_MARKER</>,
    MyMonthlyAttendance: () => null,
    TeamGroupManagement: () => null,
  };
});
vi.mock("@/components/teams/AdminMonthlyAttendance", () => ({
  AdminMonthlyAttendance: () => null,
}));
vi.mock("@/components/teams/TeamSettingsModal", () => ({
  TeamSettingsModal: () => null,
}));
vi.mock("@/components/teams/TeamAnnouncementList", () => ({
  TeamAnnouncementList: () => null,
}));
vi.mock("@/components/teams/TeamAnnouncementForm", () => ({
  TeamAnnouncementForm: () => null,
}));
vi.mock("@/components/teams/TeamPracticeList", () => ({
  TeamPracticeList: () => null,
}));
vi.mock("@/components/teams/TeamCompetitionList", () => ({
  TeamCompetitionList: () => null,
}));

vi.mock("@/components/teams/member-goals/TeamMemberGoalsTab", () => ({
  TeamMemberGoalsTab: (props: { teamId: string }) => {
    mocks.goalsSpy(props);
    return <>GOALS_TAB_MARKER</>;
  },
}));
vi.mock("@/components/teams/rankings", () => ({ TeamRankings: () => null }));

import { TeamDetailScreen } from "../TeamDetailScreen";
import { useTeamAdminViewStore } from "@/stores/teamAdminViewStore";

describe("TeamDetailScreen — goals タブ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeParams.teamId = "team-1";
    mocks.routeParams.initialTab = undefined;
    mocks.nonAdminTeamIds.clear();
    useTeamAdminViewStore.getState().reset();
  });

  it("管理者ビュー OFF: 「目標」タブが無く、initialTab=goals でも中身を描画しない", () => {
    mocks.routeParams.initialTab = "goals";
    render(<TeamDetailScreen />);
    expect(screen.queryByText("目標")).toBeNull();
    expect(screen.queryByText("GOALS_TAB_MARKER")).toBeNull();
    expect(mocks.goalsSpy).not.toHaveBeenCalled();
  });

  it("非管理者がストアを ON にしても出ない", () => {
    mocks.nonAdminTeamIds.add("team-1");
    mocks.routeParams.initialTab = "goals";
    render(<TeamDetailScreen />);
    act(() => useTeamAdminViewStore.getState().setIsAdminView(true));
    expect(screen.queryByText("目標")).toBeNull();
    expect(screen.queryByText("GOALS_TAB_MARKER")).toBeNull();
  });

  it("管理者ビュー ON: タブをタップすると TeamMemberGoalsTab が teamId つきで描画される", () => {
    render(<TeamDetailScreen />);
    act(() => useTeamAdminViewStore.getState().setIsAdminView(true));
    expect(screen.queryByText("GOALS_TAB_MARKER")).toBeNull();
    fireEvent.click(screen.getByText("目標"));
    expect(screen.getByText("GOALS_TAB_MARKER")).toBeTruthy();
    expect(mocks.goalsSpy).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-1" }));
  });

  it("goals タブ表示中に管理者ビューを OFF にすると内容もタブも消える", () => {
    render(<TeamDetailScreen />);
    act(() => useTeamAdminViewStore.getState().setIsAdminView(true));
    fireEvent.click(screen.getByText("目標"));
    expect(screen.getByText("GOALS_TAB_MARKER")).toBeTruthy();
    act(() => useTeamAdminViewStore.getState().setIsAdminView(false));
    expect(screen.queryByText("GOALS_TAB_MARKER")).toBeNull();
    expect(screen.queryByText("目標")).toBeNull();
  });
});
