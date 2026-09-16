/**
 * teamAdminTabPersistence.test.tsx — QA 回帰ガード (teams-admin 側)
 *
 * 対象: apps/web/app/[locale]/(authenticated)/teams-admin/[teamId]/_client/TeamAdminClient.tsx
 *
 * `TeamDetailClient` と**同一パターンが2箇所**にあるため、片方だけ直すと
 * もう片方が静かに残る。teams-admin 側にも同じ不変条件を張る。
 * (一般ページ側は __tests__/app/teams/teamDetailTabPersistence.test.tsx)
 *
 * ■ 不変条件
 *   [V-TA-01] `?tab=settings` で開くと設定タブが出る
 *   [V-TA-02] タブをクリックすると表示が切り替わる
 *   [V-TA-03] 外部から `useTeamAdminStore.getState().reset()` された後でも
 *             URL が指すタブが**再適用される**
 *
 * ■ 🚨 `useSearchParams()` は「同一インスタンスを返す」モックであること
 *   毎レンダー新しい `URLSearchParams` を返すモックにすると、effect が毎回
 *   再実行されるので **罠の実装 (適用済み記録を購読せず `getState()` で読み、
 *   deps からも外す) でもテストが通ってしまう**。それでは外部 reset からの
 *   復帰を検証したことにならない。
 *   本ファイルは `nav.params` という単一インスタンスを返し、罠版へのミューテーション
 *   で [V-TA-03] が赤くなることを QA が実証済み。
 */

import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi, beforeEach } from "vitest";

import messages from "@apps/shared/messages/ja.json";

// 🚨 同一インスタンスを返す (上の注意書き参照)
const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({ useSearchParams: () => nav.params }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "me" }, session: null }),
}));
vi.mock("@apps/shared/api/teams/members", () => ({
  TeamMembersAPI: class {
    listPending = vi.fn(async () => []);
    countPending = vi.fn(async () => 0);
  },
}));
vi.mock("@/components/team/MemberDetailModal", () => ({ default: () => null }));

// タブ本文は「どれが描画されたか」だけ分かれば十分なので軽量スタブへ
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    const src = loader.toString();
    const id = src.includes("TeamAnnouncements") ? "announcements"
      : src.includes("TeamMemberManagement") ? "members"
      : src.includes("group-management") ? "groups"
      : src.includes("TeamPractices") ? "practices"
      : src.includes("TeamCompetitions") ? "competitions"
      : src.includes("rankings/TeamRankings") ? "rankings"
      : src.includes("TeamSettings") ? "settings"
      : src.includes("TeamBulkRegister") ? "bulk-register"
      : src.includes("AdminMonthlyAttendance") ? "attendance"
      : "unknown";
    const Stub = () => <div data-testid={`tab-content-${id}`} />;
    Stub.displayName = `DynamicStub(${id})`;
    return Stub;
  },
}));

import TeamAdminClient from "@/app/[locale]/(authenticated)/teams-admin/[teamId]/_client/TeamAdminClient";
import { useTeamAdminStore } from "@/stores/form/teamAdminStore";

const TEAM_ID = "team-kingfisher";
const TEAM = {
  id: TEAM_ID,
  name: "QA カワセミ",
  description: "説明",
  invite_code: "QA-INVITE",
  team_memberships: [{ user_id: "me", role: "admin", status: "approved", is_active: true }],
} as unknown as Parameters<typeof TeamAdminClient>[0]["initialTeam"];
const MEMBERSHIP = { id: "mem-1", team_id: TEAM_ID, user_id: "me", role: "admin" } as never;

const renderClient = (tab?: string) => {
  nav.params = new URLSearchParams(tab ? `tab=${tab}` : "");
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <TeamAdminClient
        teamId={TEAM_ID}
        initialTeam={TEAM}
        initialMembership={MEMBERSHIP}
        initialTab={tab}
      />
    </NextIntlClientProvider>,
  );
};

describe("TeamAdminClient — タブ表示の永続性", () => {
  beforeEach(() => {
    act(() => {
      useTeamAdminStore.getState().reset();
    });
  });

  it("[V-TA-01] ?tab=settings で開くと設定タブの本文が出る (前提)", async () => {
    renderClient("settings");
    expect(await screen.findByTestId("tab-content-settings")).toBeInTheDocument();
  });

  it("[V-TA-02] タブをクリックすると表示が切り替わる", async () => {
    renderClient();
    // 管理者タブの既定は出欠
    expect(await screen.findByTestId("tab-content-attendance")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: messages.teamsAdmin.tabs.settings }),
    );

    expect(await screen.findByTestId("tab-content-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-content-attendance")).not.toBeInTheDocument();
  });

  it("[V-TA-03] 外部から reset() されても URL のタブが再適用される", async () => {
    renderClient("settings");
    expect(await screen.findByTestId("tab-content-settings")).toBeInTheDocument();

    // AuthProvider.clearAllClientState() 相当 (アンマウントは伴わない)
    await act(async () => {
      useTeamAdminStore.getState().reset();
    });

    await waitFor(() => {
      expect(screen.getByTestId("tab-content-settings")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("tab-content-attendance")).not.toBeInTheDocument();
  });
});
