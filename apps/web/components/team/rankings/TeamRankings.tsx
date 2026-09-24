"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { StyleAPI } from "@apps/shared/api/styles";
import { TEAM_RANKING_FETCH_LIMIT } from "@apps/shared/api/teams/rankings";
import { styleKeys } from "@apps/shared/hooks/queries/keys";
import { useTeamHasAnyRecordQuery, useTeamRankingsQuery } from "@apps/shared/hooks/queries/teams";
import { assignCompetitionRanks } from "@apps/shared/utils/ranking";
import { buildRankingStyleGroups } from "@apps/shared/utils/rankingStyleAxis";
import {
  buildDefaultRankingFilterState,
  shouldShowFiscalYearNote,
  toRankingQueryTarget,
  type RankingFilterState,
  type RankingQueryTarget,
} from "@apps/shared/utils/rankingEventAxis";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import RankingFilters from "./RankingFilters";
import RankingSplitLayout from "./RankingSplitLayout";
import RankingTable from "./RankingTable";
import TeamRelayRankings from "./TeamRelayRankings";
import WaPointsCompareLauncher from "./WaPointsCompareLauncher";

interface TeamRankingsProps {
  teamId: string;
}

/** 1画面に出す行数。「さらに表示」はこの単位で増やす (サーバーへの追加リクエストは発生しない) */
const PAGE_SIZE = 50;

/**
 * チーム記録ランキングタブ。
 *
 * 種目 × 距離 × 水路 × 性別 (+ 個人種目のみ 対象大会) でチームの記録を速い順に
 * 並べる。**種目グループに 個人5種目 + リレー2種類 の7択が並び、選んだ種目が
 * 個人かリレーかで表示するランキングが決まる。**
 *
 * 🚨 **「個人種目 / リレー」のビュー切替 state は持たない。** モードは
 * `RankingFilterState.event` から `toRankingQueryTarget` が導出する。別に
 * view state を置くと「種目は個人なのにリレー表が出ている」不整合が表現可能に
 * なる (根拠は `types/teamRanking.ts` の `RankingEventSelection` の docstring)。
 *
 * **新しいタブは作らない。** タブの配線は `TeamTabs.tsx` の `TEAM_TAB_DEFS` /
 * `TeamAdminTabs.tsx` の `TEAM_ADMIN_TAB_DEFS` に集約されており、増やすと
 * 「union 型 / 表示配列 / URL クエリのホワイトリスト / 描画の switch」の
 * 4箇所の話になる。
 *
 * 集計モードは personalBest (1人1行)、期間は通算に固定 (モード切替と年度セレクタは
 * 別スプリント)。並び順は RPC の `ORDER BY time ASC` + `assignCompetitionRanks` が
 * 唯一の定義元で、列ヘッダーによる並べ替えは提供しない (mobile とのパリティも兼ねる)。
 *
 * 🚨 **`styles` マスターが取れなくてもリレーは使える。** リレーの軸は
 * `RELAY_EVENTS` (静的定義) 由来で RPC も `styles` を引かないため、無関係な
 * マスターの失敗でタブ全体を止めない (`buildDefaultRankingFilterState` が
 * リレーへフォールバックする)。個人種目が使えないことは通知で伝える。
 */
export default function TeamRankings({ teamId }: TeamRankingsProps) {
  const t = useTranslations("teams.ranking");
  const { supabase } = useAuth();

  // 種目マスター (22行の固定データ)。個人種目の距離の選択肢はここから導出する。
  // 導出ロジックは @apps/shared/utils/rankingStyleAxis に集約してあり、
  // mobile も同じ関数を使う (web/mobile で別実装を持たない)。
  const stylesQuery = useQuery({
    queryKey: styleKeys.list(),
    queryFn: async () => await new StyleAPI(supabase).getStyles(),
    // 固定マスターなのでセッション中は再取得しない
    staleTime: Infinity,
  });

  const styleGroups = useMemo(
    () => buildRankingStyleGroups(stylesQuery.data ?? []),
    [stylesQuery.data],
  );

  const defaultState = useMemo(() => buildDefaultRankingFilterState(styleGroups), [styleGroups]);

  // ユーザーが1つも触っていない間は既定条件をそのまま使う。
  // 既定条件は styles マスターの取得結果で変わる (取れれば個人種目、取れなければ
  // リレー) ため state の初期値にできない。
  // ⚠️ 既定の種目・距離をここに書き写さないこと (定義元は
  // `buildDefaultRankingFilters` の `DEFAULT_STYLE` / `DEFAULT_DISTANCE`)。
  const [selectedState, setSelectedState] = useState<RankingFilterState | null>(null);
  const filterState = selectedState ?? defaultState;

  /**
   * いま画面に出ている絞り込みと、それに対応する RPC 条件。
   * **mobile (`apps/mobile/components/teams/rankings/TeamRankings.tsx`) と同じ構造。**
   *
   * 🚨 **`selectedState` / `filterState` を直接読む箇所を増やさないこと。**
   * ユーザーの選択が今の styles マスターで成立しない場合は既定へ倒すので、
   * 選択値と RPC 条件が食い違いうる。`active.state` と `active.target` は
   * **同じ判定を1回通った結果**なので、両方をここから読めば構造的に一致する。
   *
   * 倒し先は `defaultState` (= `buildDefaultRankingFilterState(styleGroups)`)。
   * 無条件にリレーへ倒すと、groups が非空で「選択中の (種目, 距離) の行だけが
   * 消えた」ケースまでリレーに飛ぶ。そのとき `individualUnavailable` は null なので
   * バナーが出ず、**説明なしに別種類のランキングを見せる**ことになる。既定へ倒せば
   *   - groups が空   → 既定はリレー (`empty` バナーが理由を伝える)
   *   - groups が非空 → 既定は**個人種目**なのでモードが保たれる。どの種目/距離に
   *     なるかは `buildDefaultRankingFilters` が決める (`DEFAULT_STYLE` /
   *     `DEFAULT_DISTANCE`。**マスターにその組み合わせが無ければ先頭の
   *     種目/距離にフォールバックする**)
   * になる。
   *
   * ⚠️ 既定の値をここに書き写さないこと。一度「100m 自由形」と書いて自己訂正し、
   * その後 `DEFAULT_DISTANCE` が 50 に変わって再び腐った。定義元を指すだけにする
   * (フォールバックの**規則**は値ではないので書いてよい)。
   *
   * `selectedState` は**破壊しない** (これは派生値)。マスターが復活すれば
   * ユーザーの選択がそのまま蘇る。
   */
  const active = useMemo<{ state: RankingFilterState; target: RankingQueryTarget } | null>(() => {
    const requested = toRankingQueryTarget(styleGroups, filterState);
    if (requested) return { state: filterState, target: requested };

    // ユーザーが選んだ個人種目が今のマスターで成立しない = セッション中に styles が
    // 空になった / その行だけ消えた (`styles` は authenticated に TRUNCATE 権限が
    // あり到達可能)。既定 state に倒すのでタブは死なず、種目ラジオも
    // 「選択中の種目がどのピルでもない」状態にならない。
    const fallback = toRankingQueryTarget(styleGroups, defaultState);
    return fallback ? { state: defaultState, target: fallback } : null;
  }, [styleGroups, filterState, defaultState]);

  /**
   * 個人種目が選べない理由。null なら選べる (取得中も null = まだ判定しない)。
   *
   * **`styles` の「取得失敗」と「空」を分ける。** 取得失敗は再試行に意味があるが、
   * 空 (マスターが消えた / 全行が canonical 化できない) は再試行しても同じ結果に
   * なるので、再試行ボタンを出すと直らないボタンを押させ続けることになる。
   * 第2弾では両方を `hasStyleMasterProblem` に束ねていたが、あれは「どちらでも
   * タブが全滅する」前提だったから区別に意味が無かった。リレーが使える今は
   * ユーザーの次の行動 (再試行するか、管理者に連絡するか) が変わるので分ける。
   */
  const individualUnavailable: "fetchFailed" | "empty" | null = stylesQuery.isPending
    ? null
    : stylesQuery.isError
      ? "fetchFailed"
      : styleGroups.length === 0
        ? "empty"
        : null;

  const individualFilters = active?.target.mode === "individual" ? active.target.filters : undefined;
  const relayFilters = active?.target.mode === "relay" ? active.target.filters : undefined;

  const rankingsQuery = useTeamRankingsQuery(supabase, teamId, individualFilters);

  // RPC が time 昇順で返すので、そのまま同着同順位 (1,2,2,4) を付与する
  const rankedRows = useMemo(
    () => assignCompetitionRanks(rankingsQuery.data ?? [], (record) => record.time),
    [rankingsQuery.data],
  );

  /**
   * 個人種目もリレーも条件が組めない状態。**実際には到達しない。**
   *
   * `active` は候補が成立しなければ `defaultState` へ倒し、その `defaultState` は
   * `buildDefaultRankingFilterState(styleGroups)` が**同じ `styleGroups` から**
   * 作ったものである。よって
   *   - groups が空   → 既定はリレー。`toRankingQueryTarget` はリレーでは静的定義
   *     (`RELAY_EVENTS`) だけを読むので null を返さない
   *   - groups が非空 → 既定の `styleId` は groups 由来なので `findStyleId` が引ける
   * となり、2段目の `target` は必ず非 null になる。
   *
   * それでもガードを残すのは、`toRankingQueryTarget` の null を**非 null 断定で
   * 潰さない**ため。到達不能の根拠がこのファイルの外 (shared の2関数が同じ
   * `groups` について整合していること) にあるので、将来どちらかが変わったときに
   * 静かに undefined を撒かせない。mobile も同じ判断でガードを残している。
   *
   * ⚠️ ローディング扱いにしないこと。`stylesQuery` は settled + `staleTime: Infinity`
   * で再取得トリガーが無く、**永久スピナー**になる。エラー + 再試行に寄せる。
   */
  const isFilterStateBroken = !stylesQuery.isPending && active === null;

  const isEmptyResult =
    individualFilters !== undefined &&
    !stylesQuery.isPending &&
    !rankingsQuery.isPending &&
    !rankingsQuery.isError &&
    rankedRows.length === 0;

  // 空状態の文言を「条件に一致なし」と「そもそもチームに記録が無い」に分けるための判定。
  //
  // ⚠️ `teamCompetitions` のときだけ問い合わせる。`hasAnyRecord` は RLS 下の素のクエリで、
  // メンバーが別チームのチーム大会で出した記録 (`records.team_id` が他チーム) を数えられない。
  // `allCompetitions` は SECURITY DEFINER の RPC がその記録を返せるスコープなので、
  // false を「記録が1件もない」と読むと嘘になる (「チームに大会記録がありません」と
  // 出したのに種目を変えると記録が出る)。断定できない側は「条件に一致なし」に寄せる。
  const canTrustHasAnyRecord = individualFilters?.scope === "teamCompetitions";
  const hasAnyRecordQuery = useTeamHasAnyRecordQuery(supabase, teamId, {
    // リレーの種目を選んでいる間は個人種目の空状態判定を問い合わせない
    // (`individualFilters` が undefined なので `isEmptyResult` が立たない)
    enabled: isEmptyResult && canTrustHasAnyRecord,
  });

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // 絞り込みを変えたら表示件数を初期化する (前の条件の「さらに表示」を引き継がない)
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [individualFilters]);

  const visibleRows = rankedRows.slice(0, visibleCount);
  const hasMore = rankedRows.length > visibleCount;

  /**
   * 取得上限に張り付いた = **これより遅い記録が表示されていない可能性がある**。
   *
   * `personalBest` は1人1行なので 500 に届くチームはまず無いが、`allRaces` は
   * 1人が何本も出るので現実的に到達する。黙って切ると「自分の記録が無い」と
   * 読めるので明示する。
   *
   * ⚠️ ちょうど 500 件で全件だった場合も出る。文言を「切り詰めた」と断定せず
   * 「表示されていない可能性がある」にしてあるのはこのため。件数を数えるだけでは
   * 全件か切り詰めかを区別できない (区別するにはサーバー側ページング = 第3弾の債務)。
   */
  const isFetchLimitReached = rankedRows.length >= TEAM_RANKING_FETCH_LIMIT;

  const isLoading =
    stylesQuery.isPending ||
    (individualFilters !== undefined && rankingsQuery.isPending) ||
    (isEmptyResult && canTrustHasAnyRecord && hasAnyRecordQuery.isPending);

  // `styles` の失敗そのものはここでは扱わない (下の individualUnavailable 通知が
  // 担当する。リレーは使えるので結果側を丸ごとエラーで潰さない)。
  const errorMessage = (() => {
    if (isFilterStateBroken) return t("error");
    if (rankingsQuery.isError) return toUserFacingMessage(rankingsQuery.error, t("error"));
    return null;
  })();

  // 個人種目の結果側 (件数 / スコープ注意書き / 読み込み / エラー / 空状態 / 表 /
  // 「さらに表示」)。**`xl` 以上では右カラム、`xl` 未満では絞り込みの下**に入る。
  // 帯域で JSX を 2本持たない (片方だけ更新されて静かに乖離するため。切り替えは
  // `RankingSplitLayout` の CSS だけが行う)。
  //
  // 件数は**結果の先頭 = 表の直上**。リレー (`./TeamRelayRankings.tsx`) と同じ位置に
  // 揃えてある。種目ラジオでモードが変わる構成になったので、カード見出しの右と
  // 結果の先頭で位置が入れ替わると切り替えのたびに目線が飛ぶ。
  const resultsContent = (
    <>
      {!isLoading && !errorMessage && rankedRows.length > 0 && (
        <p
          className="mb-2 text-right text-xs text-gray-500"
          data-testid="team-rankings-result-count"
        >
          {t("resultCount", { count: rankedRows.length })}
        </p>
      )}

      {/* 取得上限に張り付いたときだけ出す。**件数の直下・素のテキスト**で、
          枠線も背景もアイコンも付けない。

          🚨 ボックスにしないこと。この下に「スコープ」「年度」の注意書き
          (どちらも青のボックス) が並びうるので、3つ同時に成立するとボックスが
          3枚積む (allCompetitions + 年度 + 上限到達は同時に起こりうる)。

          🚨 それでも「欠損の警告」と「仕様の説明」の区別は必要なので、**文字色**で
          付ける (件数 `text-gray-500` / これ `text-amber-700` / 仕様説明は青)。
          `ExclamationTriangleIcon` は使わない — あのアイコンは
          `individualUnavailable` (異常 + 再試行できる) が使っているので、
          **再試行できない事象を再試行できる事象と同じ見た目**にしてしまう。

          揃えは件数の `text-right` に合わせない。文言が長く**どの帯域でも1行に
          収まらない**ため、右寄せにすると左端がラギッドになって読みにくい。
          実測 (ビルド後 CSS + headless Chromium, ja):
            320px = 3行 / 375・640・1280・1536px = 2行
          1行に収まる幅が存在しないので、右寄せの利点 (件数と右端が揃う) は
          得られず折り返しの読みにくさだけが残る。 */}
      {!isLoading && !errorMessage && isFetchLimitReached && (
        <p
          role="status"
          className="mb-2 text-xs text-amber-700"
          data-testid="team-rankings-truncated-note"
        >
          {t("truncatedNote", { limit: TEAM_RANKING_FETCH_LIMIT })}
        </p>
      )}

      {individualFilters?.scope === "allCompetitions" && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-800"
          data-testid="team-rankings-scope-note"
        >
          <InformationCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t("scope.allCompetitionsNote")}</span>
        </div>
      )}

      {/* 年度指定時は `competitions.date` で絞るので、大会に紐づかない記録
          (一括登録) は年度が決まらず落ちる。**通算では出ていた記録が消えるので
          説明が必要**。

          🚨 出す条件は「年度で絞っている」だけでは足りない (`teamCompetitions`
          では一括登録記録が通算でも既に落ちている / リレーでは事象自体が
          発生しない)。**4状態の真理値表と根拠は
          `shouldShowFiscalYearNote` (shared) が唯一の定義元**で、mobile の
          本体上部と絞り込みシートも同じ関数を読む。ここに条件を書き足さないこと。

          ⚠️ 渡すのは `active.state` (絞り込みの適用済み state)。
          `individualFilters` から再判定すると、mobile がシートの draft を
          評価するのと**別の型を通ることになり**、判定が2実装に戻る。

          🚨 配色は `individualUnavailable` の琥珀色と**変える**。あれは
          「種目マスターが壊れている」異常の通知だが、これは**正常な仕様の説明**で
          ユーザーに直せることが無い。同じ強さで出すと異常の通知が薄まる。
          スコープ注意書き (上) と同じ青の情報ボックスに揃える。 */}
      {active !== null && shouldShowFiscalYearNote(active.state) && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md bg-blue-50 p-3 text-xs text-blue-800"
          data-testid="team-rankings-fiscal-year-note"
        >
          <InformationCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t("period.fiscalYearNote")}</span>
        </div>
      )}

      {isLoading && (
        <div className="animate-pulse space-y-2" data-testid="team-rankings-loading">
          <span className="sr-only">{t("loading")}</span>
          {[...Array(5)].map((_, index) => (
            <div key={index} className="h-10 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      )}

      {!isLoading && errorMessage && (
        <div className="py-8 text-center" data-testid="team-rankings-error">
          <p className="text-sm text-red-600">{errorMessage}</p>
          <button
            type="button"
            data-testid="team-rankings-retry"
            onClick={() => {
              if (isFilterStateBroken) void stylesQuery.refetch();
              if (rankingsQuery.isError) void rankingsQuery.refetch();
            }}
            className="mt-3 inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {t("retry")}
          </button>
        </div>
      )}

      {!isLoading &&
        !errorMessage &&
        isEmptyResult &&
        canTrustHasAnyRecord &&
        hasAnyRecordQuery.data === false && (
          <div className="py-8 text-center" data-testid="team-rankings-empty-no-records">
            <TrophyIcon className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">{t("empty.noRecordsTitle")}</p>
            <p className="mt-1 text-xs text-gray-500">{t("empty.noRecordsBody")}</p>
          </div>
        )}

      {!isLoading &&
        !errorMessage &&
        isEmptyResult &&
        !(canTrustHasAnyRecord && hasAnyRecordQuery.data === false) && (
          <div className="py-8 text-center" data-testid="team-rankings-empty-no-match">
            <TrophyIcon className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-700">{t("empty.noMatchTitle")}</p>
            <p className="mt-1 text-xs text-gray-500">{t("empty.noMatchBody")}</p>
          </div>
        )}

      {!isLoading && !errorMessage && rankedRows.length > 0 && (
        <>
          <RankingTable rows={visibleRows} />
          {hasMore && (
            <div className="mt-4 text-center">
              <button
                type="button"
                data-testid="team-rankings-show-more"
                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t("showMore")}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6" data-testid="team-rankings">
      {/* 見出し行。「WAポイントで比較」はランキングの読み込み状態に関係なく
          常に同じ位置に出す (読み込み中に導線が消えないようにするため)。 */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900">{t("title")}</h2>
        <WaPointsCompareLauncher teamId={teamId} />
      </div>

      {/* 個人種目が使えないことの通知。**リレーは使えることを文言で伝える**
          (`individualUnavailable.*` の訳文に含めてある)。カード全体に効く事実なので
          結果カラムではなく見出しの直下に全幅で置く。
          再試行ボタンは「取得失敗」のときだけ — 「空」は再試行しても直らない。 */}
      {individualUnavailable && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
          data-testid="team-rankings-individual-unavailable"
        >
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p>{t(`individualUnavailable.${individualUnavailable}`)}</p>
            {individualUnavailable === "fetchFailed" && (
              <button
                type="button"
                data-testid="team-rankings-styles-retry"
                onClick={() => void stylesQuery.refetch()}
                className="mt-2 inline-flex items-center px-3 py-1.5 border border-amber-300 rounded-md text-xs font-medium text-amber-900 bg-white hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-500"
              >
                {t("retry")}
              </button>
            )}
          </div>
        </div>
      )}

      {stylesQuery.isPending || active === null ? (
        // 左カラムに入れる絞り込みが無い / まだ確定していない2状態。
        // 空の左半分と潰れた読み込み・エラーを並べても手がかりにならないので、
        // ここだけ2カラムにせず**全幅**で `resultsContent` を出す。
        //
        //   - `stylesQuery.isPending`: `stylesQuery.data` が undefined なので
        //     `styleGroups` は空。よって `active.state` はリレーの既定になっており
        //     **まだユーザーの選択ではない**。リレー2択だけの絞り込みを出して
        //     直後に個人種目へ切り替わると選択肢がちらつく。リレーの問い合わせも
        //     ここでは起きない (TeamRelayRankings を mount しないため)
        //   - `active === null`: 到達不能なガード (根拠は `isFilterStateBroken`)。
        //     `resultsContent` 側がエラー + 再試行を出す
        resultsContent
      ) : (
        <RankingSplitLayout
          filters={
            <RankingFilters groups={styleGroups} state={active.state} onChange={setSelectedState} />
          }
          results={
            relayFilters ? (
              <TeamRelayRankings teamId={teamId} filters={relayFilters} />
            ) : (
              resultsContent
            )
          }
        />
      )}
    </div>
  );
}
