import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { RecordAPI } from "@apps/shared/api/records";
import { formatTimeBest } from "@/utils/formatters";

/** 自己ベストと同記録とみなす許容誤差（秒）＝web share/utils.ts BEST_EPSILON と同値 */
const BEST_EPSILON = 0.005;

/**
 * YYYY-MM-DD 形式の日付を bulkQuery の created_at 比較用に正規化する。
 * YYYY-MM-DD (10文字) は当日 00:00:00.000Z に拡張し、当日以前のみ対象とする。
 * ISO タイムスタンプの場合はそのまま返す。
 * (web components/ui/BestTimeBadge.tsx normalizeRecordDateForBulkComparison と同一)
 */
function normalizeRecordDateForBulkComparison(recordDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    return `${recordDate}T00:00:00.000Z`;
  }
  return recordDate;
}

/** 自己ベストバッジ状態（web ShareBadgeState と同一の3状態+非表示） */
type ShareBadgeState =
  | { kind: "first" }
  | { kind: "best"; label: string }
  | { kind: "slower"; label: string }
  | { kind: "none" };

/**
 * コンポーネント内部状態: 3状態に加えて一覧向けベスト。
 * listBest は showDiff=false の一覧表示専用（「記録日時点で自己ベストだったか」を
 * 差分なしで表示。web 一覧 BestTimeBadge 相当）で、getBadgeState からは返らない。
 */
type BadgeState = ShareBadgeState | { kind: "listBest" };

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
   * false の場合、一覧向けの2状態表示にする（web 一覧 BestTimeBadge と同一判定）。
   * 「その記録の記録日時点で自己ベストだったか」を非同期クエリで判定し、
   * ベストのときのみバッジを表示する（差分・「初」・遅い記録の赤バッジは出さない）。
   * true / 未指定の場合は3状態表示（詳細画面・シェアカード向け）。
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
 * 一覧表示 (showDiff === false。web components/ui/BestTimeBadge.tsx と同一アルゴリズム):
 * - 同一 user_id / style_id / is_relaying / (poolType 指定時) pool_type で
 *   自分自身を除外した過去記録を「大会記録 (competitions.date < recordDate)」と
 *   「一括登録 (created_at < 正規化 recordDate)」の2クエリで取得し min を過去ベストとする
 * - 過去ベストなし or currentTime がそれより速い → 「自己ベスト」バッジ (blue、差分なし)
 * - それ以外・ロード中・判定不能 (styleId / recordDate なし)・エラー → 非表示
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
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const [state, setState] = useState<BadgeState>({ kind: "none" });
  const isListVariant = showDiff === false;

  useEffect(() => {
    if (isListVariant) {
      // 一覧パス: web components/ui/BestTimeBadge.tsx checkBestTime と同一アルゴリズム。
      // 「その記録の記録日時点で自己ベストだったか」を非同期クエリで判定し、
      // 判定完了までは非表示（web の loading 中非表示と同じ単一パス）。
      let listCancelled = false;
      setState({ kind: "none" });

      const checkListBest = async () => {
        // ガード条件: styleId または recordDate が falsy な場合は非表示（web と同一）
        if (!styleId || !recordDate) {
          return;
        }
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            return;
          }

          // その記録日より前の同じ条件（種目・リレー区分・poolType 指定時は水路）の記録を取得
          // 1. 大会記録（competition_id あり）: competitions.date で比較
          let competitionQuery = supabase
            .from("records")
            .select("id, time, competition:competitions!inner(date)")
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

          // 2. 一括登録（competition_id = null）: created_at で比較
          let bulkQuery = supabase
            .from("records")
            .select("id, time, created_at")
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

          // 両方のクエリを並列実行
          const [competitionResult, bulkResult] = await Promise.all([
            competitionQuery,
            bulkQuery,
          ]);

          if (competitionResult.error) throw competitionResult.error;
          if (bulkResult.error) throw bulkResult.error;

          // 両方の結果から最速タイムを取得
          const competitionBest = (
            competitionResult.data?.[0] as { time?: number } | undefined
          )?.time;
          const bulkBest = (bulkResult.data?.[0] as { time?: number } | undefined)?.time;

          let previousBestTime: number | null = null;
          if (competitionBest !== undefined && bulkBest !== undefined) {
            previousBestTime = Math.min(competitionBest, bulkBest);
          } else if (competitionBest !== undefined) {
            previousBestTime = competitionBest;
          } else if (bulkBest !== undefined) {
            previousBestTime = bulkBest;
          }

          // 以前の記録がない、または現在のタイムが以前のベストより速い場合のみ表示
          const isBest = previousBestTime === null || currentTime < previousBestTime;
          if (!listCancelled) {
            setState(isBest ? { kind: "listBest" } : { kind: "none" });
          }
        } catch (err) {
          console.error("ベストタイムチェックエラー:", err);
          if (!listCancelled) setState({ kind: "none" });
        }
      };

      checkListBest();
      return () => {
        listCancelled = true;
      };
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
  }, [recordId, styleId, currentTime, recordDate, poolType, isRelaying, supabase, isListVariant]);

  if (state.kind === "none") {
    return null;
  }

  if (state.kind === "listBest") {
    return (
      <View
        style={[styles.badge, styles.badgeBest]}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel={t("recordMobile.bestBadge.personalBest")}
      >
        <Text style={[styles.badgeText, styles.badgeTextBest]}>
          {t("recordMobile.bestBadge.personalBest")}
        </Text>
      </View>
    );
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
