"use client";

import React, { useState, useMemo, useEffect } from "react";
import { UsersIcon, PlusIcon, UserPlusIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useTeamViewStore } from "@/stores/team/teamViewStore";
import { resolveTeamToOpen, shouldOpenAsAdmin, teamViewHref } from "@/utils/teamView";

const TeamCreateModal = dynamic(() => import("@/components/team/TeamCreateModal"));
const TeamJoinModal = dynamic(() => import("@/components/team/TeamJoinModal"));

/**
 * チームの入口 (/teams)。
 *
 * モバイルのチームタブと同じく一覧は挟まず、最後に開いたチームを最後に使ったビュー
 * (利用者 / 管理者) でそのまま開く。別のチームへはチーム画面のヘッダーのチーム名から移る。
 * 承認待ちのチームもそのまま開く (チーム画面で「承認待ち」の案内を出す。swimhub-tasks #101)。
 * 所属しているチームが1つも無いときだけ、ここで作成・参加の案内を出す。
 */
export default function TeamsClient() {
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const t = useTranslations("teams");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  // チーム一覧を取得（リアルタイム更新用）。サーバーが同じキー (teamKeys.list()) で
  // prefetch して HydrationBoundary で渡しているので、初回は取得を待たずに表示できる
  const { teams = [], isLoading: teamsLoading } = useTeamsQuery(supabase);

  // 所属しているチーム (承認待ちを含む) があれば、最後に開いたチームへ送る。
  // 最後に開いたチーム・ビューは localStorage にあるのでクライアントで決める
  const router = useRouter();
  const teamToOpen = useMemo(
    () => resolveTeamToOpen(teams, useTeamViewStore.getState().lastTeamId),
    [teams],
  );
  useEffect(() => {
    if (!teamToOpen) return;
    const prefs = useTeamViewStore.getState().byTeam[teamToOpen.team_id];
    router.replace(teamViewHref(teamToOpen.team_id, shouldOpenAsAdmin(teamToOpen, prefs)));
  }, [teamToOpen, router]);

  if (teamsLoading || teamToOpen) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* ヘッダー: タイトル + 常設の作成/参加ボタン */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">
              {t("page.title")}
            </h1>
            <p className="text-sm sm:text-base text-gray-600">{t("page.description")}</p>
          </div>
          <div className="flex flex-row gap-2 shrink-0">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center justify-center px-3 sm:px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <PlusIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
              {t("empty.createButton")}
            </button>
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="inline-flex items-center justify-center px-3 sm:px-4 py-2 border border-gray-300 text-xs sm:text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <UserPlusIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
              {t("empty.joinButton")}
            </button>
          </div>
        </div>
      </div>

      {/* 所属しているチームはチーム画面へ送るので、ここに来るのは所属なしのときだけ */}
      <div className="bg-white rounded-lg shadow p-6 sm:p-12 text-center">
        <UsersIcon className="mx-auto h-8 w-8 sm:h-12 sm:w-12 text-gray-400" />
        <h3 className="mt-3 sm:mt-4 text-sm sm:text-lg font-medium text-gray-900">
          {t("empty.title")}
        </h3>
        <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-500 mb-4 sm:mb-8">
          {t("empty.description")}
        </p>
        <div className="flex flex-row gap-2 sm:gap-4 justify-center">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center justify-center px-3 sm:px-6 py-2 sm:py-3 border border-transparent text-xs sm:text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          >
            <PlusIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
            {t("empty.createButton")}
          </button>
          <button
            onClick={() => setIsJoinModalOpen(true)}
            className="inline-flex items-center justify-center px-3 sm:px-6 py-2 sm:py-3 border border-gray-300 text-xs sm:text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          >
            <UserPlusIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
            {t("empty.joinButton")}
          </button>
        </div>
      </div>

      {/* チーム作成モーダル */}
      <TeamCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(teamId) => {
          // 作成したチームをそのまま開く
          queryClient.invalidateQueries({ queryKey: teamKeys.list() });
          router.push(teamViewHref(teamId, false));
        }}
      />

      {/* チーム参加モーダル */}
      <TeamJoinModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={(teamId) => {
          // 参加申請したチーム (承認待ち) をそのまま開く (mobile と同じ)
          queryClient.invalidateQueries({ queryKey: teamKeys.list() });
          setIsJoinModalOpen(false);
          router.push(teamViewHref(teamId, false));
        }}
      />
    </div>
  );
}
