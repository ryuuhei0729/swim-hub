"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowPathIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useRouter } from "@/i18n/navigation";
import TeamViewHeader from "@/components/team/TeamViewHeader";
import TeamSubScreenView from "@/components/team/TeamSubScreenView";
import {
  ADMIN_ONLY_TEAM_SUB_SCREENS,
  DEFAULT_TEAM_TAB,
  resolveTeamTabParam,
  type TeamSubScreen,
  type TeamTabType,
} from "@/components/team/teamTabDefs";
import { useTeamViewStore } from "@/stores/team/teamViewStore";
import { useTeamBadgeCounts } from "@/hooks/useTeamBadgeCounts";
import { TEAM_SCHEDULE_LINK_PARAMS, readTeamScheduleLink, teamViewSearch } from "@/utils/teamView";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import type { TeamMembership, TeamWithMembers } from "@apps/shared/types";
import TeamDetailClient from "./TeamDetailClient";

interface TeamPageClientProps {
  teamId: string;
  initialTeam: TeamWithMembers | null;
  /** 承認済み・在籍中のメンバーシップ (承認待ち・未所属なら null) */
  initialMembership: TeamMembership | null;
  /**
   * 自分の参加申請が承認待ちのとき、そのチーム名 (読めなければ null)。
   * 承認待ちでなければ undefined。
   */
  pendingTeamName?: string | null;
  initialTab?: string;
  /** URL の `?view=admin`。実際に管理者ビューにするかは role と AND を取って決める */
  initialAdminView: boolean;
}

/**
 * チーム画面 (/teams/[teamId])。利用者ビューと管理者ビュー (`?view=admin`) を1ページで持つ。
 *
 * ヘッダー (チーム名 = チーム切替・お知らせ・チーム設定・利用者/管理者スイッチ) はここで1度だけ描画し、
 * スイッチではページ遷移せず本文の表示だけを切り替える。タブ構成は両ビューで同じ
 * (メンバー / 予定 / 出欠 / その他。mobile の TeamDetailView と同じ。swimhub-tasks #100)。
 *
 * 開くタブの決め方: `?tab=` があればそれ (旧タブの ID は新しいタブへ読み替える)、
 * 無ければそのチームで最後に開いていたタブ (localStorage)、それも無ければメンバー。
 * `?tab=schedule&practice=<id>` / `&competition=<id>` なら、予定タブでその練習・大会の詳細も開く
 * (ダッシュボードの日付詳細の「チームの記録を見る」から)。開いたらそのクエリは URL から外す。
 *
 * お知らせ・チーム設定・ランキング・メンバーの目標・一括登録は、タブの上に重ねて開く
 * (mobile ではスタックに積む別画面)。
 *
 * 承認待ちのチームを開いたときは「承認待ち」の案内と再読み込みボタンだけを出す
 * (mobile と同じ。swimhub-tasks #101)。
 *
 * 旧 URL /teams-admin/[teamId] はここへリダイレクトされる。
 */
export default function TeamPageClient({
  teamId,
  initialTeam,
  initialMembership,
  pendingTeamName,
  initialTab,
  initialAdminView,
}: TeamPageClientProps) {
  const t = useTranslations("teams");
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const isPendingApproval = pendingTeamName !== undefined;
  const isCurrentUserAdmin = initialMembership?.role === "admin";
  const [adminViewPref, setAdminViewPref] = useState(initialAdminView);
  // 表示の好みは権限ではない。管理者ビューは必ず実際の role と AND を取る
  const isAdminView = isCurrentUserAdmin && adminViewPref;

  // ---------------------------------------------------------------- タブ
  const tabParam = searchParams.get("tab") || initialTab || null;
  const [initialResolved] = useState(() => resolveTeamTabParam(tabParam));
  const [activeTab, setActiveTab] = useState<TeamTabType>(
    initialResolved?.tab ?? DEFAULT_TEAM_TAB,
  );
  const [subScreen, setSubScreen] = useState<TeamSubScreen | null>(
    initialResolved?.subScreen ?? null,
  );
  // `?tab=` が無いときは、保存されたタブを読むまで本文を出さない
  // (既定タブを一瞬出してそのデータを取りに行かないため)
  const [isTabReady, setIsTabReady] = useState(initialResolved !== undefined);
  // 反映済みの `?tab=`。同じ値を再適用して、クリックで選んだタブを URL の値へ引き戻さないため
  const appliedTabParamRef = useRef(tabParam);

  // 保存されたタブは localStorage にあるので、ハイドレーション後に読む
  useEffect(() => {
    if (isTabReady) return;
    const storedTab = useTeamViewStore.getState().byTeam[teamId]?.tab;
    if (storedTab) setActiveTab(storedTab);
    setIsTabReady(true);
  }, [isTabReady, teamId]);

  // 同じページのまま `?tab=` だけが変わった (リンク・戻る) ときに反映する。
  // クエリが消えただけ (表示切替で URL を書き換えた等) ならタブはそのまま
  useEffect(() => {
    if (appliedTabParamRef.current === tabParam) return;
    appliedTabParamRef.current = tabParam;
    const resolved = resolveTeamTabParam(tabParam);
    if (!resolved) return;
    setActiveTab(resolved.tab);
    setSubScreen(resolved.subScreen ?? null);
    setIsTabReady(true);
  }, [tabParam]);

  // 開いているタブをチームごとに覚える (所属していないチームは覚えない)
  const storeTab = useTeamViewStore((state) => state.setTab);
  const isMember = initialMembership !== null;
  useEffect(() => {
    if (isTabReady && isMember) storeTab(teamId, activeTab);
  }, [isTabReady, isMember, storeTab, teamId, activeTab]);

  // 予定タブで詳細を開く練習・大会。予定タブを開いているときだけ渡す
  const scheduleLink = activeTab === "schedule" ? readTeamScheduleLink(searchParams) : null;
  const handleScheduleLinkHandled = useCallback(() => {
    // 再読み込み・タブの切り替えで同じ詳細をまた開かないよう、URL から外す (`?tab=` などは残す)
    const params = new URLSearchParams(window.location.search);
    for (const name of TEAM_SCHEDULE_LINK_PARAMS) params.delete(name);
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  const handleTabChange = useCallback((tab: TeamTabType) => {
    setActiveTab(tab);
    setSubScreen(null);
  }, []);

  // 管理者ビュー限定の画面 (目標・一括登録) は、利用者ビューに戻したら閉じる
  const visibleSubScreen =
    subScreen && (isAdminView || !ADMIN_ONLY_TEAM_SUB_SCREENS.includes(subScreen))
      ? subScreen
      : null;

  // ---------------------------------------------------------------- 訪問の記録
  // どのビューで開いたかを記録する (サイドバーの「チーム」・チーム切替で次もこのビューで開く)。
  // 所属していないチームは記録しない (承認待ちのチームは記録して、次もそこを開く)
  const recordVisit = useTeamViewStore((state) => state.recordVisit);
  useEffect(() => {
    if (isMember || isPendingApproval) recordVisit(teamId, isAdminView);
  }, [teamId, isMember, isPendingApproval, isAdminView, recordVisit]);

  const handleToggleView = useCallback(() => {
    const nextAdminView = !isAdminView;
    // タブは両ビューで同じなので、開いているタブのまま切り替える (URL にタブは載せない)
    window.history.replaceState(null, "", `${window.location.pathname}${teamViewSearch(nextAdminView)}`);
    setAdminViewPref(nextAdminView);
  }, [isAdminView]);

  // ---------------------------------------------------------------- 未対応件数のバッジ
  // サイドバーの「チーム」の合計の内訳。このチームの分はタブ (出欠・メンバー) に、
  // 他のチームの分はチーム名 (切替) の横と切替メニューの各チームに出す (mobile と同じ。swimhub-tasks #73)
  const { total: badgeTotal, byTeam: badgeByTeam, countOf } = useTeamBadgeCounts();
  const thisTeamCount = countOf(teamId);
  const otherTeamsBadgeCount = Math.max(
    0,
    badgeTotal - thisTeamCount.unanswered - thisTeamCount.pendingMembers,
  );
  const switcherBadgeCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(badgeByTeam).map(([id, c]) => [id, c.unanswered + c.pendingMembers]),
      ),
    [badgeByTeam],
  );

  // ---------------------------------------------------------------- 承認待ち
  const [isRefreshing, startRefresh] = useTransition();
  const handlePendingRetry = useCallback(() => {
    // 承認されていればサーバー側で通常の画面になる。チーム切替の一覧も取り直す
    void queryClient.invalidateQueries({ queryKey: teamKeys.list() });
    startRefresh(() => router.refresh());
  }, [queryClient, router]);

  if (isPendingApproval) {
    return (
      <div>
        <TeamViewHeader
          teamId={teamId}
          teamName={pendingTeamName || t("mobile.fallbackTeamName")}
          isCurrentUserAdmin={false}
          isAdminView={false}
          onToggleView={handleToggleView}
          badgeCounts={switcherBadgeCounts}
          otherTeamsBadgeCount={otherTeamsBadgeCount}
        />
        <div
          className="bg-white rounded-lg shadow px-6 py-12 flex flex-col items-center text-center"
          data-testid="team-pending-approval"
        >
          <ClockIcon className="h-12 w-12 text-amber-500" aria-hidden="true" />
          <h2 className="mt-4 mb-2 text-xl font-semibold text-amber-800">
            {t("mobile.statusPending")}
          </h2>
          <p className="mb-6 text-sm text-gray-500 whitespace-pre-line leading-relaxed">
            {t("mobile.pendingMessage")}
          </p>
          <button
            type="button"
            onClick={handlePendingRetry}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            data-testid="team-pending-retry"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {t("mobile.pendingRetry")}
          </button>
        </div>
      </div>
    );
  }

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
        onOpenAnnouncements={isMember ? () => setSubScreen("announcements") : undefined}
        onOpenSettings={isMember ? () => setSubScreen("settings") : undefined}
        badgeCounts={switcherBadgeCounts}
        otherTeamsBadgeCount={otherTeamsBadgeCount}
      />

      {visibleSubScreen ? (
        <TeamSubScreenView
          screen={visibleSubScreen}
          teamId={teamId}
          team={initialTeam}
          isAdminView={isAdminView}
          onBack={() => setSubScreen(null)}
        />
      ) : isTabReady ? (
        <TeamDetailClient
          teamId={teamId}
          initialMembership={initialMembership}
          isAdminView={isAdminView}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onOpenSubScreen={setSubScreen}
          attendanceBadgeCount={thisTeamCount.unanswered}
          pendingBadgeCount={thisTeamCount.pendingMembers}
          scheduleLink={scheduleLink}
          onScheduleLinkHandled={handleScheduleLinkHandled}
        />
      ) : null}
    </div>
  );
}
