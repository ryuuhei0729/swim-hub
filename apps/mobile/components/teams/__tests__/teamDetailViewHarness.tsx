// =============================================================================
// teamDetailViewHarness.tsx
// TeamDetailView (チームタブの中身) を render するテストの共通モック。
// =============================================================================
//
// このファイルを import するだけで、下記モジュールが vi.mock される。
//
//   @/contexts/AuthProvider            共通モック。user-1 でログイン済み
//   @apps/shared/hooks/queries/teams   useTeamsQuery は teamId ごとのチームを返す。
//                                      harness.nonAdminTeamIds に入れたチームでは一般メンバー、
//                                      harness.membersLoading が true の間は members が未取得、
//                                      harness.pendingApprovalTeamIds に入れたチームは承認待ち
//   ../TeamMemberList ほかタブの中身    どのタブが出ているか分かるマーカー (MEMBERS_MARKER 等) を描く
//   ../member-goals/TeamMemberGoalsTab GOALS_TAB_MARKER を描き、props を harness.goalsSpy に渡す
//
// TeamTabs は検証対象 (管理者専用タブの出し分け) なので実物を使う。
// バレル (@/components/teams) は group-management 経由で react-native-gesture-handler を
// 読み込みパースできないため、TeamDetailView が import する個別ファイルをモックしている。
//
// 🚨 テストファイル側で上記モジュールを vi.mock し直してはいけない (黙って無効になる。
//    screenHarnesses.test.ts が検出する)。挙動を変えたいときは harness にプロパティを足す。
//
// このファイルは `import { TeamDetailView } from "../TeamDetailView"` より前に import する。

import React from "react";
import { vi } from "vitest";

const harness = vi.hoisted(() => ({
  refetch: vi.fn(),
  // このセットに含まれる teamId は非管理者メンバーとして扱う
  nonAdminTeamIds: new Set<string>(),
  // true の間はメンバー情報が未取得 (管理者かどうかがまだ分からない) として返す
  membersLoading: false,
  // このセットに含まれる teamId は承認待ち (useTeamsQuery が PENDING_APPROVAL エラーを返す)
  pendingApprovalTeamIds: new Set<string>(),
  goalsSpy: vi.fn(),
}));

// 共通モック (contexts/__mocks__/AuthProvider.tsx)。既定で user-1 がログイン済み
vi.mock("@/contexts/AuthProvider");

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: (_supabase: unknown, options?: { teamId?: string }) => {
    const teamId = options?.teamId ?? "team-1";
    const isAdmin = !harness.nonAdminTeamIds.has(teamId);
    if (harness.pendingApprovalTeamIds.has(teamId)) {
      return {
        currentTeam: undefined,
        members: undefined,
        announcements: undefined,
        isLoading: false,
        isError: true,
        error: new Error("PENDING_APPROVAL"),
        refetch: harness.refetch,
      };
    }
    return {
      currentTeam: {
        id: teamId,
        name: teamId === "team-1" ? "テストチーム" : "テストチーム2",
        description: null,
        invite_code: null,
      },
      members: harness.membersLoading ? undefined : [{ user_id: "user-1", role: isAdmin ? "admin" : "member" }],
      announcements: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: harness.refetch,
    };
  },
  useListPendingMembersQuery: () => ({ data: [] }),
  useDeleteAnnouncementMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../TeamMemberList", () => ({ TeamMemberList: () => <span>MEMBERS_MARKER</span> }));
vi.mock("../PendingMembersSection", () => ({
  PendingMembersSection: () => <span>PENDING_MEMBERS_MARKER</span>,
}));
vi.mock("../MyMonthlyAttendance", () => ({ MyMonthlyAttendance: () => <span>MY_ATTENDANCE_MARKER</span> }));
vi.mock("../AdminMonthlyAttendance", () => ({
  AdminMonthlyAttendance: () => <span>ADMIN_ATTENDANCE_MARKER</span>,
}));
vi.mock("../group-management", () => ({ TeamGroupManagement: () => <span>GROUPS_MARKER</span> }));
vi.mock("../TeamSettingsTab", () => ({ TeamSettingsTab: () => <span>SETTINGS_MARKER</span> }));
vi.mock("../TeamAnnouncementList", () => ({ TeamAnnouncementList: () => null }));
vi.mock("../TeamAnnouncementForm", () => ({ TeamAnnouncementForm: () => null }));
vi.mock("../TeamPracticeList", () => ({ TeamPracticeList: () => <span>PRACTICES_MARKER</span> }));
vi.mock("../TeamCompetitionList", () => ({ TeamCompetitionList: () => null }));
vi.mock("../rankings", () => ({ TeamRankings: () => null }));
vi.mock("../member-goals/TeamMemberGoalsTab", () => ({
  TeamMemberGoalsTab: (props: { teamId: string }) => {
    harness.goalsSpy(props);
    return <span>GOALS_TAB_MARKER</span>;
  },
}));

export { harness };
