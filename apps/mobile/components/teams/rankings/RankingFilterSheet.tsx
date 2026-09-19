// =============================================================================
// RankingFilterSheet - チームランキングの絞り込みシート (個人種目 / リレー共通)
// =============================================================================
//
// 下端シートは `components/history/BottomSheet.tsx` (汎用ボトムシート。
// SortBottomSheet / FilterBottomSheet の土台であり、履歴タブの絞り込みと同じ
// 見た目・同じジェスチャー) を再利用する。maxHeight / sticky フッター /
// Android edge-to-edge の bottom inset は BottomSheet 側で解決済みのため、
// ここでシート構造を組み直さない。
//
// ドラフト/適用方式: チップ操作はローカルの draft のみを更新し、「適用」を
// 押したときだけ親へコミットする (FilterBottomSheet と同じ契約)。
//
// **シートは個人種目とリレーで1つ。** 種目グループが 個人5種目 + リレー2種類 の
// 7択で、選択そのものがモードを決めるため (`RankingEventSelection` の docstring)、
// リレー専用シートは存在しない。モードで変わるのは
//   - 距離の選択肢集合 (styles マスター由来 / RELAY_EVENTS 由来)
//   - 性別 (男子・女子 / 男子・女子・混合)
//   - 集計モードと対象大会スコープ (個人種目にしか無い)
// だけで、いずれも `@apps/shared/utils/rankingEventAxis` が定義元。
//
// グループの並びは **比べる対象を大きい括りから絞る順 → 母集団と表示の設定**:
//   期間 / 性別 / 水路 / 種目 / 距離  … 「2026年度の男子 長水路 自由形 50m」と
//                                       読める順。大きい括り → 細かい括り
//   対象                              … どの記録を母集団に入れるか
//   集計                              … 母集団は変えず、表示の畳み込み方を変える
// 個人種目にしか無い2つ (対象・集計) を末尾に隣接させているのは、モードを
// 切り替えたときにグループが**リストの途中から消えない**ようにするため。
// この順序は web (`RankingFilters.tsx`) と一致させること (パリティ監査で
// 差分として上がり続けるため)。
//
// FilterBottomSheet 自体を使わない理由: あちらは「未選択 = すべて」の
// 多値/単一選択フィルタ用で、選択中チップの再タップで未選択に戻せる。
// ランキングの種目 / 距離 / 水路は未選択という状態を取れない (必ず1つ選ぶ)
// ため、意味が合わない。

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import type {
  PoolType,
  RankingAggregation,
  RankingEventValue,
  RankingGenderFilter,
  RankingPeriodValue,
  RankingScope,
  RelayRankingGenderFilter,
} from "@apps/shared/types";
import {
  RANKING_INDIVIDUAL_EVENT_CHOICES,
  RANKING_RELAY_EVENT_CHOICES,
  getRankingDistanceChoices,
  parseRankingEventValue,
  parseRankingPeriodValue,
  resolvePoolTypeChange,
  resolveRankingEventChange,
  shouldShowFiscalYearNote,
  toIndividualGender,
  toRankingEventValue,
  toRankingPeriodValue,
  type RankingFilterState,
  type RankingPeriodChoice,
} from "@apps/shared/utils/rankingEventAxis";
import {
  RANKING_AGGREGATION_VALUES,
  RANKING_GENDER_VALUES,
  RANKING_POOL_TYPE_VALUES,
  RANKING_SCOPE_VALUES,
  type RankingStyleGroup,
} from "@apps/shared/utils/rankingStyleAxis";
import {
  RELAY_RANKING_GENDER_VALUES,
  RELAY_RANKING_POOL_TYPE_VALUES,
} from "@apps/shared/utils/relayRankingAxis";
import { BottomSheet } from "@/components/history";
import { ChipGroup, type ChipOption } from "./ChipGroup";
import { rankingDistanceLabel, rankingPeriodLabel } from "./rankingLabels";

export interface RankingFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  /** 適用中の条件。シートを開いた時点のドラフト初期値になる */
  filterState: RankingFilterState;
  /** styles マスターから導出した種目/距離の選択肢 */
  styleGroups: RankingStyleGroup[];
  /**
   * 期間の選択肢 (通算 + 直近5年度)。**親から受け取る。**
   *
   * `buildRankingPeriodChoices()` は呼ぶたびに新しい配列を作り、しかも
   * 「現在の年度」を含むので、ここで呼ぶと要約 (親) とチップ (ここ) が
   * セッションを跨いだ年度切り替えの瞬間に食い違いうる。**同じ配列を親から
   * 配り**、`parseRankingPeriodValue` にも同じものを渡す。
   */
  periodChoices: readonly RankingPeriodChoice[];
  /** 「適用」押下時に親へコミットする (シートを閉じるのは親の責務) */
  onApply: (next: RankingFilterState) => void;
}

export const RankingFilterSheet: React.FC<RankingFilterSheetProps> = ({
  visible,
  onClose,
  filterState,
  styleGroups,
  periodChoices,
  onApply,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<RankingFilterState>(filterState);

  // シートが開かれた瞬間だけ、適用中の条件でドラフトを作り直す
  // (開いている最中に親が再レンダーしてもドラフトを巻き戻さない)
  const prevVisibleRef = useRef(visible);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setDraft(filterState);
    }
    prevVisibleRef.current = visible;
  }, [visible, filterState]);

  const isIndividual = draft.event.mode === "individual";

  /**
   * 種目チップの選択肢。**1つの ChipGroup (= 1つの radiogroup) に7択を渡し、
   * リレーの先頭に `startsNewRow` を立てて視覚的に2行**にする。
   * ChipGroup を2つに割ると radiogroup が2つになり、「7択のうち1つ」という
   * 排他選択の意味論が支援技術に伝わらない。
   *
   * 行の境目は shared の `RANKING_INDIVIDUAL_EVENT_CHOICES` /
   * `RANKING_RELAY_EVENT_CHOICES` の2本の配列そのもの (= 定義元が示す割り方) に
   * 従う。連結順は `RANKING_EVENT_CHOICES` と同じなので、種目が増えても
   * 「何番目で改行するか」を数え直す必要がない。
   *
   * 個人種目は **その水路で選べる距離が1つも無いものを出さない** (押しても
   * 何も起きないチップを作らないため。`RANKING_INDIVIDUAL_EVENT_CHOICES` は
   * canonical な5種目をマスター非依存で並べた配列なので、実在判定は UI 側で
   * 距離の選択肢と突き合わせる)。リレーの距離は静的定義から必ず得られるので
   * 同じ突き合わせをしても常に全件通る。
   *
   * ⚠️ 突き合わせには **draft の水路**を渡す。長水路では 25m が落ちるので
   * 「25m しか無い種目」はその水路で選べない = `resolveRankingEventChange` が
   * null を返して**押しても何も起きないチップ**になる。水路を無視して
   * 判定すると、まさにそのチップを出してしまう。
   */
  const eventOptions = useMemo<ChipOption<RankingEventValue>[]>(() => {
    const individual = RANKING_INDIVIDUAL_EVENT_CHOICES.filter(
      (choice) =>
        getRankingDistanceChoices(styleGroups, choice.selection, draft.poolType).length > 0,
    ).map<ChipOption<RankingEventValue>>((choice) => ({
      value: choice.value,
      label: t(`practice.styles.${choice.selection.style}`),
    }));

    const relay = RANKING_RELAY_EVENT_CHOICES.map<ChipOption<RankingEventValue>>(
      (choice, index) => ({
        value: choice.value,
        label: t(`teams.ranking.relay.kind.${choice.selection.relayKind}`),
        // リレーの先頭だけ改行する。個人種目が1つも無い (マスター異常) 場合は
        // これが唯一の行になり、空行にはならない (ChipGroup 側で先頭の
        // startsNewRow は行を1本作るだけ)
        startsNewRow: index === 0,
      }),
    );

    return [...individual, ...relay];
  }, [styleGroups, draft.poolType, t]);

  // 距離の選択肢は **種目 × 水路**で決まる (長水路では 25m が落ちる)。
  // draft の水路を渡すので、シート内で水路を変えた瞬間にチップが入れ替わる
  const distanceChoices = getRankingDistanceChoices(styleGroups, draft.event, draft.poolType);

  const handleEventSelect = useCallback(
    (value: RankingEventValue) => {
      // `"relay:"` 接頭辞のパースは shared の1箇所だけが持つ。
      // ここで自前に文字列を切ると、種目が増えたときに mobile だけ古くなる
      const selection = parseRankingEventValue(value);
      if (!selection) return;
      setDraft((prev) => {
        // 距離と性別はモードで選択肢集合が変わるので、引き継ぎ規則
        // (同値が選べるなら維持・無ければそのモードの既定) を shared に委譲する。
        // web と同じ関数を通すので「同じ条件なのに違うランキング」にならない
        const next = resolveRankingEventChange(styleGroups, prev, selection);
        return next ?? prev;
      });
    },
    [styleGroups],
  );

  const handleDistanceSelect = useCallback((distance: number) => {
    setDraft((prev) => ({ ...prev, distance }));
  }, []);

  const handlePoolTypeSelect = useCallback(
    (poolType: PoolType) => {
      // 🚨 水路を変えると距離の選択肢が変わる (長水路に 25m は無い)。
      // **draft の距離も正規化して書き戻す** — 表示だけ入れ替えると
      // 「選べない距離が選択状態で残る」= どのチップも選択に見えない状態を作り、
      // そのまま適用するとクエリ条件と画面の条件が食い違う。
      // 丸め方 (選べるなら維持・無ければ最短・その水路で距離を持たない種目なら
      // 種目ごと既定へ) は shared が唯一の定義元で、web も同じ関数を通る。
      //
      // ⚠️ 早期 return もフォールバックも置かない: `resolvePoolTypeChange` は
      // **必ず新しい state を返す** (距離が丸められないときは種目ごと既定へ倒す)。
      // 見送ると水路チップが押しても何も起きない行き止まりになる。
      // `?? prev` を足すと「null を返しうる関数」だと誤読され、shared を
      // nullable に戻す変更が「呼び出し側は対応済み」として通ってしまう
      setDraft((prev) => resolvePoolTypeChange(styleGroups, prev, poolType));
    },
    [styleGroups],
  );

  // 個人種目の性別 (male | female) はリレーの性別区分の部分集合なので、
  // 両モードのチップが同じハンドラを共有できる。state 側はリレーの語彙で保持し、
  // 個人へ切り替えたときの mixed の落とし先は shared の toIndividualGender が決める
  const handleGenderSelect = useCallback((genderCategory: RelayRankingGenderFilter) => {
    setDraft((prev) => ({ ...prev, genderCategory }));
  }, []);

  const handlePeriodSelect = useCallback(
    (value: RankingPeriodValue) => {
      // `"fy:"` 接頭辞のパースは shared の1箇所だけが持つ。**画面に出している
      // choices をそのまま渡す**ので、選択肢に無い年度が state に入る経路が無い
      const period = parseRankingPeriodValue(value, periodChoices);
      if (!period) return;
      setDraft((prev) => ({ ...prev, period }));
    },
    [periodChoices],
  );

  const handleAggregationSelect = useCallback((aggregation: RankingAggregation) => {
    setDraft((prev) => ({ ...prev, aggregation }));
  }, []);

  const handleScopeSelect = useCallback((scope: RankingScope) => {
    setDraft((prev) => ({ ...prev, scope }));
  }, []);

  const handleApply = useCallback(() => {
    onApply(draft);
  }, [draft, onApply]);

  const poolTypeLabel = (poolType: PoolType): string =>
    poolType === 1 ? t("common.poolTypeLong") : t("common.poolTypeShort");

  return (
    <BottomSheet
      isOpen={visible}
      onClose={onClose}
      // 履歴タブの絞り込みシート (competition/practice.filterSheet.title = 「絞り込み」)
      // と同じ見出しにする。common 側に同じ文言のキーがあるので新規キーは作らない
      title={t("common.listToolbar.filterButton")}
      footer={
        <View style={styles.footerRow}>
          <Pressable
            style={[styles.footerButton, styles.footerButtonOutline]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <Text style={styles.footerButtonOutlineText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable
            style={[styles.footerButton, styles.footerButtonPrimary]}
            onPress={handleApply}
            accessibilityRole="button"
          >
            <Text style={styles.footerButtonPrimaryText}>
              {t("common.bottomSheet.apply")}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.groupsContainer}>
        {/* 期間は**両モードに出る**軸 (両 RPC が p_fiscal_year を持つ)。
            選択肢は静的な5択「通算 / 現年度 / -1 / -2 / -3年度以前」で、
            記録が0件の年度も出る (データから存在する年度を導出するには
            専用 RPC = migration が必要。根拠は types/teamRanking.ts の契約)。

            ⚠️ mobile は**チップのまま**でプルダウンにしない (PM 裁定)。
            絞り込みは BottomSheet なので、その上に Modal を重ねる構造は
            練習ログの「新しいタグを作成」で無反応になった事故と同型
            (RN の onDismiss が空イベントで発生源を識別できない)。
            5択のために同じ構造を作らない。**選択肢の内容は web と一致** */}
        <ChipGroup<RankingPeriodValue>
          label={t("teams.ranking.filter.period")}
          options={periodChoices.map((choice) => ({
            value: choice.value,
            label: rankingPeriodLabel(t, choice.period),
          }))}
          selectedValue={toRankingPeriodValue(draft.period)}
          onSelect={handlePeriodSelect}
          // 年度を選ぶと大会に紐づかない記録 (一括登録) が母集団から落ちることの
          // 説明 (対象大会スコープの注意書きと同じ形。異常通知の琥珀バナーは
          // 使わない)。**出し分けの規則 (4状態・リレーで出さない根拠・将来
          // 復活させる条件) は shared の `shouldShowFiscalYearNote` が唯一の
          // 定義元**で、web も本体上部の注記も同じ関数を通す。ここに条件を
          // 書き足さないこと。
          // ⚠️ ここに渡すのは **draft**。適用済み state を渡すと、シートで
          // スコープや期間を変えた瞬間に note が手元の選択とずれる
          note={
            shouldShowFiscalYearNote(draft)
              ? t("teams.ranking.period.fiscalYearNote")
              : undefined
          }
        />
        {isIndividual ? (
          <ChipGroup<RankingGenderFilter>
            label={t("teams.ranking.filter.gender")}
            options={RANKING_GENDER_VALUES.map((gender) => ({
              value: gender,
              label: t(`teams.ranking.gender.${gender}`),
            }))}
            // state はリレーの語彙で持つので、個人種目のチップに写すときは
            // 必ず toIndividualGender を通す (mixed が選択なしに見える状態を作らない)
            selectedValue={toIndividualGender(draft.genderCategory)}
            onSelect={handleGenderSelect}
          />
        ) : (
          <ChipGroup<RelayRankingGenderFilter>
            label={t("teams.ranking.relay.filter.genderCategory")}
            options={RELAY_RANKING_GENDER_VALUES.map((category) => ({
              value: category,
              label: t(`teams.ranking.relay.genderCategory.${category}`),
            }))}
            selectedValue={draft.genderCategory}
            onSelect={handleGenderSelect}
          />
        )}
        <ChipGroup<PoolType>
          label={t("teams.ranking.filter.poolType")}
          // 中身は両モードで同じ [0, 1] だが、参照するモードの定数を読む
          // (片方の並びが変わったときにリレー側だけ個人種目の並びを引き続ける
          //  ということが起きないように)
          options={(isIndividual
            ? RANKING_POOL_TYPE_VALUES
            : RELAY_RANKING_POOL_TYPE_VALUES
          ).map((poolType) => ({
            value: poolType,
            label: poolTypeLabel(poolType),
          }))}
          selectedValue={draft.poolType}
          onSelect={handlePoolTypeSelect}
        />
        {eventOptions.length > 0 && (
          <ChipGroup<RankingEventValue>
            label={t("teams.ranking.filter.style")}
            options={eventOptions}
            selectedValue={toRankingEventValue(draft.event)}
            onSelect={handleEventSelect}
          />
        )}
        {distanceChoices.length > 0 && (
          <ChipGroup<number>
            // 見出しは個人種目とリレーで共通の「距離」(`filter.distance`) を使う。
            // 1つのグループなのでリレー専用の同義キーは引かない
            label={t("teams.ranking.filter.distance")}
            options={distanceChoices.map((choice) => ({
              value: choice.distance,
              label: rankingDistanceLabel(t, choice),
            }))}
            selectedValue={draft.distance}
            onSelect={handleDistanceSelect}
          />
        )}
        {/* 対象大会スコープは個人種目にしか無い軸。リレー表示中は出さないが
            state 上は保持され、個人種目に戻すと選択が復元される
            (根拠は RankingFilterState.scope の docstring) */}
        {isIndividual && (
          <ChipGroup<RankingScope>
            label={t("teams.ranking.filter.scope")}
            options={RANKING_SCOPE_VALUES.map((scope) => ({
              value: scope,
              label: t(`teams.ranking.scope.${scope}`),
            }))}
            selectedValue={draft.scope}
            onSelect={handleScopeSelect}
            // 他チームの大会の記録まで含める意図的な露出拡大なので、
            // 選択中は必ず注意書きを出す
            note={
              draft.scope === "allCompetitions"
                ? t("teams.ranking.scope.allCompetitionsNote")
                : undefined
            }
          />
        )}
        {/* 集計モードは**個人種目にしか無い**軸。リレー RPC は7引数で
            p_aggregation を持たない (「1チーム1行に畳み込む単位が無い」ため
            意図的)。scope と同じ扱いで、リレー表示中は出さないが state には残す。

            ⚠️ **必ず `対象` の後ろ (グループの最後) に置く。**
            `対象` は母集団を絞る軸 (どの大会の記録か) で、`集計` だけが
            **母集団を変えず表示の畳み込み方を変える軸** (1人1行 か 全レース)。
            畳み込み方は最後に置く。
            web (`apps/web/components/team/rankings/RankingFilters.tsx`) も
            同じ順序。**順序が食い違うと web↔mobile のパリティ監査で毎回
            差分として上がり続ける**ので入れ替えないこと */}
        {isIndividual && (
          <ChipGroup<RankingAggregation>
            label={t("teams.ranking.filter.aggregation")}
            options={RANKING_AGGREGATION_VALUES.map((aggregation) => ({
              value: aggregation,
              label: t(`teams.ranking.aggregation.${aggregation}`),
            }))}
            selectedValue={draft.aggregation}
            onSelect={handleAggregationSelect}
          />
        )}
      </View>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  groupsContainer: {
    gap: 20,
  },
  footerRow: {
    flexDirection: "row",
    gap: 12,
  },
  footerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  footerButtonOutline: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  footerButtonOutlineText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  footerButtonPrimary: {
    backgroundColor: "#2563EB",
  },
  footerButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
