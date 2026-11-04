// =============================================================================
// TeamsScreen.teamHome.test.tsx
// =============================================================================
//
// チームタブは一覧を挟まず、最後に開いたチームをそのまま表示する。
//
//   [V-01..03] 所属0件のときは中央に作成・参加の CTA を出し、押すとそれぞれのモーダルが開く
//   [TH-01] 最後に開いたチームが無ければ承認済みの先頭を表示する
//   [TH-02] 最後に開いたチームを表示する (先頭でなくても)
//   [TH-03] 最後に開いたチームが一覧に無い (脱退など) ときは承認済みの先頭へ倒れる
//   [TH-04] 承認待ちしか無ければ承認待ちのチームを表示し、中央 CTA にはしない
//   [TH-05] 他画面からの teamId / initialTab で、そのチーム・タブを開き、params を消す
//   [TH-06] 切替シートでチームを選ぶと表示が切り替わり、最後に開いたチームとして覚える
//   [TH-07] 切替シートの「作成」は、シートが閉じ終わってから作成モーダルを開く
//   [TH-08] 作成したチームは一覧の再取得後に選ぶ
//   [TH-05] asMember (自分の出欠に回答する導線) ではそのチームの管理者ビューを OFF にして開く
//   [TH-09] 脱退したら、一覧の再取得を待たず (失敗しても) 脱退したチームを除いて残りへ倒す
//   [TH-10] タブに戻ったら、一覧と表示中のチームの情報 (teamKeys.detail 配下) を取り直す
//
// TeamDetailView・TeamSwitcherSheet・各モーダルは、TeamsScreen との受け渡し (props の配線) だけを
// 見る薄いスタブにする。中身はそれぞれのテストで見る。
// Pressable の testID は RN モックで DOM 属性 `testid` として素通しされる (`__mocks__/react-native.ts`)。

import { act, fireEvent, render } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => ({
  teams: [] as unknown[],
  refetch: vi.fn(),
  focusRefresh: null as null | (() => void),
  // 切替シートの「閉じ終わった」通知。テストが好きなタイミングで呼ぶ
  switcherOnClosed: null as null | (() => void),
}));

vi.mock("@/contexts/AuthProvider");

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({
    teams: mocks.teams,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mocks.refetch,
  }),
}));

vi.mock("@/hooks/useRefreshOnFocus", () => ({
  useRefreshOnFocus: (refresh: () => void) => {
    mocks.focusRefresh = refresh;
  },
}));

vi.mock("@/components/teams/TeamDetailView", () => ({
  TeamDetailView: ({
    teamId,
    teamName,
    onOpenSwitcher,
    onLeftTeam,
  }: {
    teamId: string;
    teamName: string;
    onOpenSwitcher: () => void;
    onLeftTeam: () => void;
  }) => (
    <div data-testid="team-view" data-team-id={teamId}>
      {teamName}
      <button data-testid="open-switcher" onClick={onOpenSwitcher} />
      <button data-testid="leave-team" onClick={onLeftTeam} />
    </div>
  ),
}));

// 閉じ終わりの通知 (SlideUpModal の onClosed) はテストから mocks.switcherOnClosed で呼ぶ
vi.mock("@/components/teams/TeamSwitcherSheet", () => ({
  TeamSwitcherSheet: ({
    visible,
    onClosed,
    approvedTeams,
    pendingTeams,
    onSelect,
    onCreate,
    onJoin,
  }: {
    visible: boolean;
    onClosed?: () => void;
    approvedTeams: TeamMembershipWithUser[];
    pendingTeams: TeamMembershipWithUser[];
    onSelect: (teamId: string) => void;
    onCreate: () => void;
    onJoin: () => void;
  }) => {
    mocks.switcherOnClosed = onClosed ?? null;
    if (!visible) return null;
    return (
      <div data-testid="switcher">
        {[...approvedTeams, ...pendingTeams].map((m) => (
          <button
            key={m.team_id}
            data-testid={`switcher-option-${m.team_id}`}
            onClick={() => onSelect(m.team_id)}
          />
        ))}
        <button data-testid="switcher-create" onClick={onCreate} />
        <button data-testid="switcher-join" onClick={onJoin} />
      </div>
    );
  },
}));

vi.mock("@/components/teams/TeamCreateModal", () => ({
  TeamCreateModal: ({
    visible,
    onSuccess,
  }: {
    visible: boolean;
    onSuccess?: (teamId: string) => void;
  }) =>
    visible ? (
      <div data-testid="team-create-modal-marker">
        <button data-testid="create-success" onClick={() => onSuccess?.("team-new")} />
      </div>
    ) : null,
}));
vi.mock("@/components/teams/TeamJoinModal", () => ({
  TeamJoinModal: ({ visible }: { visible: boolean }) =>
    visible ? <div data-testid="team-join-modal-marker" /> : null,
}));

import { TeamsScreen } from "../TeamsScreen";
import { useTeamViewStore } from "@/stores/teamViewStore";
import { teamKeys } from "@apps/shared/hooks/queries/keys";

type ScreenProps = React.ComponentProps<typeof TeamsScreen>;

function makeMembership(
  overrides: Partial<TeamMembershipWithUser> & { id: string; team_id: string },
): TeamMembershipWithUser {
  const { id, team_id, ...rest } = overrides;
  return {
    id,
    team_id,
    user_id: "user-1",
    role: "admin",
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    users: { id: "user-1", name: "テストユーザー" } as TeamMembershipWithUser["users"],
    teams: {
      id: team_id,
      name: `チーム-${team_id}`,
      description: null,
      invite_code: null,
      created_at: null,
      updated_at: null,
    },
    ...rest,
  } as TeamMembershipWithUser;
}

const alpha = makeMembership({ id: "m-alpha", team_id: "team-alpha" });
const beta = makeMembership({ id: "m-beta", team_id: "team-beta" });

let queryClient: QueryClient;
const setParams = vi.fn();

function renderScreen(params?: ScreenProps["route"]["params"]) {
  const props = {
    route: { key: "Teams-1", name: "Teams", params },
    navigation: { setParams },
  } as unknown as ScreenProps;
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <TeamsScreen {...props} />
    </QueryClientProvider>,
  );
  const q = (testId: string) => utils.container.querySelector(`[data-testid="${testId}"]`);
  const shownTeamId = () => q("team-view")?.getAttribute("data-team-id") ?? null;
  return { ...utils, q, shownTeamId };
}

describe("TeamsScreen — 最後に開いたチームを表示するチームタブ", () => {
  beforeEach(async () => {
    mocks.teams = [];
    mocks.focusRefresh = null;
    mocks.switcherOnClosed = null;
    mocks.refetch.mockResolvedValue(undefined);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // 端末からの読み込み (AsyncStorage モックは null を返す) を済ませてから状態を置く
    await useTeamViewStore.persist.rehydrate();
    useTeamViewStore.setState({ lastTeamId: null, byTeam: {} });
  });

  it("[V-01] 所属0件のとき、中央に作成・参加の CTA を出す", () => {
    const { container, q } = renderScreen();
    expect(container.querySelector('[testid="teams-empty-cta-create"]')).not.toBeNull();
    expect(container.querySelector('[testid="teams-empty-cta-join"]')).not.toBeNull();
    expect(q("team-view")).toBeNull();
  });

  it("[V-02][V-03] 中央 CTA の作成・参加で、それぞれのモーダルだけが開く", () => {
    const { container, q } = renderScreen();
    fireEvent.click(container.querySelector('[testid="teams-empty-cta-create"]') as HTMLElement);
    expect(q("team-create-modal-marker")).not.toBeNull();
    expect(q("team-join-modal-marker")).toBeNull();
  });

  it("[V-03] 中央 CTA の参加で参加モーダルが開く", () => {
    const { container, q } = renderScreen();
    fireEvent.click(container.querySelector('[testid="teams-empty-cta-join"]') as HTMLElement);
    expect(q("team-join-modal-marker")).not.toBeNull();
    expect(q("team-create-modal-marker")).toBeNull();
  });

  it("[TH-01] 最後に開いたチームが無ければ承認済みの先頭を表示する", () => {
    mocks.teams = [alpha, beta];
    const { shownTeamId, q } = renderScreen();
    expect(shownTeamId()).toBe("team-alpha");
    expect(q("team-view")?.textContent).toContain("チーム-team-alpha");
  });

  it("[TH-02] 最後に開いたチームを表示する (先頭でなくても)", () => {
    mocks.teams = [alpha, beta];
    useTeamViewStore.setState({ lastTeamId: "team-beta" });
    const { shownTeamId } = renderScreen();
    expect(shownTeamId()).toBe("team-beta");
  });

  it("[TH-03] 最後に開いたチームが一覧に無いときは承認済みの先頭へ倒れる", () => {
    mocks.teams = [alpha, beta];
    useTeamViewStore.setState({ lastTeamId: "team-left" });
    const { shownTeamId } = renderScreen();
    expect(shownTeamId()).toBe("team-alpha");
  });

  it("[TH-04] 承認待ちしか無ければそのチームを表示し、中央 CTA にはしない", () => {
    mocks.teams = [makeMembership({ id: "m-gamma", team_id: "team-gamma", status: "pending" })];
    const { shownTeamId, container } = renderScreen();
    expect(shownTeamId()).toBe("team-gamma");
    expect(container.querySelector('[testid="teams-empty-cta-create"]')).toBeNull();
  });

  it("[TH-05] teamId / initialTab の指定でそのチーム・タブを開き、params を消す", () => {
    mocks.teams = [alpha, beta];
    useTeamViewStore.setState({ lastTeamId: "team-alpha" });

    const { shownTeamId } = renderScreen({ teamId: "team-beta", initialTab: "attendance" });

    expect(shownTeamId()).toBe("team-beta");
    const state = useTeamViewStore.getState();
    expect(state.lastTeamId).toBe("team-beta");
    expect(state.byTeam["team-beta"]?.tab).toBe("attendance");
    expect(setParams).toHaveBeenCalledWith({
      teamId: undefined,
      initialTab: undefined,
      asMember: undefined,
    });
  });

  it("[TH-05] asMember の指定 (自分の出欠に回答する導線) では、そのチームの管理者ビューを OFF にして開く", () => {
    mocks.teams = [alpha, beta];
    useTeamViewStore.setState({
      byTeam: {
        "team-alpha": { adminView: true, tab: "groups" },
        "team-beta": { adminView: true, tab: "members" },
      },
    });

    renderScreen({ teamId: "team-alpha", initialTab: "attendance", asMember: true });

    const { byTeam } = useTeamViewStore.getState();
    expect(byTeam["team-alpha"]).toEqual({ adminView: false, tab: "attendance" });
    // 他のチームの好みは触らない
    expect(byTeam["team-beta"]).toEqual({ adminView: true, tab: "members" });
  });

  it("[TH-05] asMember が無ければ管理者ビューの保存値はそのまま", () => {
    mocks.teams = [alpha];
    useTeamViewStore.setState({ byTeam: { "team-alpha": { adminView: true } } });

    renderScreen({ teamId: "team-alpha", initialTab: "competitions" });

    expect(useTeamViewStore.getState().byTeam["team-alpha"]?.adminView).toBe(true);
  });

  it("[TH-06] 切替シートでチームを選ぶと表示が切り替わり、最後に開いたチームとして覚える", () => {
    mocks.teams = [alpha, beta];
    const { q, shownTeamId } = renderScreen();

    fireEvent.click(q("open-switcher") as HTMLElement);
    fireEvent.click(q("switcher-option-team-beta") as HTMLElement);

    expect(shownTeamId()).toBe("team-beta");
    expect(useTeamViewStore.getState().lastTeamId).toBe("team-beta");
    expect(q("switcher")).toBeNull();
  });

  it("[TH-07] 切替シートの「作成」は、シートが閉じ終わってから作成モーダルを開く", () => {
    mocks.teams = [alpha];
    const { q } = renderScreen();

    fireEvent.click(q("open-switcher") as HTMLElement);
    fireEvent.click(q("switcher-create") as HTMLElement);

    // シートは閉じ始めたが、閉じ終わるまでは作成モーダルを出さない (iOS は2つ同時に提示できない)
    expect(q("switcher")).toBeNull();
    expect(q("team-create-modal-marker")).toBeNull();

    act(() => {
      mocks.switcherOnClosed?.();
    });
    expect(q("team-create-modal-marker")).not.toBeNull();
    expect(q("team-join-modal-marker")).toBeNull();
  });

  it("[TH-07] チームを選んで閉じたときは、閉じ終わってもモーダルを開かない", () => {
    mocks.teams = [alpha, beta];
    const { q } = renderScreen();

    fireEvent.click(q("open-switcher") as HTMLElement);
    fireEvent.click(q("switcher-option-team-beta") as HTMLElement);
    act(() => {
      mocks.switcherOnClosed?.();
    });

    expect(q("team-create-modal-marker")).toBeNull();
    expect(q("team-join-modal-marker")).toBeNull();
  });

  it("[TH-08] 作成したチームは一覧の再取得が終わってから選ぶ", async () => {
    mocks.teams = [alpha];
    let finishRefetch: () => void = () => {};
    mocks.refetch.mockReturnValueOnce(new Promise<void>((resolve) => (finishRefetch = resolve)));
    const { q } = renderScreen();

    fireEvent.click(q("open-switcher") as HTMLElement);
    fireEvent.click(q("switcher-create") as HTMLElement);
    act(() => {
      mocks.switcherOnClosed?.();
    });
    fireEvent.click(q("create-success") as HTMLElement);

    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(useTeamViewStore.getState().lastTeamId).toBeNull();

    await act(async () => {
      finishRefetch();
    });
    expect(useTeamViewStore.getState().lastTeamId).toBe("team-new");
  });

  it("[TH-09] 脱退したら、一覧の再取得を待たず残りのチームへ倒し、選択を外す", () => {
    mocks.teams = [alpha, beta];
    useTeamViewStore.setState({ lastTeamId: "team-alpha" });
    const { q, shownTeamId } = renderScreen();
    expect(shownTeamId()).toBe("team-alpha");

    fireEvent.click(q("leave-team") as HTMLElement);

    expect(shownTeamId()).toBe("team-beta");
    expect(useTeamViewStore.getState().lastTeamId).toBeNull();
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("[TH-09] 一覧の再取得に失敗して古い一覧が残っても、脱退したチームへは戻らない", async () => {
    mocks.teams = [alpha, beta];
    mocks.refetch.mockRejectedValueOnce(new Error("network"));
    useTeamViewStore.setState({ lastTeamId: "team-alpha" });
    const { q, shownTeamId } = renderScreen();

    fireEvent.click(q("leave-team") as HTMLElement);
    await act(async () => {});

    // useTeamsQuery は脱退前の一覧 (alpha を含む) を返し続けている
    expect(shownTeamId()).toBe("team-beta");
  });

  it("[TH-10] タブに戻ったら一覧と表示中のチームの情報を取り直す", () => {
    mocks.teams = [alpha, beta];
    useTeamViewStore.setState({ lastTeamId: "team-beta" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderScreen();

    expect(mocks.focusRefresh).not.toBeNull();
    act(() => {
      mocks.focusRefresh?.();
    });

    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: teamKeys.detail("team-beta") });
  });
});
