// =============================================================================
// TeamRelayRankings - ランキングタブのリレー本体
// =============================================================================
//
// 種目チップでリレー (フリー / メドレー) が選ばれているときに、ツールバーの下に
// 出る本体。「種類 × 1レグ距離 × 水路 × 性別区分」でチームのリレー記録を
// 総合タイムの速い順に並べ、行を展開するとレグごとの区間タイムと通算タイムが出る。
//
// 取得は SECURITY DEFINER RPC (認可はサーバー側) を叩く
// `useTeamRelayRankingsQuery`、順位付与は個人種目版と同じ
// `assignCompetitionRanks` (同着は同順位で次順位を件数分スキップ)。
//
// ⚠️ **絞り込み state は持たない。** 種目 (個人 / リレー) は1つのラジオグループに
// 統合され、条件は親 (`./TeamRankings.tsx`) が `RankingFilterState` 1本で持つ。
// この層は親が射影した `TeamRelayRankingFilters` を受け取るだけなので、
// ツールバー・絞り込みシート・要約も持たない (個人種目と共通で親にある)。
//
// 集計モードという概念そのものが無く、常に全レースを列挙する。リレーには
// 「1チーム1行」に畳み込む単位が無いため (根拠は `types/teamRelayRanking.ts` の
// `TeamRelayRankingFilters` の docstring。当初あった `teamBest` は性別区分を
// またいで最速1本を返す壊れた挙動だったため RPC の引数ごと削除された)。

import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import {
  useTeamHasAnyRelayRecordQuery,
  useTeamRelayRankingsQuery,
} from "@apps/shared/hooks/queries/teams";
import { TEAM_RELAY_RANKING_FETCH_LIMIT } from "@apps/shared/api/teams/relayRankings";
import { assignCompetitionRanks } from "@apps/shared/utils/ranking";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import type { TeamRelayRankingFilters, TeamRelayRankingRow } from "@apps/shared/types";
import { useAuth } from "@/contexts/AuthProvider";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { RankingErrorView } from "./RankingErrorView";
import { RelayRankingList } from "./RelayRankingList";

export interface TeamRelayRankingsProps {
  teamId: string;
  /**
   * 適用中の条件。親が `RankingFilterState` から射影したもの
   * (`toRankingQueryTarget`)。**この層でモードを判定しない** — ここが
   * レンダーされている時点で種目はリレーである。
   */
  filters: TeamRelayRankingFilters;
}

export const TeamRelayRankings: React.FC<TeamRelayRankingsProps> = ({ teamId, filters }) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();

  const rankingsQuery = useTeamRelayRankingsQuery(supabase, teamId, filters);
  const records = rankingsQuery.data;

  // RPC が ORDER BY total_time ASC で返した並びをそのまま渡す前提。
  // 順位付与は個人種目版と同じ shared の純粋関数に任せる (新しいランク関数を
  // 作らない)。比較する値が time ではなく totalTime なだけ。
  const rows = useMemo<TeamRelayRankingRow[]>(
    () => (records ? assignCompetitionRanks(records, (record) => record.totalTime) : []),
    [records],
  );

  // 0件のときだけ「チームにそもそもリレー記録が無いのか」を判定する
  // (絞り込み0件と文言を分けるためだけの補助クエリ)。
  //
  // 個人種目の `hasAnyRecord` は RLS の枝の都合で teamCompetitions スコープでしか
  // 信用できないが、`relay_records` の SELECT RLS は team_id 一本
  // (承認済みかつアクティブなメンバー) で「他チームの記録は見えない」枝が
  // 存在しないため、この結果は常に信用してよい
  // (根拠は TeamRelayRankingsAPI.hasAnyRelayRecord の docstring。web の
  //  TeamRelayRankings.tsx も同じ判断でスコープ条件を持たない)。
  const isEmptyResult = rankingsQuery.isSuccess && rows.length === 0;
  const hasAnyRelayRecordQuery = useTeamHasAnyRelayRecordQuery(supabase, teamId, {
    enabled: isEmptyResult,
  });

  const refetchRankings = rankingsQuery.refetch;
  const handleRetry = useCallback(() => {
    void refetchRankings();
  }, [refetchRankings]);

  // 件数は「取得が終わって成功し、1件以上あった」ときだけ出す。
  // 読み込み中やエラー中に「0件」を出すと「該当なし」という誤った事実を伝える。
  const isBodySettled = !rankingsQuery.isLoading && !rankingsQuery.isError;
  const showResultCount = isBodySettled && rows.length > 0;
  // 取得上限に到達したら明示する (黙って切ると「自分の記録が無い」と読める)。
  // リレーには集計モードが無く常に全レースを列挙するので、**個人種目より上限に
  // 到達しやすい**。上限値は個人種目とは別の定数で、値が一致していることに
  // 依存した挙動は無い
  const isTruncated = isBodySettled && rows.length >= TEAM_RELAY_RANKING_FETCH_LIMIT;

  // 状態分岐は **isPending を最初に見る** 3段構造にする。
  //   1. isPending → スピナー (「条件未確定」をローディング側に倒す経路が無いので
  //      復帰手段の無い永久スピナーは構造的に起きない)
  //   2. isError → エラー + 再試行
  //   3. 本体
  const renderBody = () => {
    if (rankingsQuery.isPending) {
      return <LoadingSpinner message={t("teams.ranking.loading")} />;
    }
    if (rankingsQuery.isError) {
      return (
        <RankingErrorView
          message={toUserFacingMessage(rankingsQuery.error, t("teams.ranking.relay.error"))}
          onRetry={handleRetry}
        />
      );
    }
    return (
      <RelayRankingList
        rows={rows}
        // 「まだリレー記録がない」と言い切れるのは hasAnyRelayRecord が
        // 実際に false を返したときだけ。判定前 (読み込み中・失敗時) は
        // 「条件に一致しない」側に寄せる
        emptyVariant={hasAnyRelayRecordQuery.data === false ? "noRecords" : "noMatch"}
      />
    );
  };

  return (
    <View style={styles.container}>
      {showResultCount && (
        <View style={styles.metaRow}>
          <Text style={styles.resultCount}>
            {t("teams.ranking.resultCount", { count: rows.length })}
          </Text>
          {isTruncated && (
            <Text style={styles.metaNote}>
              {t("teams.ranking.truncatedNote", { limit: TEAM_RELAY_RANKING_FETCH_LIMIT })}
            </Text>
          )}
        </View>
      )}
      {renderBody()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  metaRow: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 4,
  },
  resultCount: {
    fontSize: 13,
    color: "#6B7280",
  },
  // 個人種目側 (`./TeamRankings.tsx` の metaNote) と同じ注記スタイル
  metaNote: {
    fontSize: 12,
    color: "#B45309",
    lineHeight: 18,
  },
});
