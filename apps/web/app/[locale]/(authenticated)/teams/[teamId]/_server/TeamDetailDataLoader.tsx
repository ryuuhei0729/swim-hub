// =============================================================================
// チーム詳細データローダー
// =============================================================================

import React from "react";
import { createAuthenticatedServerClient, getServerUser } from "@/lib/supabase-server-auth";
import { TeamCoreAPI } from "@apps/shared/api/teams/core";
import TeamPageClient from "../_client/TeamPageClient";
import type { TeamMembership, TeamWithMembers } from "@apps/shared/types";

interface TeamDetailDataLoaderProps {
  teamId: string;
  initialTab?: string;
  initialAdminView: boolean;
}

type ServerSupabase = Awaited<ReturnType<typeof createAuthenticatedServerClient>>;

interface TeamPageData {
  team: TeamWithMembers | null;
  /** 承認済み・在籍中のメンバーシップ (それ以外は null) */
  membership: TeamMembership | null;
  /** 承認待ちならチーム名 (読めなければ null)。承認待ちでなければ undefined */
  pendingTeamName?: string | null;
}

/**
 * 自分のメンバーシップを先に確認し、承認済みならチーム情報を、承認待ちなら
 * 「承認待ち」画面に出すチーム名だけを取得する。
 *
 * 承認待ちのチームも開けるようにしている (mobile と同じ。swimhub-tasks #101)。
 * 承認待ちでは getTeam() が PENDING_APPROVAL を投げる (requireTeamMembership) ので、その結果は使わない。
 * チーム名は getMyTeams() と同じく自分のメンバーシップ経由で読む。
 */
async function getTeamData(
  supabase: ServerSupabase,
  teamId: string,
  userId: string,
): Promise<TeamPageData> {
  const coreAPI = new TeamCoreAPI(supabase);

  try {
    // チーム情報と自分のメンバーシップを並列で取得する (パフォーマンス最適化)。
    // getTeam() は承認待ち・未所属だと例外になるので、ここでは握りつぶして後で判定する
    let teamError: unknown = null;
    const [team, membershipResult] = await Promise.all([
      coreAPI.getTeam(teamId).catch((error: unknown) => {
        teamError = error;
        return null;
      }),
      supabase
        .from("team_memberships")
        .select("*, teams:teams(name)")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .in("status", ["approved", "pending"]),
    ]);
    const { data: ownMemberships, error: membershipError } = membershipResult;
    if (membershipError) throw membershipError;

    const rows = (ownMemberships ?? []) as (TeamMembership & {
      teams?: { name: string | null } | null;
    })[];
    const approved = rows.find((row) => row.status === "approved" && row.is_active === true);

    if (!approved) {
      const pending = rows.find((row) => row.status === "pending");
      if (pending) {
        return { team: null, membership: null, pendingTeamName: pending.teams?.name ?? null };
      }
      return { team: null, membership: null };
    }

    if (!team) throw teamError;
    const { teams: _teams, ...membership } = approved;
    return { team, membership: membership as TeamMembership };
  } catch (error) {
    console.error("チーム情報の取得に失敗:", error);
    return { team: null, membership: null };
  }
}

/**
 * チームページのデータを取得する Server Component
 */
export default async function TeamDetailDataLoader({
  teamId,
  initialTab,
  initialAdminView,
}: TeamDetailDataLoaderProps) {
  // 認証情報とSupabaseクライアントを取得
  const [user, supabase] = await Promise.all([getServerUser(), createAuthenticatedServerClient()]);

  if (!user) {
    return (
      <TeamPageClient
        key={teamId}
        teamId={teamId}
        initialTeam={null}
        initialMembership={null}
        initialTab={initialTab}
        initialAdminView={false}
      />
    );
  }

  const teamDataResult = await getTeamData(supabase, teamId, user.id);

  // key: 別のチームへ移ったらタブ・重ねた画面などの状態を持ち越さないよう作り直す
  return (
    <TeamPageClient
      key={teamId}
      teamId={teamId}
      initialTeam={teamDataResult.team}
      initialMembership={teamDataResult.membership}
      pendingTeamName={teamDataResult.pendingTeamName}
      initialTab={initialTab}
      initialAdminView={initialAdminView}
    />
  );
}
