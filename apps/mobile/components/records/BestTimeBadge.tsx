import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAuth } from "@/contexts/AuthProvider";
import { formatTimeBest } from "@/utils/formatters";
import type { BestTime } from "@apps/shared/types/ui";

/**
 * YYYY-MM-DD 形式の日付を bulkQuery の created_at 比較用に正規化する。
 * YYYY-MM-DD (10文字) は当日 00:00:00.000Z に拡張し、当日以前のみ対象とする。
 * ISO タイムスタンプの場合はそのまま返す。
 */
function normalizeRecordDateForBulkComparison(recordDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    return `${recordDate}T00:00:00.000Z`;
  }
  return recordDate;
}

interface BestTimeBadgeProps {
  recordId: string;
  styleId?: number;
  currentTime: number;
  recordDate?: string | null;
  poolType?: number | null;
  isRelaying?: boolean;
  showDiff?: boolean;
  precomputedBestTimes?: BestTime[];
}

/**
 * ベストタイム更新チェックバッジ
 * 記録が過去のベストタイムを更新した場合に表示される
 * showDiff=true の場合、ベストでない時も差分を表示
 */
const BestTimeBadge: React.FC<BestTimeBadgeProps> = ({
  recordId,
  styleId,
  currentTime,
  recordDate,
  poolType,
  isRelaying,
  showDiff = false,
  precomputedBestTimes,
}) => {
  const { supabase } = useAuth();
  const [isBestTime, setIsBestTime] = useState<boolean | null>(null);
  const [bestTimeDiff, setBestTimeDiff] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // precomputedBestTimes が渡された場合: 同期的に判定（Supabase クエリ不要）
    if (precomputedBestTimes !== undefined) {
      if (styleId === undefined || styleId === null) {
        setIsBestTime(null);
        setLoading(false);
        return;
      }
      const match = precomputedBestTimes.find(
        (bt) => bt.style_id === styleId && bt.pool_type === (poolType ?? 0),
      );

      let relevantBestTime: number | undefined;
      if (match) {
        if (isRelaying ?? false) {
          // リレー記録の表示: 主エントリの relayingTime.time を優先、フォールバックエントリなら time を使う
          relevantBestTime = match.is_relaying ? match.time : match.relayingTime?.time;
        } else {
          // 非リレー記録の表示: 主エントリの time のみ（フォールバックエントリは非リレー記録がないことを意味するので無視）
          relevantBestTime = match.is_relaying ? undefined : match.time;
        }
      }

      const isBest = relevantBestTime === undefined || currentTime < relevantBestTime;
      setIsBestTime(isBest);
      if (!isBest && relevantBestTime !== undefined) {
        setBestTimeDiff(currentTime - relevantBestTime);
      } else {
        setBestTimeDiff(null);
      }
      setLoading(false);
      return;
    }

    let cancelled = false;

    const checkBestTime = async () => {
      if (!styleId || !recordDate) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        if (!cancelled) setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }

        // 1. 大会記録（competition_id あり）: competitions.date で比較
        let competitionQuery = supabase
          .from("records")
          .select(
            `
            id,
            time,
            competition:competitions!inner(date)
          `,
          )
          .eq("user_id", user.id)
          .eq("style_id", styleId)
          .eq("is_relaying", isRelaying ?? false)
          .neq("id", recordId)
          .lt("competition.date", recordDate)
          .order("time", { ascending: true })
          .limit(1);

        if (poolType !== null && poolType !== undefined) {
          competitionQuery = competitionQuery.eq("pool_type", poolType);
        }

        // recordDate を正規化: YYYY-MM-DD → YYYY-MM-DDT00:00:00.000Z
        // 当日の一括登録記録が除外されないよう created_at との型混用を解消する
        const normalizedRecordDate = normalizeRecordDateForBulkComparison(recordDate);
        let bulkQuery = supabase
          .from("records")
          .select(
            `
            id,
            time,
            created_at
          `,
          )
          .eq("user_id", user.id)
          .eq("style_id", styleId)
          .eq("is_relaying", isRelaying ?? false)
          .is("competition_id", null)
          .neq("id", recordId)
          .lt("created_at", normalizedRecordDate)
          .order("time", { ascending: true })
          .limit(1);

        if (poolType !== null && poolType !== undefined) {
          bulkQuery = bulkQuery.eq("pool_type", poolType);
        }

        const [competitionResult, bulkResult] = await Promise.all([competitionQuery, bulkQuery]);

        if (competitionResult.error) throw competitionResult.error;
        if (bulkResult.error) throw bulkResult.error;

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

        const isBest = previousBestTime === null || currentTime < previousBestTime;
        if (!cancelled) setIsBestTime(isBest);

        if (!isBest && previousBestTime !== null) {
          if (!cancelled) setBestTimeDiff(currentTime - previousBestTime);
        } else {
          if (!cancelled) setBestTimeDiff(null);
        }
      } catch (err) {
        console.error("ベストタイムチェックエラー:", err);
        if (!cancelled) setIsBestTime(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkBestTime();
    return () => {
      cancelled = true;
    };
  }, [recordId, styleId, currentTime, recordDate, poolType, isRelaying, supabase, precomputedBestTimes]);

  if (loading || isBestTime === null) {
    return null;
  }

  if (isBestTime) {
    return (
      <View
        style={styles.badge}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel="自己ベスト更新"
      >
        <Text style={styles.badgeText}>🏆 Best Time!!</Text>
      </View>
    );
  }

  if (showDiff && bestTimeDiff !== null && bestTimeDiff > 0) {
    return (
      <Text
        style={styles.diffText}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel={`ベストタイムより +${formatTimeBest(bestTimeDiff)} 遅い`}
      >
        {`Best +${formatTimeBest(bestTimeDiff)}`}
      </Text>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#FACC15",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#854D0E",
  },
  diffText: {
    fontSize: 11,
    color: "#6B7280",
  },
});

export default BestTimeBadge;
