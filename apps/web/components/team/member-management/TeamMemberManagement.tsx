"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { pickBestTime } from "../shared/hooks/useMemberBestTimes";
import {
  useApprovedTeamMembersQuery,
  useTeamMemberBestTimesQuery,
} from "@/hooks/queries/teamMemberQueries";
import { invalidateTeamMemberQueries } from "@/hooks/queries/teamDetailKeys";
import {
  usePendingMembers,
  useMembershipActions,
  useMemberSort,
  useMemberGroupSort,
} from "./hooks";
import {
  PendingMembersSection,
  MemberStatsHeader,
  MembersTimeTable,
  MemberGroupSorter,
} from "./components";
import type { TeamMember } from "./hooks/useMembers";

// 取得前に毎回新しい配列を作ってソート・ベストタイム取得を無駄に走らせないための空配列
const EMPTY_MEMBERS: TeamMember[] = [];

export interface TeamMemberManagementProps {
  teamId: string;
  currentUserId: string;
  isCurrentUserAdmin: boolean;
  onMembershipChange?: () => void;
  onMemberClick: (member: TeamMember) => void;
  /**
   * メンバー詳細モーダル (このコンポーネントの外、ページ側で開く) での権限・泳者区分の
   * 変更をこの一覧にも反映するためのトリガー。値が変わるたびに一覧を
   * バックグラウンドで再取得する (silent: ローディングスケルトンは出さない)。
   * 初期値の `undefined` では再取得しない (マウント時の二重取得を避ける)。
   */
  membersRefreshSignal?: number;
}

/**
 * チームメンバー管理コンポーネント
 *
 * メンバー一覧、ベストタイム表示、承認待ちメンバーの管理を行う
 * リファクタリング済み: カスタムフックとサブコンポーネントに分離
 */
export default function TeamMemberManagement({
  teamId,
  currentUserId,
  isCurrentUserAdmin,
  onMembershipChange,
  onMemberClick,
  membersRefreshSignal,
}: TeamMemberManagementProps) {
  const { supabase } = useAuth();
  const t = useTranslations("teams");

  const queryClient = useQueryClient();

  // メンバーデータ (タブを開くたびに再取得するが、再取得中は前回の一覧を表示する)
  const membersQuery = useApprovedTeamMembersQuery(supabase, teamId);
  const members = membersQuery.data ?? EMPTY_MEMBERS;
  // スケルトン / エラーは表示できる一覧が無いときだけ出す
  const loading = membersQuery.isPending;
  const error = membersQuery.isError && !membersQuery.data ? t("membersHook.loadError") : null;
  const membersFetchError = membersQuery.error;
  useEffect(() => {
    if (membersFetchError) console.error("メンバー情報の取得に失敗:", membersFetchError);
  }, [membersFetchError]);
  const { refetch: refetchMembers } = membersQuery;

  // 承認待ちメンバー管理
  const { pendingMembers, loading: loadingPending } = usePendingMembers(teamId, isCurrentUserAdmin, supabase);

  // 承認/却下アクション
  const { handleApprove, handleReject } = useMembershipActions(teamId, onMembershipChange);

  // グループ別表示
  // グループ内は年齢の降順 (同じ年齢は名前順、生年月日未設定は最後に名前順)。並び順の説明は出さない
  const { categories, activeCategory, toggleCategory, groupMembers, getCategoryLabel } = useMemberGroupSort(
    teamId,
    supabase,
    true,
    { sortWithinGroupsByAge: true },
  );

  // ベストタイム管理 (メンバー一覧が取れてから取得。重いので teamKeys の外のキー)
  const bestTimesQuery = useTeamMemberBestTimesQuery(supabase, teamId, members);
  const memberBestTimes = bestTimesQuery.data;
  // 前回の表があれば再取得中も表示し続ける
  const loadingBestTimes = members.length > 0 && !memberBestTimes && bestTimesQuery.isFetching;
  const bestTimesFetchError = bestTimesQuery.error;
  useEffect(() => {
    if (bestTimesFetchError) console.error("ベストタイム取得エラー:", bestTimesFetchError);
  }, [bestTimesFetchError]);
  const getBestTimeBase = useCallback(
    (memberId: string, style: string, distance: number, includeRelaying: boolean) =>
      pickBestTime(memberBestTimes?.[memberId] ?? [], style, distance, includeRelaying),
    [memberBestTimes],
  );

  // UI状態
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false);

  // ソート機能
  const getBestTimeForMemberWithRelaying = useCallback(
    (memberId: string, style: string, distance: number) => {
      return getBestTimeBase(memberId, style, distance, includeRelaying);
    },
    [getBestTimeBase, includeRelaying],
  );

  const { sortStyle, sortDistance, sortOrder, sortedMembers, groupHeaders, handleSort } =
    useMemberSort(members, getBestTimeForMemberWithRelaying, groupMembers);

  // 承認待ちはマウント時に useQuery が取得する (管理者のときだけ)

  // メンバー詳細モーダル (ページ側) での変更をバックグラウンドで反映する。
  // undefined のままなら (シグナルが一度も来ていない) 何もしない。
  // 再取得中も一覧はそのまま表示される (以前の silent 再取得と同じ見え方)
  useEffect(() => {
    if (membersRefreshSignal === undefined) return;
    void refetchMembers();
  }, [membersRefreshSignal, refetchMembers]);

  // 承認処理（再読み込み含む）
  const handleApproveWithRefresh = useCallback(
    async (membershipId: string) => {
      const success = await handleApprove(membershipId);
      if (success) {
        // メンバー一覧・承認待ち・グループ人数をまとめて最新化する
        await invalidateTeamMemberQueries(queryClient, teamId);
      }
      return success;
    },
    [handleApprove, queryClient, teamId],
  );

  // 却下処理（再読み込み含む）
  const handleRejectWithRefresh = useCallback(
    async (membershipId: string) => {
      const success = await handleReject(membershipId);
      if (success) {
        await invalidateTeamMemberQueries(queryClient, teamId);
      }
      return success;
    },
    [handleReject, queryClient, teamId],
  );

  // ローディング表示
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg"
              >
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6" data-testid="team-member-management">
      {/* ヘッダー：統計とリレートグル */}
      <MemberStatsHeader
        totalMembers={members.length}
        includeRelaying={includeRelaying}
        onToggleRelaying={setIncludeRelaying}
      />

      {/*
        グループ別表示。MemberGroupSorter は categories.length === 0 のとき null を
        返すので、この行は空になりうる。余白だけが残らないよう categories が
        空のときは行自体を描画しない。
        (「WAポイントで比較」はランキングタブの WaPointsCompareLauncher へ移設した)
      */}
      {categories.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <MemberGroupSorter
            categories={categories}
            activeCategory={activeCategory}
            onToggle={toggleCategory}
            getCategoryLabel={getCategoryLabel}
          />
        </div>
      )}

      {/* 承認待ちセクション（管理者のみ） */}
      {isCurrentUserAdmin && (
        <PendingMembersSection
          pendingMembers={pendingMembers}
          isLoading={loadingPending}
          onApprove={handleApproveWithRefresh}
          onReject={handleRejectWithRefresh}
        />
      )}

      {/* エラー表示 */}
      {error && (
        <div className="mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{t("error.title")}</h3>
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ベストタイム表 */}
      <MembersTimeTable
        members={sortedMembers}
        currentUserId={currentUserId}
        includeRelaying={includeRelaying}
        sortStyle={sortStyle}
        sortDistance={sortDistance}
        sortOrder={sortOrder}
        isLoading={loadingBestTimes}
        groupHeaders={groupHeaders}
        onSort={handleSort}
        onMemberClick={onMemberClick}
        getBestTimeForMember={getBestTimeForMemberWithRelaying}
      />
    </div>
  );
}
