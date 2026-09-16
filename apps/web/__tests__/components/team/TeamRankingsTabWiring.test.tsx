/**
 * ランキングタブの配線 (web) — QA Sprint Contract Phase B
 *
 * PM 裁定 [V-30]: `rankings` タブは **3面すべて** に出す。
 *   1. web 一般      … components/team/TeamTabs.tsx      (teams.tabs.rankings)
 *   2. web 管理者    … components/team/TeamAdminTabs.tsx (teamsAdmin.tabs.rankings)
 *   3. mobile        … apps/mobile/components/teams/TeamTabs.tsx (別テストで検証)
 *
 * Sprint Contract 検証観点:
 *   [V-30a] 一般タブに rankings が「大会」の直後に並ぶ (タブ総数の厳密一致つき)
 *   [V-30b] 管理者タブに rankings が「大会」の直後に並ぶ (タブ総数の厳密一致つき)
 *   [V-30c] rankings タブのクリックで onTabChange("rankings") が飛ぶ
 *   [V-31a] URL の ?tab=rankings で直接ランキングタブが開く (一般ページ)
 *   [V-31b] URL の ?tab=rankings で直接ランキングタブが開く (管理者ページ)
 *   [V-31c] ?tab=<未知の値> ではランキングに落ちない (ホワイトリストが効いている)
 *
 * タブ総数を「厳密一致」で見る理由: `toContain("ランキング")` だけだと、
 * 誰かがタブを1つ消しても・重複追加しても緑のまま通る。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import TeamTabs from "@/components/team/TeamTabs";
import TeamAdminTabs from "@/components/team/TeamAdminTabs";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  rankingsSpy: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  usePathname: () => "/ja/teams/team-kingfisher",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    user: { id: "usr-kingfisher-7" },
    supabase: {
      // TeamAdminClient は承認待ち件数の取得で requireTeamAdmin → auth.getUser() を通る。
      // このテストの関心はタブ配線なので、認証だけ通して件数は 0 にする
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "usr-kingfisher-7" } }, error: null }),
      },
      from: vi.fn(() => {
        const builder: Record<string, unknown> = {};
        for (const method of ["select", "eq", "order", "in"]) {
          builder[method] = vi.fn(() => builder);
        }
        builder.single = vi.fn(async () => ({
          data: { role: "admin", status: "approved", is_active: true },
          error: null,
        }));
        builder.then = (onfulfilled?: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null, count: 0 }).then(onfulfilled);
        return builder;
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    },
  }),
}));

// タブの中身はこのテストの関心外。「どのタブがマウントされたか」だけを spy で捕捉する
vi.mock("@/components/team/rankings/TeamRankings", () => ({
  default: (props: { teamId: string }) => {
    mocks.rankingsSpy(props);
    return <div data-testid="rankings-tab-stub" />;
  },
}));
vi.mock("@/components/team/TeamMemberManagement", () => ({
  default: () => <div data-testid="members-tab-stub" />,
}));
vi.mock("@/components/team/TeamPractices", () => ({
  default: () => <div data-testid="practices-tab-stub" />,
}));
vi.mock("@/components/team/TeamCompetitions", () => ({
  default: () => <div data-testid="competitions-tab-stub" />,
}));
vi.mock("@/components/team/MyMonthlyAttendance", () => ({
  default: () => <div data-testid="attendance-tab-stub" />,
}));
vi.mock("@/components/team/AdminMonthlyAttendance", () => ({
  default: () => <div data-testid="admin-attendance-tab-stub" />,
}));
vi.mock("@/components/team/TeamAnnouncements", () => ({
  TeamAnnouncements: () => <div data-testid="announcements-tab-stub" />,
}));
vi.mock("@/components/team/TeamSettings", () => ({
  default: () => <div data-testid="settings-tab-stub" />,
}));
vi.mock("@/components/team/TeamBulkRegister", () => ({
  default: () => <div data-testid="bulk-register-tab-stub" />,
}));
vi.mock("@/components/team/group-management/TeamGroupManagement", () => ({
  default: () => <div data-testid="groups-tab-stub" />,
}));
vi.mock("@/components/team/MemberDetailModal", () => ({ default: () => null }));

function wrap(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const TEAM_ID = "team-kingfisher";

const TEAM: never = {
  id: TEAM_ID,
  name: "QA カワセミ",
  invite_code: "QA-KINGFISHER",
  members: [],
} as unknown as never;

const MEMBERSHIP_ADMIN: never = {
  id: "mem-admin",
  team_id: TEAM_ID,
  user_id: "usr-kingfisher-7",
  role: "admin",
  status: "approved",
  is_active: true,
} as unknown as never;

const MEMBERSHIP_MEMBER: never = {
  ...(MEMBERSHIP_ADMIN as unknown as Record<string, unknown>),
  role: "user",
} as unknown as never;

describe("[V-30a] web 一般タブ (TeamTabs)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 本スプリントで全メンバー向けの「設定」タブが末尾に追加された (5→6)。
  // **実装が正で期待値が古い赤**だったため期待値側を更新している。
  it("タブがちょうど 6 つで、順序は 出欠 / メンバー / 練習 / 大会 / ランキング / 設定", () => {
    wrap(<TeamTabs activeTab="members" onTabChange={vi.fn()} />);

    const labels = screen.getAllByRole("button").map((button) => button.textContent?.trim());
    expect(labels).toEqual([
      messages.teams.tabs.attendance,
      messages.teams.tabs.members,
      messages.teams.tabs.practices,
      messages.teams.tabs.competitions,
      messages.teams.tabs.rankings,
      messages.teams.tabs.settings,
    ]);
  });

  it("[V-30c] ランキングタブをクリックすると onTabChange('rankings') が呼ばれる", async () => {
    const onTabChange = vi.fn();
    wrap(<TeamTabs activeTab="members" onTabChange={onTabChange} />);

    await userEvent.click(screen.getByRole("button", { name: messages.teams.tabs.rankings }));

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("rankings");
  });

  it("isAdmin=false でもランキングタブは隠れない (一般メンバーも閲覧できる)", () => {
    wrap(<TeamTabs activeTab="members" isAdmin={false} onTabChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: messages.teams.tabs.rankings }),
    ).toBeInTheDocument();
  });
});

describe("[V-30b] web 管理者タブ (TeamAdminTabs)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("タブがちょうど 9 つで、ランキングは大会の直後にある", () => {
    wrap(<TeamAdminTabs activeTab="members" onTabChange={vi.fn()} />);

    const labels = screen.getAllByRole("button").map((button) => button.textContent?.trim());
    expect(labels).toEqual([
      messages.teamsAdmin.tabs.attendance,
      messages.teamsAdmin.tabs.announcements,
      messages.teamsAdmin.tabs.members,
      messages.teamsAdmin.tabs.groups,
      messages.teamsAdmin.tabs.practices,
      messages.teamsAdmin.tabs.competitions,
      messages.teamsAdmin.tabs.rankings,
      messages.teamsAdmin.tabs.bulkRegister,
      messages.teamsAdmin.tabs.settings,
    ]);
  });

  it("[V-30c] ランキングタブをクリックすると onTabChange('rankings') が呼ばれる", async () => {
    const onTabChange = vi.fn();
    wrap(<TeamAdminTabs activeTab="members" onTabChange={onTabChange} />);

    await userEvent.click(screen.getByRole("button", { name: messages.teamsAdmin.tabs.rankings }));

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("rankings");
  });

  it("承認待ちバッジはメンバータブ側にだけ付く (ランキングタブに漏れない)", () => {
    wrap(<TeamAdminTabs activeTab="members" pendingCount={3} onTabChange={vi.fn()} />);

    const rankingsTab = screen.getByRole("button", { name: messages.teamsAdmin.tabs.rankings });
    expect(rankingsTab.textContent).toBe(messages.teamsAdmin.tabs.rankings);
    expect(
      screen.getByRole("button", { name: `${messages.teamsAdmin.tabs.members} 3` }),
    ).toBeInTheDocument();
  });
});

describe("[V-31a] 一般ページの ?tab=rankings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
  });

  async function renderDetailClient(tab?: string) {
    if (tab !== undefined) mocks.searchParams = new URLSearchParams(`tab=${tab}`);
    const { default: TeamDetailClient } = await import(
      "../../../app/[locale]/(authenticated)/teams/[teamId]/_client/TeamDetailClient"
    );
    // Zustand ストアはモジュールスコープで永続するため、activeTab を既定に戻す
    const { useTeamDetailStore } = await import("@/stores/form/teamDetailStore");
    useTeamDetailStore.getState().setActiveTab("members");
    return wrap(
      <TeamDetailClient teamId={TEAM_ID} initialTeam={TEAM} initialMembership={MEMBERSHIP_MEMBER} />,
    );
  }

  it("?tab=rankings で TeamRankings がマウントされ teamId が渡る", async () => {
    await renderDetailClient("rankings");

    await waitFor(() => expect(screen.getByTestId("rankings-tab-stub")).toBeInTheDocument());
    expect(mocks.rankingsSpy).toHaveBeenCalledWith(expect.objectContaining({ teamId: TEAM_ID }));
  });

  it("?tab 未指定ではランキングがマウントされない (既定はメンバー)", async () => {
    await renderDetailClient();

    await waitFor(() => expect(screen.getByTestId("members-tab-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("rankings-tab-stub")).toBeNull();
  });

  it("[V-31c] ?tab=ranking (単数形のタイポ) ではランキングに落ちない", async () => {
    await renderDetailClient("ranking");

    await waitFor(() => expect(screen.getByTestId("members-tab-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("rankings-tab-stub")).toBeNull();
  });
});

describe("[V-31b] 管理者ページの ?tab=rankings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
  });

  async function renderAdminClient(tab?: string) {
    if (tab !== undefined) mocks.searchParams = new URLSearchParams(`tab=${tab}`);
    const { default: TeamAdminClient } = await import(
      "../../../app/[locale]/(authenticated)/teams-admin/[teamId]/_client/TeamAdminClient"
    );
    const { useTeamAdminStore } = await import("@/stores/form/teamAdminStore");
    useTeamAdminStore.getState().setActiveTab("members");
    return wrap(
      <TeamAdminClient teamId={TEAM_ID} initialTeam={TEAM} initialMembership={MEMBERSHIP_ADMIN} />,
    );
  }

  it("?tab=rankings で TeamRankings がマウントされ teamId が渡る", async () => {
    await renderAdminClient("rankings");

    await waitFor(() => expect(screen.getByTestId("rankings-tab-stub")).toBeInTheDocument());
    expect(mocks.rankingsSpy).toHaveBeenCalledWith(expect.objectContaining({ teamId: TEAM_ID }));
  });

  it("[V-31c] ?tab=rankings-admin のような近い綴りではランキングに落ちない", async () => {
    await renderAdminClient("rankings-admin");

    await waitFor(() => expect(screen.getByTestId("members-tab-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("rankings-tab-stub")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [V-32] `?tab=` で着地したタブから離脱できる (既存バグの根治確認)
//
// Phase B のブラウザ検証 (B-19c/B-19d) で、`?tab=<x>` を持つ URL に着地すると
// **どのタブをクリックしても即座に `<x>` へ戻される**ことを実測しました。
// 原因は `useEffect([searchParams, ...])` が毎レンダー再実行され、
// クリックで変えた activeTab を URL 値へ上書きしていたことです
// (ランキングと無関係な `?tab=members` → 「練習」でも再現したため既存バグ)。
//
// 現在は `appliedTabParamRef` で「URL の tab 値が実際に変わったときだけ反映する」
// 形になっています。ランキングは deep link 前提の新タブなので、ここに着地した
// ユーザーが他タブへ移動できることを回帰テストとして固定します。
// ---------------------------------------------------------------------------
describe("[V-32] ?tab= 着地後のタブ切替", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
  });

  async function renderDetailAt(tab: string) {
    mocks.searchParams = new URLSearchParams(`tab=${tab}`);
    const { default: TeamDetailClient } = await import(
      "../../../app/[locale]/(authenticated)/teams/[teamId]/_client/TeamDetailClient"
    );
    const { useTeamDetailStore } = await import("@/stores/form/teamDetailStore");
    useTeamDetailStore.getState().setActiveTab("members");
    return wrap(
      <TeamDetailClient teamId={TEAM_ID} initialTeam={TEAM} initialMembership={MEMBERSHIP_MEMBER} />,
    );
  }

  it("?tab=rankings に着地してから「メンバー」タブへ移動できる", async () => {
    await renderDetailAt("rankings");
    await waitFor(() => expect(screen.getByTestId("rankings-tab-stub")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: messages.teams.tabs.members }));

    await waitFor(() => expect(screen.getByTestId("members-tab-stub")).toBeInTheDocument());
    // URL 値へ引き戻されていないこと
    expect(screen.queryByTestId("rankings-tab-stub")).toBeNull();
  });

  it("?tab=rankings に着地してから「練習」タブへ移動できる", async () => {
    await renderDetailAt("rankings");
    await waitFor(() => expect(screen.getByTestId("rankings-tab-stub")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: messages.teams.tabs.practices }));

    await waitFor(() => expect(screen.getByTestId("practices-tab-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("rankings-tab-stub")).toBeNull();
  });

  it("ランキングと無関係な組み合わせ (?tab=members → 練習) でも切り替えられる", async () => {
    // 既存バグはランキング固有ではなかったので、対照としてこの組み合わせも押さえる
    await renderDetailAt("members");
    await waitFor(() => expect(screen.getByTestId("members-tab-stub")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: messages.teams.tabs.practices }));

    await waitFor(() => expect(screen.getByTestId("practices-tab-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("members-tab-stub")).toBeNull();
  });

  it("?tab=rankings に着地してからランキングタブを再クリックしても壊れない (冪等)", async () => {
    await renderDetailAt("rankings");
    await waitFor(() => expect(screen.getByTestId("rankings-tab-stub")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: messages.teams.tabs.rankings }));

    await waitFor(() => expect(screen.getByTestId("rankings-tab-stub")).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// [V-33] タブ定義が単一定義元から導出されている
//
// `TEAM_TAB_DEFS` / `TEAM_ADMIN_TAB_DEFS` を唯一の定義元にし、union 型・
// 表示配列・URL ホワイトリスト判定をすべてそこから導出する形になりました。
// 「表示はされるがホワイトリストに無い」「型にはあるが表示されない」の
// 片側漏れを検出するため、`isTeamTabType` / `isTeamAdminTabType` と
// 実際に描画されるタブの集合が一致することを確認します。
// ---------------------------------------------------------------------------
describe("[V-33] タブ定義の単一定義元", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("一般タブ: 描画される6タブがすべて isTeamTabType を通り、rankings / settings も含まれる", async () => {
    const { isTeamTabType } = await import("@/components/team/TeamTabs");

    // 描画されるラベル → id の対応はテスト側に手書きする (実装から導出しない)
    const expectedIds = [
      "attendance",
      "members",
      "practices",
      "competitions",
      "rankings",
      // 本スプリントで追加。以前はここが「通ってはいけない」側に入っていたが、
      // 設定タブは全メンバー向けの正式なタブになったため有効側へ移した
      // (`?tab=settings` での直接着地を許可する)
      "settings",
    ];
    for (const id of expectedIds) {
      expect(isTeamTabType(id), `${id} がホワイトリストに無い`).toBe(true);
    }
    // 管理者専用タブ・未知の値は通らない
    for (const id of ["announcements", "groups", "bulk-register", "setting", "ranking", ""]) {
      expect(isTeamTabType(id), `${id} がホワイトリストを通ってしまう`).toBe(false);
    }

    wrap(<TeamTabs activeTab="members" onTabChange={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(expectedIds.length);
  });

  it("管理者タブ: 描画される9タブがすべて isTeamAdminTabType を通る", async () => {
    const { isTeamAdminTabType } = await import("@/components/team/TeamAdminTabs");

    const expectedIds = [
      "attendance",
      "announcements",
      "members",
      "groups",
      "practices",
      "competitions",
      "rankings",
      "bulk-register",
      "settings",
    ];
    for (const id of expectedIds) {
      expect(isTeamAdminTabType(id), `${id} がホワイトリストに無い`).toBe(true);
    }
    for (const id of ["rankings-admin", "ranking", ""]) {
      expect(isTeamAdminTabType(id), `${id} がホワイトリストを通ってしまう`).toBe(false);
    }

    wrap(<TeamAdminTabs activeTab="members" onTabChange={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(expectedIds.length);
  });
});
