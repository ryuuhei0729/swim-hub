"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import TeamViewHeader from "@/components/team/TeamViewHeader";
import { useTeamViewStore } from "@/stores/team/teamViewStore";
import { useTeamDetailStore } from "@/stores/form/teamDetailStore";
import { useTeamAdminStore } from "@/stores/form/teamAdminStore";
import { teamViewSearch } from "@/utils/teamView";
import type { TeamMembership, TeamWithMembers } from "@apps/shared/types";
import TeamDetailClient from "./TeamDetailClient";
import TeamAdminClient from "./TeamAdminClient";

interface TeamPageClientProps {
  teamId: string;
  initialTeam: TeamWithMembers | null;
  initialMembership: TeamMembership | null;
  initialTab?: string;
  /** URL の `?view=admin`。実際に管理者ビューにするかは role と AND を取って決める */
  initialAdminView: boolean;
}

/**
 * チーム画面 (/teams/[teamId])。利用者ビューと管理者ビュー (`?view=admin`) を1ページで持つ。
 *
 * ヘッダー (チーム名 = チーム切替・利用者/管理者スイッチ・招待コード) はここで1度だけ描画し、
 * スイッチではページ遷移せず、ヘッダーより下の本文
 * (利用者ビュー TeamDetailClient / 管理者ビュー TeamAdminClient) だけを入れ替える。
 * URL は history.replaceState で `?view=` `?tab=` を書き換えるだけにする
 * (router で遷移するとサーバーコンポーネントから作り直しになり、ヘッダーも読み込み直される)。
 *
 * 旧 URL /teams-admin/[teamId] はここへリダイレクトされる。
 */
export default function TeamPageClient({
  teamId,
  initialTeam,
  initialMembership,
  initialTab,
  initialAdminView,
}: TeamPageClientProps) {
  const t = useTranslations("teams");
  const isCurrentUserAdmin = initialMembership?.role === "admin";
  const [adminViewPref, setAdminViewPref] = useState(initialAdminView);
  // 表示の好みは権限ではない。管理者ビューは必ず実際の role と AND を取る
  const isAdminView = isCurrentUserAdmin && adminViewPref;
  // 切替後に開く本文へ渡すタブ (切替先にあるタブなら引き継ぐ)
  const [bodyInitialTab, setBodyInitialTab] = useState(initialTab);

  const memberTab = useTeamDetailStore((state) => state.activeTab);
  const adminTab = useTeamAdminStore((state) => state.activeTab);

  // どのビューで開いたかを記録する (サイドバーの「チーム」・チーム切替で次もこのビューで開く)。
  // 所属していないチームは記録しない
  const recordVisit = useTeamViewStore((state) => state.recordVisit);
  const isMember = initialMembership !== null;
  useEffect(() => {
    if (isMember) recordVisit(teamId, isAdminView);
  }, [teamId, isMember, isAdminView, recordVisit]);

  const handleToggleView = useCallback(() => {
    const nextAdminView = !isAdminView;
    const currentTab = isAdminView ? adminTab : memberTab;
    const search = teamViewSearch(nextAdminView, currentTab);
    const nextTab = new URLSearchParams(search).get("tab") ?? undefined;
    window.history.replaceState(null, "", `${window.location.pathname}${search}`);
    setBodyInitialTab(nextTab);
    setAdminViewPref(nextAdminView);
  }, [isAdminView, adminTab, memberTab]);

  if (!initialTeam) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t("detail.notFound.title")}</h1>
          <p className="text-gray-600">{t("detail.notFound.description")}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TeamViewHeader
        teamId={teamId}
        teamName={initialTeam.name}
        isCurrentUserAdmin={isCurrentUserAdmin}
        isAdminView={isAdminView}
        onToggleView={handleToggleView}
        inviteCode={initialTeam.invite_code}
      />

      {isAdminView ? (
        <TeamAdminClient
          teamId={teamId}
          initialTeam={initialTeam}
          initialMembership={initialMembership}
          initialTab={bodyInitialTab}
        />
      ) : (
        <TeamDetailClient
          teamId={teamId}
          initialTeam={initialTeam}
          initialMembership={initialMembership}
          initialTab={bodyInitialTab}
        />
      )}
    </div>
  );
}
