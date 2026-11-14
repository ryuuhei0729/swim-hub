"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { useTeamViewStore } from "@/stores/teamViewStore";

/**
 * チーム 1 つ分の詳細 (チーム情報・メンバー・お知らせ) と、管理者ビューの実効値を返す。
 *
 * チームタブ本体 (TeamDetailView) と、そこから開く別画面 (チーム設定・お知らせ・
 * ランキング・メンバーの目標) で同じ判定を使うためにまとめている。
 * 取得は react-query のキャッシュを共有するので、別画面を開いても取り直しは起きない。
 *
 * ⚠️ 管理者専用の要素を出すかどうかは必ず `effectiveIsAdminView` で判定すること。
 * ストアの adminView は「表示の好み」で権限ではない (teamViewStore の docstring 参照)。
 */
export function useTeamAdminView(teamId: string) {
  const { supabase, user } = useAuth();
  const isAdminViewPreferred = useTeamViewStore((state) => state.byTeam[teamId]?.adminView === true);

  const query = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false, // モバイルでは一旦無効化
  });
  const { members } = query;

  const isCurrentUserAdmin = useMemo(() => {
    if (!user || !members) return false;
    return members.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, members]);

  return {
    ...query,
    isCurrentUserAdmin,
    effectiveIsAdminView: isCurrentUserAdmin && isAdminViewPreferred,
  };
}
