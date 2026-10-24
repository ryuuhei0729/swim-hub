// =============================================================================
// 目標管理React Queryフック - Swim Hub共通パッケージ
// =============================================================================

"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { GoalAPI } from "../../api/goals";
import type { Goal, GoalWithMilestones, Style } from "../../types";

// クエリキー定義
export const goalKeys = {
  all: ["goals"] as const,
  lists: () => [...goalKeys.all, "list"] as const,
  list: (filters?: { status?: string }) => [...goalKeys.lists(), filters] as const,
  detail: (id: string) => [...goalKeys.all, "detail", id] as const,
  currentBestTime: (id: string) => [...goalKeys.all, "currentBestTime", id] as const,
} as const;

type GoalWithDetails = Goal & {
  /** end_date は複数日開催の終了日 (単日開催は null) */
  competition: { title: string | null; date: string; end_date: string | null } | null;
  style?: { name_jp: string };
};

type GoalsQueryData = {
  goals: Goal[];
  competitions: { id: string; title: string | null; date: string; end_date?: string | null }[];
};

/**
 * 目標一覧取得クエリ（competition/style情報付き）
 */
export function useGoalsQuery(
  supabase: SupabaseClient,
  options: {
    styles?: Style[];
    initialData?: GoalsQueryData;
  } = {},
): UseQueryResult<GoalWithDetails[], Error> & {
  invalidate: () => Promise<void>;
} {
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  const queryClient = useQueryClient();

  const query = useQuery<GoalsQueryData, Error, GoalWithDetails[]>({
    queryKey: goalKeys.list(),
    queryFn: async () => {
      // getSelectableCompetitions() は個人大会 + 所属チームの大会 (RLS 経由で
      // 見えるもの) を返す。RecordAPI.getCompetitions() (個人大会限定) だと
      // チーム大会を対象にした目標のタイトルが解決できず「大会情報なし」に
      // 誤って落ちるため、こちらを使う。
      const [goals, competitions] = await Promise.all([
        goalAPI.getGoals(),
        goalAPI.getSelectableCompetitions(),
      ]);

      return { goals, competitions };
    },
    select: (data) =>
      data.goals.map((goal) => {
        const competition = data.competitions.find((c) => c.id === goal.competition_id);
        const style = options.styles?.find((s) => s.id === goal.style_id);
        return {
          ...goal,
          competition: competition
            ? { title: competition.title, date: competition.date, end_date: competition.end_date ?? null }
            : null,
          style: style ? { name_jp: style.name_jp } : undefined,
        };
      }),
    initialData: options.initialData,
    initialDataUpdatedAt: options.initialData ? Date.now() : undefined,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: goalKeys.all });
  };

  return { ...query, invalidate };
}

/**
 * 目標の「現在のベスト」取得クエリ (GoalAPI.getGoalCurrentBestTime)。
 * 一覧カードと詳細で同じキーを共有し、goalKeys.all の invalidate で取り直される。
 */
export function useGoalCurrentBestTimeQuery(
  supabase: SupabaseClient,
  goalId: string,
): UseQueryResult<number | null, Error> {
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);

  return useQuery<number | null, Error>({
    queryKey: goalKeys.currentBestTime(goalId),
    queryFn: () => goalAPI.getGoalCurrentBestTime(goalId),
    // 記録の登録・編集・削除 (大会記録画面・ダッシュボード等) は goalKeys を invalidate しないため、
    // 画面を開くたびに取り直す (キャッシュは取り直すまでの表示に使う)
    staleTime: 0,
  });
}

/**
 * 目標詳細取得クエリ（マイルストーン含む）
 */
export function useGoalDetailQuery(
  supabase: SupabaseClient,
  goalId: string | null,
): UseQueryResult<GoalWithMilestones | null, Error> & {
  invalidate: () => Promise<void>;
} {
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  const queryClient = useQueryClient();

  const query = useQuery<GoalWithMilestones | null, Error>({
    queryKey: goalKeys.detail(goalId || ""),
    queryFn: () => goalAPI.getGoalWithMilestones(goalId!),
    enabled: !!goalId,
    staleTime: 2 * 60 * 1000,
  });

  const invalidate = async () => {
    if (goalId) {
      await queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) });
    }
  };

  return { ...query, invalidate };
}
