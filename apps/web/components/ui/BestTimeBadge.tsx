"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts";
import { formatTimeBest } from "@/utils/formatters";

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
 * 記録が過去のベストタイムを更新した場合に表示される
 * showDiff=trueの場合、ベストでない時も差分を表示
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
  const { supabase } = useAuth();
  const [isBestTime, setIsBestTime] = useState<boolean | null>(null);
  const [bestTimeDiff, setBestTimeDiff] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkBestTime = async () => {
      // ガード条件: styleIdまたはrecordDateがfalsyな値（undefined, null, ''）の場合は早期リターン
      if (!styleId || !recordDate) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // その大会実施日より前の同じ条件（種目・プール種別・引き継ぎ有無）の記録を取得
        // 1. 大会記録（competition_idあり）: competitions.date で比較
        // 2. 一括登録（competition_id = null）: created_at で比較

        // 共通フィルタ条件
        const baseFilters = {
          user_id: user.id,
          style_id: styleId,
          is_relaying: isRelaying || false,
        };

        // 1. 大会記録から過去のベストを取得
        let competitionQuery = supabase
          .from("records")
          .select(
            `
            id,
            time,
            competition:competitions!inner(date)
          `,
          )
          .eq("user_id", baseFilters.user_id)
          .eq("style_id", baseFilters.style_id)
          .eq("is_relaying", baseFilters.is_relaying)
          .neq("id", recordId)
          .lt("competition.date", recordDate)
          .order("time", { ascending: true })
          .limit(1);

        if (poolType !== null && poolType !== undefined) {
          competitionQuery = competitionQuery.eq("pool_type", poolType);
        }

        // 2. 一括登録（competition_id = null）から過去のベストを取得
        let bulkQuery = supabase
          .from("records")
          .select(
            `
            id,
            time,
            created_at
          `,
          )
          .eq("user_id", baseFilters.user_id)
          .eq("style_id", baseFilters.style_id)
          .eq("is_relaying", baseFilters.is_relaying)
          .is("competition_id", null)
          .neq("id", recordId)
          .lt("created_at", recordDate)
          .order("time", { ascending: true })
          .limit(1);

        if (poolType !== null && poolType !== undefined) {
          bulkQuery = bulkQuery.eq("pool_type", poolType);
        }

        // 両方のクエリを並列実行
        const [competitionResult, bulkResult] = await Promise.all([competitionQuery, bulkQuery]);

        if (competitionResult.error) throw competitionResult.error;
        if (bulkResult.error) throw bulkResult.error;

        // 両方の結果から最速タイムを取得
        const competitionBest = competitionResult.data?.[0]?.time;
        const bulkBest = bulkResult.data?.[0]?.time;

        let previousBestTime: number | null = null;
        if (competitionBest !== undefined && bulkBest !== undefined) {
          previousBestTime = Math.min(competitionBest, bulkBest);
        } else if (competitionBest !== undefined) {
          previousBestTime = competitionBest;
        } else if (bulkBest !== undefined) {
          previousBestTime = bulkBest;
        }

        // 以前の記録がない、または現在のタイムが以前のベストより速い場合
        const isBest = previousBestTime === null || currentTime < previousBestTime;
        setIsBestTime(isBest);

        // ベストとの差分を計算（ベストでない場合のみ）
        if (!isBest && previousBestTime !== null) {
          setBestTimeDiff(currentTime - previousBestTime);
        } else {
          setBestTimeDiff(null);
        }
      } catch (err) {
        console.error("ベストタイムチェックエラー:", err);
        setIsBestTime(null);
      } finally {
        setLoading(false);
      }
    };

    checkBestTime();
  }, [recordId, styleId, currentTime, recordDate, poolType, isRelaying, supabase]);

  if (loading || isBestTime === null) {
    return null;
  }

  // ベストタイムの場合
  if (isBestTime) {
    return (
      <span className="inline-flex items-center px-1 py-0.5 bg-yellow-100 border border-yellow-400 rounded text-[9px] sm:text-xs font-bold text-yellow-800 whitespace-nowrap">
        🏆 Best Time!!
      </span>
    );
  }

  // ベストでない場合、差分を表示（showDiff=trueの場合のみ）
  if (showDiff && bestTimeDiff !== null && bestTimeDiff > 0) {
    return (
      <span className="inline-flex items-center text-[9px] sm:text-xs text-gray-500 whitespace-nowrap">
        (Best+{formatTimeBest(bestTimeDiff)})
      </span>
    );
  }

  return null;
}
