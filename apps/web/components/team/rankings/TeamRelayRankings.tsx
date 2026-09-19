"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TrophyIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { TEAM_RELAY_RANKING_FETCH_LIMIT } from "@apps/shared/api/teams/relayRankings";
import {
  useTeamHasAnyRelayRecordQuery,
  useTeamRelayRankingsQuery,
} from "@apps/shared/hooks/queries/teams";
import { assignCompetitionRanks } from "@apps/shared/utils/ranking";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import type { TeamRelayRankingFilters } from "@apps/shared/types";
import RelayRankingTable from "./RelayRankingTable";

interface TeamRelayRankingsProps {
  teamId: string;
  /**
   * 絞り込み条件。**親 (`./TeamRankings.tsx`) が保持する。**
   * リレーか個人かは種目の選択そのものから決まる (`RankingFilterState.event`)
   * ので、絞り込み UI も親が1つだけ描く。ここで state を持つと、個人種目を
   * 選んでこのコンポーネントが unmount された時点で条件が既定に戻ってしまう。
   */
  filters: TeamRelayRankingFilters;
}

/** 1画面に出す行数。「さらに表示」はこの単位で増やす (個人種目版と同じ) */
const PAGE_SIZE = 50;

/**
 * リレー記録ランキングの**結果側**。
 *
 * リレー種目 × 1レグ距離 × 水路 × 性別区分でチームのリレー記録を総合タイムの
 * 速い順に並べる。行を展開するとレグごとの区間タイムと通算タイムが出る。
 *
 * **絞り込み UI と2カラムレイアウトは持たない。** 種目ラジオでリレーを選んだ
 * ときに親 (`./TeamRankings.tsx`) が `RankingSplitLayout` の結果カラムへ
 * これを差し込む。絞り込みは個人種目と共通の `RankingFilters` 1つだけで、
 * ここに2つ目の絞り込みを持たせるとモード切替のたびに UI が入れ替わる。
 *
 * 集計モードという概念を持たない (常に全レースを列挙する)。リレーには
 * 「1チーム1行」に畳み込む単位が無いため。RPC 側にも引数が無い
 * (根拠は `types/teamRelayRanking.ts` の `TeamRelayRankingFilters` の docstring)。
 */
export default function TeamRelayRankings({ teamId, filters }: TeamRelayRankingsProps) {
  const t = useTranslations("teams.ranking");
  const { supabase } = useAuth();

  const rankingsQuery = useTeamRelayRankingsQuery(supabase, teamId, filters);

  // RPC が total_time 昇順で返すので、そのまま同着同順位 (1,2,2,4) を付与する。
  // 順位付与は個人種目版と同じ `assignCompetitionRanks` を使う (新しいランク関数を
  // 作らない)。比較する値が time ではなく totalTime なだけ。
  const rankedRows = useMemo(
    () => assignCompetitionRanks(rankingsQuery.data ?? [], (record) => record.totalTime),
    [rankingsQuery.data],
  );

  const isEmptyResult =
    !rankingsQuery.isPending && !rankingsQuery.isError && rankedRows.length === 0;

  // 空状態の文言を「条件に一致なし」と「そもそもチームにリレー記録が無い」に分ける。
  //
  // 個人種目版の `hasAnyRecord` は RLS の枝の都合で teamCompetitions スコープでしか
  // 信用できなかったが、`relay_records` の SELECT RLS は team_id 一本なので
  // この結果は常に信用してよい (根拠は TeamRelayRankingsAPI.hasAnyRelayRecord の docstring)。
  const hasAnyRelayRecordQuery = useTeamHasAnyRelayRecordQuery(supabase, teamId, {
    enabled: isEmptyResult,
  });

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // 絞り込みを変えたら表示件数を初期化する (前の条件の「さらに表示」を引き継がない)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filters]);

  const visibleRows = rankedRows.slice(0, visibleCount);
  const hasMore = rankedRows.length > visibleCount;

  // 取得上限に張り付いた = これより遅い記録が表示されていない可能性がある。
  // 判定と文言は個人種目版 (`./TeamRankings.tsx`) と同じ (上限の定数だけ別)。
  // リレーに集計モードは無いが、1チームが同じ種目を何度も泳げば到達しうる。
  const isFetchLimitReached = rankedRows.length >= TEAM_RELAY_RANKING_FETCH_LIMIT;

  const isLoading =
    rankingsQuery.isPending || (isEmptyResult && hasAnyRelayRecordQuery.isPending);

  // 生の PostgrestError.message は出さない。UserFacingError は素通しする
  const errorMessage = rankingsQuery.isError
    ? toUserFacingMessage(rankingsQuery.error, t("relay.error"))
    : null;

  // 件数 / 読み込み / エラー / 空状態 / 表 / 「さらに表示」。
  // 親が `RankingSplitLayout` の結果カラム (`xl` 以上は右カラム、`xl` 未満は
  // 絞り込みの下) に差し込む。
  //
  // 件数は**結果の先頭 = 表の直上**。個人種目版も同じ位置に揃えてある
  // (種目ラジオでモードが変わるので、位置が動くと切り替えのたびに目線が飛ぶ)。
  //
  // 並び順は個人種目版と同一: 件数 → 切り詰め (件数への but 書き) → 年度注意書き。
  // 切り詰めを件数から離すと「何件に対する but なのか」が読めなくなる。
  return (
    <div data-testid="team-relay-rankings">
      {!isLoading && !errorMessage && rankedRows.length > 0 && (
        <p
          className="mb-2 text-right text-xs text-gray-500"
          data-testid="team-relay-rankings-result-count"
        >
          {t("resultCount", { count: rankedRows.length })}
        </p>
      )}

      {/* 切り詰め通知。マークアップ・位置・配色は個人種目版
          (`./TeamRankings.tsx`) と同一で、上限の定数だけ別。
          **件数の直下・素のテキスト**で、ボックスにしないこと (理由は個人種目版の
          コメント: 年度注意書きと並んでボックスが積む / アイコンを共有すると
          再試行できない事象が再試行できる事象と同じ見た目になる)。 */}
      {!isLoading && !errorMessage && isFetchLimitReached && (
        <p
          role="status"
          className="mb-2 text-xs text-amber-700"
          data-testid="team-relay-rankings-truncated-note"
        >
          {t("truncatedNote", { limit: TEAM_RELAY_RANKING_FETCH_LIMIT })}
        </p>
      )}

      {/* 🚨 **年度の注意書き (`period.fiscalYearNote`) はここには出さない。**
          個人種目版は「年度で絞ると大会に紐づかない記録 (一括登録) が落ちる」と
          説明するが、**リレーではその事象が発生しえない**:
            - リレー RPC はスコープ軸を持たず、`relay_records.team_id` が行に
              付いているので構造上チーム内に閉じている
            - `competition_id = NULL` のリレー記録を作る経路が**存在しない**
              (根拠: `apps/shared/types/relayRecord.ts` の `competitionId` の
              docstring — あの null 許容は「大会に紐づかないリレー記録を直接
              入力する」機能のための**予約**であり、現状その行を生む経路は無い)

          ⚠️ **将来復活させる条件:** `relay_records` に
          `competition_id = NULL` の行を作る経路が実装されたら、この注意書きを
          有効に戻すこと (個人種目版と同じ `period.fiscalYearNote` を使う。
          リレー専用キーは新設しない)。`relayRecord.ts` 側にも
          このファイルへの相互参照を置いてあるので、予約を実装するときは
          両方を見ること。 */}

      {isLoading && (
        <div className="animate-pulse space-y-2" data-testid="team-relay-rankings-loading">
          <span className="sr-only">{t("loading")}</span>
          {[...Array(5)].map((_, index) => (
            <div key={index} className="h-10 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      )}

      {!isLoading && errorMessage && (
        <div className="py-8 text-center" data-testid="team-relay-rankings-error">
          <p className="text-sm text-red-600">{errorMessage}</p>
          <button
            type="button"
            data-testid="team-relay-rankings-retry"
            onClick={() => void rankingsQuery.refetch()}
            className="mt-3 inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {!isLoading && !errorMessage && isEmptyResult && hasAnyRelayRecordQuery.data === false && (
        <div className="py-8 text-center" data-testid="team-relay-rankings-empty-no-records">
          <TrophyIcon className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-700">
            {t("relay.empty.noRecordsTitle")}
          </p>
          <p className="mt-1 text-xs text-gray-500">{t("relay.empty.noRecordsBody")}</p>
        </div>
      )}

      {!isLoading && !errorMessage && isEmptyResult && hasAnyRelayRecordQuery.data !== false && (
        <div className="py-8 text-center" data-testid="team-relay-rankings-empty-no-match">
          <TrophyIcon className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-700">{t("relay.empty.noMatchTitle")}</p>
          <p className="mt-1 text-xs text-gray-500">{t("relay.empty.noMatchBody")}</p>
        </div>
      )}

      {!isLoading && !errorMessage && rankedRows.length > 0 && (
        <>
          <RelayRankingTable rows={visibleRows} />
          {hasMore && (
            <div className="mt-4 text-center">
              <button
                type="button"
                data-testid="team-relay-rankings-show-more"
                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t("showMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
