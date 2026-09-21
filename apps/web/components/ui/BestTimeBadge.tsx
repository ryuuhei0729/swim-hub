"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { useListBestCandidatesQuery } from "@apps/shared/hooks/queries/records";
import { computeListPreviousBest, getBestBadgeState } from "@apps/shared/utils/bestTimeBadge";

interface BestTimeBadgeProps {
  recordId: string;
  styleId?: number;
  currentTime: number;
  recordDate?: string | null;
  poolType?: number | null;
  isRelaying?: boolean;
  /**
   * 判定対象のユーザー id。未指定時はログインユーザー (`user?.id`) にフォールバックする
   * (後方互換)。チーム記録一覧のようにログインユーザー以外の記録を判定する画面は
   * 明示的に渡すこと (根拠は Success Criteria「他メンバーの記録でも、その人の userId
   * で判定される」)。
   */
  userId?: string;
  /**
   * true の場合、フォントサイズ/パディングを一段小さくして表示する
   * (`transform: scale()` は使わない。チーム大会記録一覧のような密なリスト行向け)。
   * mobile `components/records/BestTimeBadge.tsx` の同名 prop とパリティを揃える。
   * 未指定時は既存の見た目のまま (後方互換)。
   */
  compact?: boolean;
}

/**
 * 自己ベストバッジ（一覧表示用・3状態常時表示）。
 * mobile components/records/BestTimeBadge.tsx と同一のトーン。
 *
 * 候補は (userId, styleId, isRelaying, poolType) グループ単位の共有キャッシュクエリ
 * (useListBestCandidatesQuery) で一括取得し、日付フィルタ・自己除外は
 * computeListPreviousBest がメモリ上で行う（行ごとの getUser() + 2クエリを廃止）。
 *
 * - 初記録: 「初」(amber)
 * - 自己ベスト更新 (±0含む): 差分ラベル (amber)
 * - ベストより遅い: 差分ラベル (red)
 * - 判定不能・ロード中・未認証・エラー: 非表示
 */
export default function BestTimeBadge({
  recordId,
  styleId,
  currentTime,
  recordDate,
  poolType,
  isRelaying,
  userId: userIdProp,
  compact,
}: BestTimeBadgeProps) {
  const { supabase, user } = useAuth();
  const t = useTranslations("common");
  const userId = userIdProp ?? user?.id;
  const sizeClasses = compact ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-xs";

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

  const badgeState = useMemo(() => {
    if (!userId || !styleId || !recordDate || !candidates) return { kind: "none" as const };
    const previousBest = computeListPreviousBest(candidates, recordId, recordDate);
    return getBestBadgeState(currentTime, previousBest, previousBest === null);
  }, [userId, styleId, recordDate, candidates, recordId, currentTime]);

  if (badgeState.kind === "none") {
    return null;
  }

  if (badgeState.kind === "first") {
    return (
      <span
        className={`inline-flex items-center rounded font-medium bg-amber-50 text-amber-600 whitespace-nowrap ${sizeClasses}`}
      >
        {t("bestBadge.first")}
      </span>
    );
  }

  const isBest = badgeState.kind === "best";
  return (
    <span
      className={`inline-flex items-center rounded font-medium whitespace-nowrap ${sizeClasses} ${
        isBest ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
      }`}
    >
      {badgeState.label}
    </span>
  );
}
