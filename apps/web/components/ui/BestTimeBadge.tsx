"use client";

import { useEffect, useMemo } from "react";
import { useAuth } from "@/contexts";
import { formatTimeBest } from "@/utils/formatters";
import { useListBestCandidatesQuery } from "@apps/shared/hooks/queries/records";
import { computeListPreviousBest } from "@apps/shared/utils/bestTimeBadge";

interface BestTimeBadgeProps {
  recordId: string;
  styleId?: number;
  currentTime: number;
  recordDate?: string | null;
  poolType?: number | null;
  isRelaying?: boolean;
  showDiff?: boolean; // ベストとの差分を表示するか
}

/**
 * ベストタイム更新チェックバッジ
 * 記録が過去のベストタイム（recordDate 時点）を更新した場合に表示される
 * showDiff=trueの場合、ベストでない時も差分を表示
 *
 * 候補は (userId, styleId, isRelaying, poolType) グループ単位の共有キャッシュクエリ
 * (useListBestCandidatesQuery) で一括取得し、日付フィルタ・自己除外は
 * computeListPreviousBest がメモリ上で行う（行ごとの getUser() + 2クエリを廃止）。
 */
export default function BestTimeBadge({
  recordId,
  styleId,
  currentTime,
  recordDate,
  poolType,
  isRelaying,
  showDiff = false,
}: BestTimeBadgeProps) {
  const { supabase, user } = useAuth();
  const userId = user?.id;

  // ガード条件: 未認証、または styleId / recordDate が falsy な場合はフェッチせず非表示
  const canJudge = !!userId && !!styleId && !!recordDate;
  const { data: candidates, error } = useListBestCandidatesQuery(supabase, {
    userId,
    styleId,
    isRelaying: isRelaying ?? false,
    poolType,
    enabled: canJudge,
  });

  useEffect(() => {
    if (error) {
      console.error("ベストタイムチェックエラー:", error);
    }
  }, [error]);

  // 「その記録の記録日時点で自己ベストだったか」と差分。判定完了までは null（非表示）
  const judgement = useMemo(() => {
    if (!userId || !styleId || !recordDate || !candidates) return null;
    const previousBest = computeListPreviousBest(candidates, recordId, recordDate);
    // 以前の記録がない、または現在のタイムが以前のベストより速い場合はベスト
    const isBest = previousBest === null || currentTime < previousBest;
    return {
      isBest,
      diff: !isBest && previousBest !== null ? currentTime - previousBest : null,
    };
  }, [userId, styleId, recordDate, candidates, recordId, currentTime]);

  // ロード中・判定不能・エラーは非表示
  if (judgement === null) {
    return null;
  }

  // ベストタイムの場合
  if (judgement.isBest) {
    return (
      <span className="inline-flex items-center px-1 py-0.5 bg-yellow-100 border border-yellow-400 rounded text-[9px] sm:text-xs font-bold text-yellow-800 whitespace-nowrap">
        🏆 Best Time!!
      </span>
    );
  }

  // ベストでない場合、差分を表示（showDiff=trueの場合のみ）
  if (showDiff && judgement.diff !== null && judgement.diff > 0) {
    return (
      <span className="inline-flex items-center text-[9px] sm:text-xs text-gray-500 whitespace-nowrap">
        (Best+{formatTimeBest(judgement.diff)})
      </span>
    );
  }

  return null;
}
