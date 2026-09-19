/**
 * teamDetailTabPersistence.test.tsx — QA 回帰ガード
 *
 * 対象: apps/web/app/[locale]/(authenticated)/teams/[teamId]/_client/TeamDetailClient.tsx
 *
 * ■ 背景 (ブラウザ実機で QA が観測した2症状)
 *   `/ja/teams/[teamId]` で
 *     (1) `?tab=settings` のディープリンクは**効く** (実機で確認済み)
 *     (2) しかし**タブをクリックしても表示が変わらない** (実機で確認済み。
 *         ボタンはハイドレート済みで React の onClick も接続されており、
 *         直接呼んでも例外は出ないが activeTab が変わらない)
 *
 *   `activeTab` はモジュールシングルトンの Zustand ストア
 *   (`stores/form/teamDetailStore.ts`) が保持する。ストアは
 *   `contexts/AuthProvider.tsx` の `clearAllClientState()` からも
 *   **コンポーネントをアンマウントせずに** `reset()` される経路がある
 *   (`signOut()` と `onAuthStateChange` の `SIGNED_OUT`)。
 *   その場合アンマウント cleanup は走らないため、URL のタブを
 *   「一度だけ適用する」ための ref が古い値のまま残り、**URL は
 *   `?tab=settings` を指しているのに表示は既定タブへ落ちたまま復帰しない**。
 *
 * ■ このファイルが固定する不変条件
 *   [V-TD-01] `?tab=settings` で初期表示すると設定タブが出る (前提。実機とも一致)
 *   [V-TD-02] タブをクリックすると表示が切り替わる
 *   [V-TD-03] 外部から `useTeamDetailStore.getState().reset()` された後でも、
 *             URL が指すタブが**再適用される**
 *
 * ■ ステータス
 *   本ファイルは **PM の指示により「赤のまま」提出**している。
 *   実装修正は PM から Web Developer へ指示される。QA は通すために
 *   プロダクションコードを変更しない。
 */

import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi, beforeEach } from "vitest";

import messages from "@apps/shared/messages/ja.json";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "me" }, session: null }),
}));

// タブ本文は「どれが描画されたか」だけ分かれば十分なので軽量スタブに差し替える。
// next/dynamic は同期解決させる
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    const name = loader.toString();
    const pick = (s: string) =>
      s.includes("TeamMemberManagement") ? "members"
      : s.includes("TeamPractices") ? "practices"
      : s.includes("TeamCompetitions") ? "competitions"
      : s.includes("rankings/TeamRankings") ? "rankings"
      : s.includes("MyMonthlyAttendance") ? "attendance"
      : s.includes("settings/TeamSettingsTab") ? "settings"
      : "unknown";
    const id = pick(name);
    const Stub = () => <div data-testid={`tab-content-${id}`} />;
    Stub.displayName = `DynamicStub(${id})`;
    return Stub;
  },
}));
vi.mock("@/components/team/MemberDetailModal", () => ({ default: () => null }));

import TeamDetailClient from "@/app/[locale]/(authenticated)/teams/[teamId]/_client/TeamDetailClient";
import { useTeamDetailStore } from "@/stores/form/teamDetailStore";

const TEAM_ID = "team-kingfisher";

const TEAM = {
  id: TEAM_ID,
  name: "QA カワセミ",
  description: "説明",
  invite_code: "QA-INVITE",
  team_memberships: [{ user_id: "me", role: "admin", status: "approved", is_active: true }],
} as unknown as Parameters<typeof TeamDetailClient>[0]["initialTeam"];

const MEMBERSHIP = { id: "mem-1", team_id: TEAM_ID, user_id: "me", role: "admin" } as never;

const renderClient = (tab?: string) => {
  nav.params = new URLSearchParams(tab ? `tab=${tab}` : "");
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <TeamDetailClient
        teamId={TEAM_ID}
        initialTeam={TEAM}
        initialMembership={MEMBERSHIP}
        initialTab={tab}
      />
    </NextIntlClientProvider>,
  );
};

describe("TeamDetailClient — タブ表示の永続性", () => {
  beforeEach(() => {
    // モジュールシングルトンなのでテスト間で必ず初期化する
    act(() => {
      useTeamDetailStore.getState().reset();
    });
  });

  it("[V-TD-01] ?tab=settings で開くと設定タブの本文が出る (前提)", async () => {
    renderClient("settings");
    expect(await screen.findByTestId("tab-content-settings")).toBeInTheDocument();
  });

  it("[V-TD-02] タブをクリックすると表示が切り替わる", async () => {
    renderClient();
    // 既定は出欠
    expect(await screen.findByTestId("tab-content-attendance")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: messages.teams.tabs.settings }),
    );

    expect(await screen.findByTestId("tab-content-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-content-attendance")).not.toBeInTheDocument();
  });

  // ===========================================================================
  // [V-TD-03] 外部 reset からの復帰
  //
  // AuthProvider.clearAllClientState() はコンポーネントをアンマウントせずに
  // ストアだけを初期化する。URL が `?tab=settings` を指している以上、
  // reset 後も設定タブへ戻るのが正しい (URL が唯一の真実)。
  // ===========================================================================
  it("[V-TD-03] 外部から reset() されても URL のタブが再適用される", async () => {
    renderClient("settings");
    expect(await screen.findByTestId("tab-content-settings")).toBeInTheDocument();

    // AuthProvider.clearAllClientState() 相当 (アンマウントは伴わない)
    await act(async () => {
      useTeamDetailStore.getState().reset();
    });

    await waitFor(() => {
      expect(screen.getByTestId("tab-content-settings")).toBeInTheDocument();
    });
    // 既定タブへ落ちたままになっていないこと
    expect(screen.queryByTestId("tab-content-attendance")).not.toBeInTheDocument();
  });
});
