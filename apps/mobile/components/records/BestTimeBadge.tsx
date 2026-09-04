import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { RecordAPI } from "@apps/shared/api/records";
import { useListBestCandidatesQuery } from "@apps/shared/hooks/queries/records";
import { computeListPreviousBest, getBestBadgeState } from "@apps/shared/utils/bestTimeBadge";
import { formatTimeBest } from "@/utils/formatters";

/** 自己ベストと同記録とみなす許容誤差（秒）＝web share/utils.ts BEST_EPSILON と同値 */
const BEST_EPSILON = 0.005;

/** 自己ベストバッジ状態（web ShareBadgeState と同一の3状態+非表示） */
type ShareBadgeState =
  | { kind: "first" }
  | { kind: "best"; label: string }
  | { kind: "slower"; label: string }
  | { kind: "none" };

/** コンポーネント内部状態: 3状態パス・一覧パスとも同一の形（kind 構造は shared BestBadgeState と同一） */
type BadgeState = ShareBadgeState;

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
): ShareBadgeState {
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
  /**
   * false の場合、一覧向けの3状態表示にする（web 一覧 BestTimeBadge と同一判定・常時表示）。
   * 「その記録の記録日時点で初/自己ベスト更新/ベストより遅い」を非同期クエリで判定し、
   * コンパクトな1行バッジで常時表示する。
   * true / 未指定の場合は詳細画面・シェアカード向けの3状態表示（ラベル+値の2要素）。
   */
  showDiff?: boolean;
}

/**
 * 自己ベストバッジ。
 *
 * 3状態表示 (showDiff !== false。web RecordBestBadge / BestBadge のポート):
 * - 初記録: 「初」(amber)
 * - 自己ベスト更新 (±0含む): 「自己ベスト」+ 差分 (blue)
 * - ベストより遅い: 「自己ベスト」+ 差分 (red)
 * - 判定不能 (styleId なし / time 0 / エラー): 非表示
 *
 * 一覧表示 (showDiff === false。web components/ui/BestTimeBadge.tsx と同一の判定・3状態常時表示):
 * - 同一 user_id / style_id / is_relaying / (poolType 指定時) pool_type の記録候補を
 *   グループ単位の共有キャッシュクエリ (useListBestCandidatesQuery) で一括取得し、
 *   「大会記録 (competitions.date < recordDate)」と「一括登録 (created_at < 正規化
 *   recordDate)」の自己除外済み min を過去ベストとする (computeListPreviousBest)
 * - shared getBestBadgeState で判定: 初記録 / 自己ベスト更新 (±0含む) / ベストより遅い
 *   をコンパクトな1行バッジで常時表示 (first=amber, best=blue, slower=red)
 * - ロード中・判定不能 (styleId / recordDate なし)・エラー・time<=0 → 非表示
 */
const BestTimeBadge: React.FC<BestTimeBadgeProps> = ({
  recordId,
  styleId,
  currentTime,
  recordDate,
  poolType,
  isRelaying,
  showDiff,
}) => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const [state, setState] = useState<ShareBadgeState>({ kind: "none" });
  const isListVariant = showDiff === false;
  // user オブジェクトはトークン更新等で参照が変わり得るため id だけを依存に使う
  const userId = user?.id;

  // 一覧パス: web components/ui/BestTimeBadge.tsx checkBestTime と同一アルゴリズム。
  // 候補は (userId, styleId, isRelaying, poolType) グループ単位の共有キャッシュクエリで
  // 一括取得し（行ごとの 2 クエリ = N+1 を回避）、日付フィルタ・自己除外は
  // computeListPreviousBest がメモリ上で行う。
  // ガード条件: styleId または recordDate が falsy な場合はフェッチせず非表示（web と同一）
  const canJudgeList = isListVariant && !!userId && !!styleId && !!recordDate;
  const listQuery = useListBestCandidatesQuery(supabase, {
    userId,
    styleId,
    isRelaying: isRelaying ?? false,
    poolType,
    enabled: canJudgeList,
  });

  useEffect(() => {
    if (isListVariant && listQuery.error) {
      console.error("ベストタイムチェックエラー:", listQuery.error);
    }
  }, [isListVariant, listQuery.error]);

  // 「その記録の記録日時点で初/自己ベスト更新/ベストより遅い」の3状態を shared ロジックで判定。
  // 判定完了までは非表示（web の loading 中非表示と同じ単一パス）。エラー時も非表示。
  const listState: BadgeState = useMemo(() => {
    if (!isListVariant || !userId || !styleId || !recordDate || !listQuery.data) {
      return { kind: "none" };
    }
    const previousBest = computeListPreviousBest(listQuery.data, recordId, recordDate);
    return getBestBadgeState(currentTime, previousBest, previousBest === null);
  }, [isListVariant, userId, styleId, recordDate, listQuery.data, recordId, currentTime]);

  useEffect(() => {
    if (isListVariant) return;

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
          // poolType?: number | null は optional prop。唯一の呼び出し元 RecordItem.tsx は
          // record.pool_type (RecordWithDetails 上 NOT NULL) を常に渡すため、実際に
          // undefined になる経路は無い。
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
  }, [recordId, styleId, currentTime, recordDate, poolType, isRelaying, supabase, isListVariant]);

  const badgeState: BadgeState = isListVariant ? listState : state;

  if (badgeState.kind === "none") {
    return null;
  }

  if (badgeState.kind === "first") {
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

  const isBest = badgeState.kind === "best";

  // 一覧はコンパクトな1行表示（label のみ。"Best" 接頭辞込みで web pill と同一トーン）。
  // 一覧の best は「初」と同じ amber（ユーザー要望。3状態パスの best=blue とは異なる）。
  if (isListVariant) {
    const listToneStyle = isBest ? styles.badgeFirst : styles.badgeSlower;
    const listTextToneStyle = isBest ? styles.badgeTextFirst : styles.badgeTextSlower;
    return (
      <View
        style={[styles.badge, listToneStyle]}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel={badgeState.label}
      >
        <Text style={[styles.badgeText, listTextToneStyle]}>{badgeState.label}</Text>
      </View>
    );
  }

  const toneStyle = isBest ? styles.badgeBest : styles.badgeSlower;
  const textToneStyle = isBest ? styles.badgeTextBest : styles.badgeTextSlower;
  return (
    <View
      style={[styles.badge, toneStyle]}
      accessible={true}
      accessibilityRole="text"
      accessibilityLabel={`${t("recordMobile.bestBadge.personalBest")} ${badgeState.label}`}
    >
      <Text style={styles.badgeLabel}>{t("recordMobile.bestBadge.personalBest")}</Text>
      <Text style={[styles.badgeText, textToneStyle]}>{badgeState.label}</Text>
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
