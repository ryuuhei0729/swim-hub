// =============================================================================
// 入力画面の目標バッジ用: 本人の目標タイム取得フック - Swim Hub共通パッケージ
// =============================================================================

"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { GoalAPI } from "../../api/goals";
import type { Goal } from "../../types/goals";
import { goalKeys } from "./goals";

// goalKeys.all 配下に置くので、目標の編集・削除での goalKeys.all の invalidate に追従する。
// goalKeys.list() / detail() は ["goals","list"|"detail",...] で、"targets" とは形状が衝突しない
export const goalTargetKeys = {
  all: [...goalKeys.all, "targets"] as const,
} as const;

export interface UseGoalTargetsQueryOptions {
  /** false の間はフェッチしない。既定は true */
  enabled?: boolean;
  /** テスト・DI 用。省略時は supabase から生成する */
  api?: GoalAPI;
}

/**
 * 本人の全目標 (全大会・全 status)。呼び出し側が `findGoalTargetTime` で
 * 大会・種目・status に絞る。retry は QueryClient の既定に委ねる
 * (クエリ個別に指定するとグローバル設定を丸ごと置き換えるため指定しない)。
 * 失敗しても入力は止めず、`data` が無いまま目標を出さないだけにすること。
 */
export function useGoalTargetsQuery(
  supabase: SupabaseClient,
  options: UseGoalTargetsQueryOptions = {},
) {
  const { enabled = true, api } = options;
  const goalApi = useMemo(() => api ?? new GoalAPI(supabase), [supabase, api]);

  return useQuery<Goal[]>({
    queryKey: goalTargetKeys.all,
    queryFn: async () => await goalApi.getGoals(),
    enabled,
    staleTime: 60 * 1000,
  });
}
