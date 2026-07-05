import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { RecordAPI } from "@apps/shared/api/records";
import { formatTimeBest } from "@/utils/formatters";
import type { BestTime } from "@apps/shared/types/ui";

/** 自己ベストと同記録とみなす許容誤差（秒）＝web share/utils.ts BEST_EPSILON と同値 */
const BEST_EPSILON = 0.005;

/** 自己ベストバッジ状態（web ShareBadgeState と同一の3状態+非表示） */
type BadgeState =
  | { kind: "first" }
  | { kind: "best"; label: string }
  | { kind: "slower"; label: string }
  | { kind: "none" };

/** 自己ベストとの差分を符号付きでフォーマット（改善=マイナス, 同記録=±0, 悪化=プラス） */
function formatBestDelta(time: number, previousBest: number): string {
  const delta = time - previousBest;
  if (Math.abs(delta) < BEST_EPSILON) return `±${formatTimeBest(0)}`;
  const sign = delta < 0 ? "-" : "+";
  return `${sign}${formatTimeBest(Math.abs(delta))}`;
}

/**
 * 自己ベストバッジの状態を判定する純粋関数。
 * web apps/web/components/share/utils.ts getShareBadgeState のポート。
 * - isFirstRecord=true → 初記録（「初」バッジ, amber）
 * - previousBest が不明 (null/undefined) → 非表示（判定不能時の誤表示防止）
 * - time <= previousBest(+誤差) → ベスト更新（±0含む, blue）
 * - それ以外 → ベストより遅い（red）
 */
export function getBadgeState(
  time: number,
  previousBest: number | null | undefined,
  isFirstRecord?: boolean,
): BadgeState {
  if (isFirstRecord) return { kind: "first" };
  if (previousBest == null) return { kind: "none" };
  const label = formatBestDelta(time, previousBest);
  return time - previousBest <= BEST_EPSILON
    ? { kind: "best", label }
    : { kind: "slower", label };
}

interface BestTimeBadgeProps {
  recordId: string;
  styleId?: number;
  currentTime: number;
  recordDate?: string | null;
  poolType?: number | null;
  isRelaying?: boolean;
  /** @deprecated 3状態モデルでは差分を常に表示するため未使用（後方互換のために残置） */
  showDiff?: boolean;
  precomputedBestTimes?: BestTime[];
}

/**
 * 自己ベスト3状態バッジ（web RecordBestBadge / BestBadge のポート）。
 * - 初記録: 「初」(amber)
 * - 自己ベスト更新 (±0含む): 「自己ベスト」+ 差分 (blue)
 * - ベストより遅い: 「自己ベスト」+ 差分 (red)
 * - 判定不能 (styleId なし / time 0 / エラー): 非表示
 *
 * precomputedBestTimes が渡された場合（一覧の N+1 回避）は同期判定を行う。
 * この場合、対象記録自身が現行ベストのときは「過去ベスト」を算出できないため
 * 非表示とする（判定不能扱い。誤った「初」表示を防ぐ）。
 */
const BestTimeBadge: React.FC<BestTimeBadgeProps> = ({
  recordId,
  styleId,
  currentTime,
  recordDate,
  poolType,
  isRelaying,
  precomputedBestTimes,
}) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const [state, setState] = useState<BadgeState>({ kind: "none" });

  useEffect(() => {
    // precomputedBestTimes が渡された場合: 同期的に判定（Supabase クエリ不要）
    if (precomputedBestTimes !== undefined) {
      if (styleId === undefined || styleId === null || !currentTime) {
        setState({ kind: "none" });
        return;
      }
      const match = precomputedBestTimes.find(
        (bt) => bt.style_id === styleId && bt.pool_type === (poolType ?? 0),
      );

      let relevantBestTime: number | undefined;
      let relevantBestId: string | undefined;
      if (match) {
        if (isRelaying ?? false) {
          // リレー記録の表示: 主エントリの relayingTime を優先、フォールバックエントリなら本体を使う
          if (match.is_relaying) {
            relevantBestTime = match.time;
            relevantBestId = match.id;
          } else {
            relevantBestTime = match.relayingTime?.time;
            relevantBestId = match.relayingTime?.id;
          }
        } else {
          // 非リレー記録の表示: 主エントリが非リレーのときのみ有効
          if (!match.is_relaying) {
            relevantBestTime = match.time;
            relevantBestId = match.id;
          }
        }
      }

      if (relevantBestTime === undefined) {
        // 同条件 (種目×水路×リレー区分) の記録が他に存在しない = 初記録
        setState({ kind: "first" });
      } else if (relevantBestId === recordId) {
        // 自身が現行ベスト: 過去ベストを同期判定できないため非表示（判定不能）
        setState({ kind: "none" });
      } else {
        setState(getBadgeState(currentTime, relevantBestTime));
      }
      return;
    }

    // 通常パス: 記録日より前の自己ベストを取得して判定（web RecordBestBadge と同一）
    let cancelled = false;

    const check = async () => {
      // recordDate が無ければ「初」の誤表示防止のため非表示にする
      if (styleId == null || Number.isNaN(styleId) || !recordId || !currentTime || !recordDate) {
        if (!cancelled) setState({ kind: "none" });
        return;
      }
      try {
        const prev = await new RecordAPI(supabase).getPreviousBestTime(
          styleId,
          poolType ?? 0,
          recordId,
          isRelaying ?? false,
          recordDate,
        );
        const next = getBadgeState(
          currentTime,
          prev === null ? undefined : prev,
          prev === null,
        );
        if (!cancelled) setState(next);
      } catch (err) {
        console.error("ベストタイムチェックエラー:", err);
        // 取得失敗時は非表示（初の誤表示防止）
        if (!cancelled) setState({ kind: "none" });
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [recordId, styleId, currentTime, recordDate, poolType, isRelaying, supabase, precomputedBestTimes]);

  if (state.kind === "none") {
    return null;
  }

  if (state.kind === "first") {
    return (
      <View
        style={[styles.badge, styles.badgeFirst]}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel={t("recordMobile.bestBadge.first")}
      >
        <Text style={[styles.badgeText, styles.badgeTextFirst]}>
          {t("recordMobile.bestBadge.first")}
        </Text>
      </View>
    );
  }

  const isBest = state.kind === "best";
  return (
    <View
      style={[styles.badge, isBest ? styles.badgeBest : styles.badgeSlower]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={`${t("recordMobile.bestBadge.personalBest")} ${state.label}`}
    >
      <Text style={styles.badgeLabel}>{t("recordMobile.bestBadge.personalBest")}</Text>
      <Text style={[styles.badgeText, isBest ? styles.badgeTextBest : styles.badgeTextSlower]}>
        {state.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeFirst: {
    backgroundColor: "#FFFBEB", // amber-50
  },
  badgeBest: {
    backgroundColor: "#EFF6FF", // blue-50
  },
  badgeSlower: {
    backgroundColor: "#FEF2F2", // red-50
  },
  badgeLabel: {
    fontSize: 10,
    color: "#6B7280", // gray-500
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  badgeTextFirst: {
    color: "#D97706", // amber-600
  },
  badgeTextBest: {
    color: "#2563EB", // blue-600
  },
  badgeTextSlower: {
    color: "#DC2626", // red-600
  },
});

export default BestTimeBadge;
