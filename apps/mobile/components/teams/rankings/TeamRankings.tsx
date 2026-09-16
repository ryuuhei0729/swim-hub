// =============================================================================
// TeamRankings - チーム詳細「ランキング」タブ本体
// =============================================================================
//
// 「種目 × 距離 × 水路 × 性別」でチームの記録を速い順に並べる。
// 種目は **個人5種目 + リレー2種類の7択が1つのラジオグループ**で、その選択が
// 個人種目ランキングとリレーランキングのどちらを出すかを決める。
// 「個人種目 / リレー」のビュー切替トグルは持たない (ユーザー要望で撤去。
//  根拠は `@apps/shared/types/teamRanking.ts` の `RankingEventSelection`)。
//
// ⚠️ **モードを表す state を別に持たない。** 絞り込みは
// `RankingFilterState` 1本で持ち、表示するランキングの種類は
// `toRankingQueryTarget()` が `state.event` から導出する。view state を別に持つと
// 「種目は個人なのにリレー表が出ている」不整合な状態が表現可能になる。
//
// 取得は SECURITY DEFINER RPC (認可はサーバー側) を叩く
// `useTeamRankingsQuery` / `useTeamRelayRankingsQuery`、順位付与は
// `assignCompetitionRanks` (同着は同順位で次順位を件数分スキップ) に任せる。
//
// 集計モード (personalBest 固定) と期間 (通算固定) は別スプリント。

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StyleAPI } from "@apps/shared/api/styles";
import { styleKeys } from "@apps/shared/hooks/queries/keys";
import {
  useTeamHasAnyRecordQuery,
  useTeamRankingsQuery,
} from "@apps/shared/hooks/queries/teams";
import { TEAM_RANKING_FETCH_LIMIT } from "@apps/shared/api/teams/rankings";
import { assignCompetitionRanks } from "@apps/shared/utils/ranking";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import type { TeamRankingFilters, TeamRankingRow } from "@apps/shared/types";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import { useAuth } from "@/contexts/AuthProvider";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { WaPointsCompareModal } from "@/components/teams/wa-points-compare";
import { WaPointsInfoTooltip } from "@/components/ui/WaPointsInfoTooltip";
import { RankingErrorView } from "./RankingErrorView";
import { RankingFilterSheet } from "./RankingFilterSheet";
import { RankingList } from "./RankingList";
import { TeamRelayRankings } from "./TeamRelayRankings";
import { rankingDistanceLabel, rankingPeriodLabel } from "./rankingLabels";
import {
  buildDefaultRankingFilterState,
  buildRankingPeriodChoices,
  countActiveRankingFilterState,
  getRankingDistanceChoices,
  shouldShowFiscalYearNote,
  toIndividualGender,
  toRankingQueryTarget,
  type RankingFilterState,
  type RankingQueryTarget,
} from "@apps/shared/utils/rankingEventAxis";
import {
  buildRankingStyleGroups,
  type RankingStyleGroup,
} from "@apps/shared/utils/rankingStyleAxis";

interface RankingsContentProps {
  teamId: string;
  supabase: SupabaseClient;
  filters: TeamRankingFilters;
}

/**
 * 個人種目ランキングの本体 (ツールバーの下)。取得 → 順位付与 → 一覧までを担当し、
 * 絞り込み state は持たない (親が `RankingFilterState` 1本で持つ)。
 */
const RankingsContent: React.FC<RankingsContentProps> = ({ teamId, supabase, filters }) => {
  const { t } = useTranslation();

  const rankingsQuery = useTeamRankingsQuery(supabase, teamId, filters);
  const records = rankingsQuery.data;

  // 順位付与は shared の純粋関数に任せる (同着は同順位・次順位は件数分スキップ)。
  // RPC が ORDER BY time ASC で返した並びをそのまま渡す前提。
  const rows = useMemo<TeamRankingRow[]>(
    () => (records ? assignCompetitionRanks(records, (record) => record.time) : []),
    [records],
  );

  // 0件のときだけ「チームにそもそも記録が無いのか」を判定する
  // (絞り込み0件と文言を分けるためだけの補助クエリ)
  const isEmptyResult = rankingsQuery.isSuccess && rows.length === 0;

  // ⚠️ `teamCompetitions` のときだけこの判定を信用する。`hasAnyRecord` は RLS 下の
  // 素のクエリで、メンバーが別チームのチーム大会で出した記録 (`records.team_id` が
  // 他チーム) を数えられない。`allCompetitions` は SECURITY DEFINER の RPC が
  // その記録を返せるスコープなので、false を「記録が1件もない」と読むと嘘になる
  // (「チームに大会記録がありません」と出したのに種目を変えると記録が出る)。
  // 断定できない側は「条件に一致なし」に寄せる (web と同じ判定)。
  const canTrustHasAnyRecord = filters.scope === "teamCompetitions";
  const hasAnyRecordQuery = useTeamHasAnyRecordQuery(supabase, teamId, {
    enabled: isEmptyResult && canTrustHasAnyRecord,
  });

  const refetchRankings = rankingsQuery.refetch;
  const handleRetry = useCallback(() => {
    void refetchRankings();
  }, [refetchRankings]);

  // 件数は「取得が終わって成功し、1件以上あった」ときだけ出す。
  // 読み込み中やエラー中に「0件」を出すと「該当なし」という誤った事実を伝える
  // (web の TeamRankings.tsx が result-count に付けているガードと同型)
  const isBodySettled = !rankingsQuery.isLoading && !rankingsQuery.isError;
  const showResultCount = isBodySettled && rows.length > 0;
  // 取得上限に到達したら明示する。黙って切ると「自分の記録が無い」と読める。
  // `allRaces` 限定にはしない — 上限は**取得**の話で、`personalBest` でも
  // 到達したら同じことが起きる (到達しにくいだけ)。
  // ⚠️ これは RankingList の「さらに表示」(PAGE_SIZE 単位のクライアント側
  // 段階表示) とは別の話。あちらは手元にある行の出し方、こちらは
  // サーバーから取れていない行がある可能性の話なので混ぜない
  const isTruncated = isBodySettled && rows.length >= TEAM_RANKING_FETCH_LIMIT;

  const renderBody = () => {
    if (rankingsQuery.isLoading) {
      return <LoadingSpinner message={t("teams.ranking.loading")} />;
    }
    if (rankingsQuery.isError) {
      return (
        <RankingErrorView
          message={toUserFacingMessage(rankingsQuery.error, t("teams.ranking.error"))}
          onRetry={handleRetry}
        />
      );
    }
    return (
      <RankingList
        rows={rows}
        // 「まだ記録がない」と言い切れるのは
        //   (a) スコープが teamCompetitions で hasAnyRecord を信用できる かつ
        //   (b) 実際に false が返った
        // ときだけ。判定前 (読み込み中・失敗時) や allCompetitions では
        // 「条件に一致しない」側に寄せる
        emptyVariant={
          canTrustHasAnyRecord && hasAnyRecordQuery.data === false ? "noRecords" : "noMatch"
        }
      />
    );
  };

  return (
    <View style={styles.bodyContainer}>
      {showResultCount && (
        <View style={styles.metaRow}>
          <Text style={styles.resultCount}>
            {t("teams.ranking.resultCount", { count: rows.length })}
          </Text>
          {isTruncated && (
            <Text style={styles.metaNote}>
              {t("teams.ranking.truncatedNote", { limit: TEAM_RANKING_FETCH_LIMIT })}
            </Text>
          )}
        </View>
      )}
      {renderBody()}
    </View>
  );
};
export interface TeamRankingsProps {
  teamId: string;
  /**
   * 「WAポイントで比較」に渡すチームメンバー。
   * **親 (TeamDetailScreen) が持っている配列をそのまま渡す。** 中間で詰め替えると
   * `users.gender` が落ちて全員男性換算になる既知障害があるため、加工・フィルタ禁止。
   */
  members: TeamMembershipWithUser[];
}

/**
 * 個人種目のランキングが出せない理由。**「取得できなかった」と「1件も無かった」を
 * 分ける。**
 *
 * 束ねてはいけない理由はユーザーの次の行動が違うこと: 取得失敗なら再試行、
 * 空 (マスター未登録 / 全行が canonical 化不能) なら管理者に連絡するしかない。
 * `empty` に再試行ボタンを出すと「押しても直らないボタン」を押させ続ける。
 *
 * どちらの場合も**リレーのランキングは出せる** (`relay_records` は `styles` を
 * 引かない)。よってタブ全体をエラーにせず、通知を出したうえでリレーを使わせる。
 */
type IndividualUnavailability = "fetchFailed" | "empty";

/**
 * ランキングタブ。
 *
 * 種目/距離の選択肢は styles マスターの実データから導出するため、まず styles を
 * 取得する。ただし **styles が取れなくてもタブは死なない** —
 * `buildDefaultRankingFilterState` は個人種目が1つも解決できないとき
 * リレー (フリー / 100m×4) へフォールバックするので、種目チップはリレー2択だけに
 * なり、リレーランキングはそのまま使える。個人種目が出せないことは
 * `IndividualUnavailability` の通知バナーで伝える。
 *
 * ⚠️ **「取得中」と「取得できなかった」は必ず区別する。** `styleGroups` が空でも
 * 取得中ならまだ何も失敗していないため、`isPending` の間はローディングだけを出し、
 * この状態でリレーへ倒したり通知を出したりしてはいけない
 * (根拠は `buildDefaultRankingFilterState` の docstring)。
 */
export const TeamRankings: React.FC<TeamRankingsProps> = ({ teamId, members }) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [waPointsModalVisible, setWaPointsModalVisible] = useState(false);

  // styles は固定マスタ (アプリの稼働中に増減しない) なので長めにキャッシュする
  const stylesQuery = useQuery({
    queryKey: styleKeys.list(),
    queryFn: () => new StyleAPI(supabase).getStyles(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const styleGroups = useMemo<RankingStyleGroup[]>(
    () => buildRankingStyleGroups(stylesQuery.data ?? []),
    [stylesQuery.data],
  );
  // styles が空でも null にはならない (個人種目が作れなければリレーの既定になる)
  const defaultState = useMemo(
    () => buildDefaultRankingFilterState(styleGroups),
    [styleGroups],
  );

  // 期間の選択肢 (通算 + 直近5年度)。**この1本を要約と絞り込みシートの両方が読む。**
  // `buildRankingPeriodChoices()` は呼ぶたびに新しい配列を作り、しかも「現在の年度」を
  // 含むので、シート側で別に呼ぶと 3/31 23:59 → 4/1 00:00 を跨いだセッションで
  // 「要約が読む年度」と「チップに出ている年度」が食い違いうる (shared の
  // docstring が useMemo で包むよう指示しているのも同じ理由)
  const periodChoices = useMemo(() => buildRankingPeriodChoices(), []);

  // ユーザーが選んだ条件があればそれを、無ければ既定を使う。
  // ⚠️ 「state + useEffect で後から入れる」形にしてはいけない: effect はコミット後に
  // 走るので「styles は解決済み・条件はまだ null」という中間コミットが必ず1回発生し、
  // そのフレームだけ偽のエラー/空状態が描画される (第1弾で QA が MutationObserver で
  // タイミング非依存に再現した Critical)。web と同じく **レンダー中に導出**する。
  const [selectedState, setSelectedState] = useState<RankingFilterState | null>(null);
  const filterState = selectedState ?? defaultState;

  // 表示するランキングの種類と RPC の条件。**モードは state.event からのみ決まる**
  // ので、種目チップの選択と表の中身が食い違う組み合わせを作れない。
  const active = useMemo<{ state: RankingFilterState; target: RankingQueryTarget } | null>(() => {
    const requested = toRankingQueryTarget(styleGroups, filterState);
    if (requested) return { state: filterState, target: requested };

    // ユーザーが選んだ個人種目が今のマスターで成立しない = セッション中に styles が
    // 空になった (`styles` は authenticated に TRUNCATE 権限があり到達可能)。
    // 既定 state に倒す: 個人種目が消えていれば既定はリレーなのでタブは死なず、
    // 種目チップも「選択中の種目がどれでもない」状態にならない。
    const fallback = toRankingQueryTarget(styleGroups, defaultState);
    return fallback ? { state: defaultState, target: fallback } : null;
  }, [styleGroups, filterState, defaultState]);

  const handleApply = useCallback((next: RankingFilterState) => {
    setSelectedState(next);
    setFilterSheetVisible(false);
  }, []);

  const refetchStyles = stylesQuery.refetch;
  const handleStylesRetry = useCallback(() => {
    void refetchStyles();
  }, [refetchStyles]);

  // 絞り込みの要約。距離の表記は絞り込みシートのチップと同じ書式を使う
  // (`./rankingDistanceLabel.ts` が唯一の定義元)。要約とチップで表記が違うと、
  // ユーザーは要約を見て自分がどのチップを選んだのか照合できない。
  //
  // 種目は**1項目としてしか出さない**: 個人種目は距離と連結して `100m自由形`、
  // リレーは距離チップ (`100m × 4`) と種目 (`フリーリレー`) の2項目。
  // リレーの種類は種目そのものなので、これ以外の場所で `relay.kind.*` を
  // 足すと `フリーリレー` が二重に並ぶ。
  //
  // 出すのは**両モードに存在する軸だけ** (種目/距離・水路・性別・期間)。
  // 個人種目にしか無い軸 (対象・集計) は出さない — 第1弾から `scope` を要約に
  // 入れていないのと同じ扱いで、モードによって項目数が変わる1行にしないため。
  // それらの変更は絞り込みボタンのバッジ (shared の
  // `countActiveRankingFilterState` が唯一の定義元) が示す。
  const buildSummary = (state: RankingFilterState): string => {
    const choice = getRankingDistanceChoices(styleGroups, state.event, state.poolType).find(
      (candidate) => candidate.distance === state.distance,
    );
    // 選択肢から選ばれた値なので通常は必ず見つかる。見つからない場合
    // (マスターから距離が消えた等) はレグ数を捏造せず距離だけ出す
    const distanceLabel = rankingDistanceLabel(t, choice ?? {
      distance: state.distance,
      legCount: null,
    });
    const poolTypeLabel =
      state.poolType === 1 ? t("common.poolTypeLong") : t("common.poolTypeShort");

    const periodLabel = rankingPeriodLabel(t, state.period);

    if (state.event.mode === "relay") {
      return [
        distanceLabel,
        t(`teams.ranking.relay.kind.${state.event.relayKind}`),
        poolTypeLabel,
        t(`teams.ranking.relay.genderCategory.${state.genderCategory}`),
        periodLabel,
      ].join(" / ");
    }

    return [
      `${distanceLabel}${t(`practice.styles.${state.event.style}`)}`,
      poolTypeLabel,
      // 個人種目に mixed は無いので、表示も問い合わせと同じ正規化を通す
      t(`teams.ranking.gender.${toIndividualGender(state.genderCategory)}`),
      periodLabel,
      // 集計は **allRaces のときだけ**出す (個人種目にしか無い軸なので
      // リレー側の分岐には出さない)。理由:
      //   1. 既定の `各自のベスト` は「畳み込んでいない普通の順位表」という
      //      意味しかなく、伝える情報が無い。他4軸は既定でも「何を見ているか」
      //      の情報がある (100m なのか 50m なのか等)
      //   2. バッジと同じ原理 — 既定との差分だけを surface する。
      //      `countActiveRankingFilterState` が既定を数えないのと一貫する
      //   3. 幅の問題が自動的に回避される。長いのは既定側 (de の
      //      `Persönliche Bestzeit` 20字) で、出す側の `Alle Rennen` は 11字。
      //      条件付きにすると**表示されるのは短いラベルのときだけ**になる
      //
      // ⚠️ **`期間` は既定 (`通算`) でも常時表示のままにする。** 非対称に見えるが
      // 「いつの記録か」は既定でも情報がある (通算 = 全期間を見ている、と読める)
      // のに対し、`各自のベスト` は畳み込みが無いという不在の情報でしかない。
      // 揃えて常時表示にすると要約が5項目になり、2行でも溢れる
      // (実測: 4項目で 238dp / 利用可能幅 218dp)
      ...(state.aggregation === "allRaces"
        ? [t(`teams.ranking.aggregation.${state.aggregation}`)]
        : []),
    ].join(" / ");
  };

  // 本体 (絞り込みツールバー〜一覧) は styles マスターの取得状況で分岐する。
  // **「WAポイントで比較」はこの分岐の外側**に置く — WA ポイントは styles マスターを
  // 引かないので、読み込み中もエラー時も使えなければならない (早期 return の後ろに
  // 置くとその2状態でボタンが消える)
  const renderContent = () => {
    // 1. isPending を最初に見るので「取得中」がエラーやリレーへの縮退に落ちる経路が
    //    生まれない (偽エラー1フレームの Critical は構造的に再発しない)。
    //    ⚠️ この段より後ろで styleGroups の空を判定すること。取得中も空なので、
    //    順序を入れ替えると「読み込み中に個人種目が使えないと通知する」ことになる
    if (stylesQuery.isPending) {
      return <LoadingSpinner message={t("teams.ranking.loading")} />;
    }

    // 2. 個人種目が出せるか。取得失敗と空を分ける (再試行ボタンの有無が変わる)
    const individualUnavailability: IndividualUnavailability | null = stylesQuery.isError
      ? "fetchFailed"
      : styleGroups.length === 0
        ? "empty"
        : null;

    // 3. どちらのモードでも条件が組めない = 個人種目もリレーも軸が無い。
    //    リレーの軸は静的定義から決まるので実際には到達しないが、
    //    `toRankingQueryTarget` の null を非null断定で潰さないためのガード。
    //    ローディング扱いにすると stylesQuery は settled + staleTime 24時間 +
    //    再取得トリガー無しで **永久スピナー**になるため、エラー + 再試行に寄せる
    if (active === null) {
      // 生のエラー詳細は出さず汎用文言にフォールバックする
      return (
        <RankingErrorView
          message={toUserFacingMessage(stylesQuery.error, t("teams.ranking.error"))}
          onRetry={handleStylesRetry}
        />
      );
    }

    const activeFilterCount = countActiveRankingFilterState(active.state, defaultState);
    // 対象大会スコープは個人種目にしか無い軸なので、リレー表示中は注意書きも出さない
    // (state には残っているが、その条件では問い合わせていない)
    const showScopeNote =
      active.target.mode === "individual" && active.state.scope === "allCompetitions";
    // 年度指定時に competition_id が NULL の記録 (一括登録) が母集団から落ちることの
    // 説明。**出し分けの規則は shared の `shouldShowFiscalYearNote` が唯一の定義元**
    // (4状態の真理値表・teamCompetitions とリレーで出さない根拠・将来復活させる
    // 条件はすべてあちらの docstring にある。web も同じ関数を通る)。
    // 絞り込みシート側の note も同じ関数を通すので、シートを開いたときと閉じた
    // ときで言うことが変わらない。ここは**適用済み state**、シート側は draft を渡す
    const showFiscalYearNote = shouldShowFiscalYearNote(active.state);

    return (
      <>
        {/* 個人種目が使えないことの通知。**見出し直下・全幅**で、リレーに切り替えても
            出したままにする (今この画面で何が使えないかの説明であって、
            リレーの表示結果についての説明ではない。web の amber バナーと同じ位置)。
            配色と構造は既存の唯一の通知バナー `components/layout/OfflineBanner.tsx`
            (amber-100 / amber-300 / amber-800 + Feather アイコン) に合わせ、
            新しい通知表現を発明しない。文言は `accessibilityRole="alert"` を持つ
            Text に置く (`BestTimeEntryRow` / `BulkBestTimeScreen` と同じ形。
            RN に web の role="status" 相当は無い) */}
        {individualUnavailability !== null && (
          <View style={styles.notice}>
            <Feather name="alert-triangle" size={14} color="#92400E" />
            <View style={styles.noticeBody}>
              <Text style={styles.noticeText} accessibilityRole="alert">
                {t(`teams.ranking.individualUnavailable.${individualUnavailability}`)}
              </Text>
              {/* 再試行は取得失敗のときだけ。マスターが空の側に出すと
                  「押しても直らないボタン」になる */}
              {individualUnavailability === "fetchFailed" && (
                <Pressable
                  style={styles.noticeRetry}
                  onPress={handleStylesRetry}
                  accessibilityRole="button"
                  accessibilityLabel={t("teams.ranking.retry")}
                >
                  <Text style={styles.noticeRetryText}>{t("teams.ranking.retry")}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <View style={styles.toolbar}>
          {/* 画面上はタブ名 (ランキング) と重複するため見出しを別行に置かず、
              スクリーンリーダー向けのラベルとしてセクション名を付ける */}
          {/* 第2弾で期間が、追加要望で (allRaces のときだけ) 集計が加わり最大5項目に
              なった。1行だと 360dp では末尾が必ず省略されて読めない。
              **上限を3行にしてある**根拠 (幅 360dp / 要約に使える幅 218dp を
              5ロケールで実測):
                ja/ko/zh は最悪ケースでも 370〜400dp = 2行に収まる
                en/de は「2023年度以前 + 全レース」で 500dp / 539dp となり
                2行 (=436dp) では**末尾の集計が切れる** — QA が「気付けない」と
                指摘した情報がまさに落ちる
              `numberOfLines` は上限なので、収まるケースの高さは2行のままで
              変わらない (通常ケースは 232〜423dp = 2行) */}
          <Text
            style={styles.summary}
            numberOfLines={3}
            accessibilityLabel={`${t("teams.ranking.title")}: ${buildSummary(active.state)}`}
          >
            {buildSummary(active.state)}
          </Text>
          <Pressable
            style={styles.filterButton}
            onPress={() => setFilterSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t("common.listToolbar.filterButton")}
          >
            <Feather name="filter" size={14} color="#374151" />
            <Text style={styles.filterButtonText}>{t("common.listToolbar.filterButton")}</Text>
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* 「今どういう条件で問い合わせているか」の説明。**state だけで決まる**ので
            本体 (取得結果に依存する件数・切り詰め注記) とは別にここへ置く。
            年度は両モードに出る軸なので、本体側に置くと個人種目とリレーの2箇所に
            同じ JSX を複製することになる (第3弾でツールバーと要約を親へ寄せたのと
            同じ理屈)。
            読み込み中でもエラー中でも出す — 「該当なし」のような事実を語らないため
            抑止する理由が無い (第1弾で scope 注意書きについて確定した規則)。
            ⚠️ 色は既存の scope 注意書きと同じ **素の amber テキスト**。
            `individualUnavailable` の琥珀バナー (背景色付き) は異常の通知専用で、
            こちらは正常な仕様の説明なので同じ見た目にしない */}
        {(showScopeNote || showFiscalYearNote) && (
          <View style={styles.metaRow}>
            {showScopeNote && (
              <Text style={styles.metaNote}>{t("teams.ranking.scope.allCompetitionsNote")}</Text>
            )}
            {showFiscalYearNote && (
              <Text style={styles.metaNote}>{t("teams.ranking.period.fiscalYearNote")}</Text>
            )}
          </View>
        )}

        {/* 本体は残りの高さを埋める。ここに flex:1 を置かないと中の FlatList の
            高さが 0 になり、行が描画されているのに何も見えない状態になる */}
        <View style={styles.viewBody}>
          {active.target.mode === "relay" ? (
            <TeamRelayRankings teamId={teamId} filters={active.target.filters} />
          ) : (
            <RankingsContent teamId={teamId} supabase={supabase} filters={active.target.filters} />
          )}
        </View>

        <RankingFilterSheet
          visible={filterSheetVisible}
          onClose={() => setFilterSheetVisible(false)}
          filterState={active.state}
          styleGroups={styleGroups}
          periodChoices={periodChoices}
          onApply={handleApply}
        />
      </>
    );
  };

  return (
    <View style={styles.container}>
      {/* メンバータブから移設。個人種目/リレーのどちらを表示していても常に見える
          よう本体の外・最上段に置く (ランキングにサブタブは作らない)。
          ツールバー行には入れない — あの行は「絞り込み」だけを持つ */}
      <View style={styles.waPointsRow}>
        <Pressable
          style={styles.waPointsButton}
          onPress={() => setWaPointsModalVisible(true)}
          accessibilityRole="button"
        >
          <Feather name="award" size={13} color="#2563EB" />
          <Text style={styles.waPointsButtonText}>
            {t("teams.waPointsCompare.buttonLabel")}
          </Text>
        </Pressable>
        <WaPointsInfoTooltip testID="team-rankings-wa-info" />
      </View>

      {renderContent()}

      {/* members は親の配列をそのまま渡す (詰め替え禁止。props の docstring 参照) */}
      <WaPointsCompareModal
        visible={waPointsModalVisible}
        onClose={() => setWaPointsModalVisible(false)}
        members={members}
        supabase={supabase}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  viewBody: {
    flex: 1,
  },
  // メンバータブ (TeamMemberList の waPointsButtonWrapper) と同じ「行ラッパーで横並び」。
  // 見た目を移設前から変えない
  waPointsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  waPointsButton: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  waPointsButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2563EB",
  },
  bodyContainer: {
    flex: 1,
  },
  // 配色は OfflineBanner (mobile で唯一の通知バナー) と同一。
  // 上端に出す OfflineBanner と違ってノッチを避ける必要がないので inset は持たない
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FEF3C7",
    borderBottomWidth: 1,
    borderBottomColor: "#FCD34D",
  },
  noticeBody: {
    flex: 1,
    gap: 6,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#92400E",
    fontWeight: "500",
  },
  noticeRetry: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FCD34D",
    backgroundColor: "#FFFFFF",
  },
  noticeRetryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  summary: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  filterBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
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
  // 条件の説明 (対象大会スコープ / 年度) と取得上限の注記で共有する注記スタイル。
  // 背景色を持たない素のテキストで、`notice` (琥珀バナー = 異常の通知) とは
  // 意図的に見た目を分けている
  metaNote: {
    fontSize: 12,
    color: "#B45309",
    lineHeight: 18,
  },
});
