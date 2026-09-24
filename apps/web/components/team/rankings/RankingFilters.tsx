"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { isPoolType } from "@apps/shared/types";
import FilterRadioGroup, {
  FILTER_LEGEND_CLASS,
  type FilterRadioOption,
} from "./FilterRadioGroup";
import { COMPACT_SELECT_CLASS } from "@/components/ui/selectStyles";
import {
  RANKING_AGGREGATION_VALUES,
  RANKING_GENDER_VALUES,
  RANKING_POOL_TYPE_VALUES,
  RANKING_SCOPE_VALUES,
  type RankingStyleGroup,
} from "@apps/shared/utils/rankingStyleAxis";
import { RELAY_RANKING_GENDER_VALUES } from "@apps/shared/utils/relayRankingAxis";
import {
  RANKING_INDIVIDUAL_EVENT_CHOICES,
  RANKING_RELAY_EVENT_CHOICES,
  buildRankingPeriodChoices,
  getRankingDistanceChoices,
  parseRankingEventValue,
  parseRankingPeriodValue,
  resolvePoolTypeChange,
  resolveRankingEventChange,
  toIndividualGender,
  toRankingEventValue,
  toRankingPeriodValue,
  type RankingFilterState,
} from "@apps/shared/utils/rankingEventAxis";

interface RankingFiltersProps {
  /** styles テーブルから導出した種目 × 距離の選択肢 (`buildRankingStyleGroups`) */
  groups: readonly RankingStyleGroup[];
  state: RankingFilterState;
  onChange: (state: RankingFilterState) => void;
}

/**
 * ランキングの絞り込み UI。**個人種目とリレーで1つのコンポーネント**。
 *
 * 種目グループに 個人5種目 + リレー2種類 の7択が並び、選んだ種目が
 * 個人かリレーかでランキングの種類が決まる (「個人種目 / リレー」のビュー切替
 * トグルは持たない)。モードで変わるのは
 *   - 距離の選択肢 (個人は styles マスター由来 / リレーは 25m×4 形式。
 *     **どちらも水路に依存し、長水路では 25m が落ちる**)
 *   - 性別の選択肢 (個人は 男子・女子 / リレーは 男子・女子・混合)
 *   - 対象大会スコープ・集計モードの有無 (個人のみ)
 * だけで、それ以外は同じグループを同じ順で出す。
 *
 * **グループの並びは「両モードに出る軸 → 個人限定の軸」。** リレーを選ぶと
 * 末尾2グループ (対象 / 集計) が落ちるだけで、上5グループの位置は動かない。
 * 個人限定の軸を間に挟むとモード切替のたびに下のグループが上下する。
 *
 * ⚠️ **集計モードがリレーに無いのは RPC が7引数で `p_aggregation` を持たない
 * ため**で、UI の都合ではない (根拠は `types/teamRanking.ts` の第2弾の契約)。
 *
 * 🚨 **種目グループは `<fieldset>` 1つ / `name` 1つで、視覚的にだけ2行に割る。**
 * 個人とリレーで fieldset を分けると radio group が2つになり、矢印キーで7択を
 * 跨げなくなって「1つの選択」という意味論が壊れる。行の分割は
 * `FilterRadioGroup` の `optionRows` (行ごとの `flex flex-wrap`) で行う。
 *
 * 選択肢の配列・既定値・モードをまたぐ引き継ぎ規則はすべて
 * `@apps/shared/utils/rankingEventAxis` (と、それが委譲する
 * `rankingStyleAxis` / `relayRankingAxis`) が定義元。mobile も同じ関数を読むので、
 * ここに独自の配列やパースを持たない。
 */
export default function RankingFilters({ groups, state, onChange }: RankingFiltersProps) {
  const t = useTranslations("teams.ranking");
  const tPractice = useTranslations("practice");
  const tCommon = useTranslations("common");

  const isIndividual = state.event.mode === "individual";
  // 🚨 距離の選択肢は**水路に依存する** (長水路では 25m が実施不可で落ちる)。
  // `state.poolType` を渡し忘れると、長水路で 25m のピルが出る。
  const distanceChoices = getRankingDistanceChoices(groups, state.event, state.poolType);

  // 年度の選択肢は「今が何年度か」に依存する。**マウント時に1回だけ確定させる**
  // ([] 依存)。毎レンダーで作り直すと配列の identity が変わり、逆引きに渡す配列と
  // 表示中の配列が別インスタンスになる余地を作る。
  // 日付を跨いで開いたままのタブでは前年度の一覧が残るが、選択肢と逆引きが
  // 同じ配列を見ている限り画面とクエリは一致する (リロードで最新化される)。
  const periodChoices = useMemo(() => buildRankingPeriodChoices(), []);

  // radio の value は string なので、選択肢の実データと突き合わせて確定させる。
  // `as SwimStyle` のようなキャストは使わない (検証を迂回するため)。
  const handleEventChange = (value: string) => {
    const next = parseRankingEventValue(value);
    if (!next) return;
    const nextState = resolveRankingEventChange(groups, state, next);
    if (!nextState) return;
    onChange(nextState);
  };

  const handleDistanceChange = (value: string) => {
    const next = distanceChoices.find((choice) => String(choice.distance) === value);
    if (!next) return;
    onChange({ ...state, distance: next.distance });
  };

  const handlePoolTypeChange = (value: string) => {
    const parsed = Number(value);
    if (!isPoolType(parsed)) return;
    // 🚨 `{ ...state, poolType }` で済ませないこと。長水路では 25m が選択肢から
    // 消えるので、短水路で 25m を選んだまま切り替えると**選べない距離が選択状態で
    // 残る**。`resolvePoolTypeChange` が距離 (必要なら種目ごと) を正規化して
    // state に書き戻す。**必ず切り替わる**ので早期 return は無い
    // (見送ると水路ピルが押しても何も起きない行き止まりになる)。
    onChange(resolvePoolTypeChange(groups, state, parsed));
  };

  const handleGenderChange = (value: string) => {
    // 個人種目は mixed を選択肢に出さないので、そのモードの選択肢集合で検証する
    // (個人の表に mixed が入る経路を作らない)。
    //
    // ⚠️ これは今のところ**実行時の防御ではなく string → union の絞り込み**である。
    // 根拠は `FilterRadioGroup.tsx` の `onChange={() => onChange(option.value)}` が
    // **イベントを一度も読まず** option ごとのクロージャで value を渡していること。
    // DOM の `input.value` に何を注入されても届かないので、この `find` が undefined を
    // 返す状態は作れない。**`onChange={(e) => onChange(e.target.value)}` という定石に
    // 書き換えるとこの前提は崩れ、ここは本物の実行時防御に戻る** (その変更は通常操作では
    // 観測差ゼロなので全テスト緑のまま通る)。
    // 「不整合な state を作れない」ことの実際の担保は `resolveRankingEventChange`
    // (切替時の正規化) と `toRankingQueryTarget` (RPC 条件の再正規化) の2つ。
    // ここを「到達しないなら消せる」と判断しないこと — 消すと `as` キャストが必要になり、
    // かつ上記の書き換えが入ったときリレーの `p_gender_category` が NULL で飛ぶ
    // (RPC の「すべての性別区分」分岐に UI から到達し、男女混合の順位表が無言で出る)。
    const allowed = isIndividual ? RANKING_GENDER_VALUES : RELAY_RANKING_GENDER_VALUES;
    const next = allowed.find((category) => category === value);
    if (!next) return;
    onChange({ ...state, genderCategory: next });
  };

  const handleScopeChange = (value: string) => {
    const next = RANKING_SCOPE_VALUES.find((scope) => scope === value);
    if (!next) return;
    onChange({ ...state, scope: next });
  };

  const handlePeriodChange = (value: string) => {
    // **画面に出している配列そのもの**を逆引きに渡す。`new Date()` から選択肢を
    // 組み直すと、セッション中に年度が切り替わった瞬間だけ食い違う。
    //
    // 🚨 ここは `<select>` = `event.target.value` を**実際に読む**ので、
    // この allowlist は**本物の実行時防御**である。
    // ⚠️ 下の `handleGenderChange` に「あちらの allowlist は実行時防御ではなく
    // string → union の絞り込みである」という注記があるが、**混同しないこと**。
    // あちらはラジオで option ごとのクロージャが value を渡すため DOM への注入が
    // 届かない。こちらは届く。未知の value を弾かないと `period` に undefined が
    // 入り、`toRankingPeriodValue` が読む `kind` で落ちる。
    const next = parseRankingPeriodValue(value, periodChoices);
    if (!next) return;
    onChange({ ...state, period: next });
  };

  const handleAggregationChange = (value: string) => {
    const next = RANKING_AGGREGATION_VALUES.find((aggregation) => aggregation === value);
    if (!next) return;
    onChange({ ...state, aggregation: next });
  };

  // 個人種目のピルは canonical な並び (`SWIM_STYLES` 順) で出しつつ、
  // **今の水路で選べる距離が1つも無い種目は落とす** (押しても何も起きないピルを
  // 作らないため)。
  //
  // 🚨 実在判定は `getRankingDistanceChoices` を通すこと。`groups.some(...)` で
  // 「マスターにその種目があるか」だけを見ると水路の制約が抜ける:
  // 25m しか持たない種目があると長水路 (既定) でピルが描かれ、押しても
  // `resolveRankingEventChange` が null を返して**何も起きない**
  // (フィードバックも無い)。ピルを出す条件と押せる条件は同じ関数から導く。
  // mobile の絞り込みシートも同じ判定を使っている。
  //
  // ⚠️ styles マスターがまるごと取れていない場合ここは 0 件になり、種目グループは
  // **リレー2択だけ**になる。リレーは styles に依存しないのでそれで成立する
  // (根拠は `buildDefaultRankingFilterState` の docstring)。
  const individualEventOptions: FilterRadioOption[] = RANKING_INDIVIDUAL_EVENT_CHOICES.filter(
    (choice) => getRankingDistanceChoices(groups, choice.selection, state.poolType).length > 0,
  ).map((choice) => ({
    value: choice.value,
    label: tPractice(`styles.${choice.selection.style}`),
  }));

  // リレーのラベルは既存の `relay.kind.*` (「フリーリレー」「メドレーリレー」) を
  // 再利用する。種目グループ専用のキーを新設しない。
  const relayEventOptions: FilterRadioOption[] = RANKING_RELAY_EVENT_CHOICES.map((choice) => ({
    value: choice.value,
    label: t(`relay.kind.${choice.selection.relayKind}`),
  }));

  // 距離ラベル: 個人は `100m`、リレーは `100m × 4`。
  // **`× 4` をここに書かない** — レグ数は `getRankingDistanceChoices` が
  // RELAY_EVENTS から導出して返す (`relay_records.leg_count` は 2〜8 を許す)。
  const distanceOptions: FilterRadioOption[] = distanceChoices.map((choice) => ({
    value: String(choice.distance),
    label:
      choice.legCount === null
        ? `${choice.distance}m`
        : t("relay.legDistanceOption", {
            distance: choice.distance,
            legCount: choice.legCount,
          }),
  }));

  const poolTypeOptions: FilterRadioOption[] = RANKING_POOL_TYPE_VALUES.map((value) => ({
    value: String(value),
    label: value === 1 ? tCommon("poolTypeLong") : tCommon("poolTypeShort"),
  }));

  // 個人種目は 男子/女子、リレーは 男子/女子/混合。ラベルのキーも別
  // (「性別」と「性別区分」で語彙が違う)。
  const genderOptions: FilterRadioOption[] = isIndividual
    ? RANKING_GENDER_VALUES.map((value) => ({ value, label: t(`gender.${value}`) }))
    : RELAY_RANKING_GENDER_VALUES.map((value) => ({
        value,
        label: t(`relay.genderCategory.${value}`),
      }));

  const scopeOptions: FilterRadioOption[] = RANKING_SCOPE_VALUES.map((value) => ({
    value,
    label: t(`scope.${value}`),
  }));

  // 通算 + 直近 N 年度。**年度リストをここに持たない** — 本数の定義元は
  // `RANKING_EXPLICIT_FISCAL_YEAR_COUNT`、年度の算出は `resolveFiscalYear` (4/1 基準)。
  // 通算 / 明示年度 / 「N年度以前」の3種類。**年度リストをここに持たない** —
  // 本数の定義元は `RANKING_EXPLICIT_FISCAL_YEAR_COUNT`、年度の算出は
  // `resolveFiscalYear` (4/1 基準)、以前バケットの上端は
  // `buildRankingPeriodChoices` が決める。
  const periodOptions: FilterRadioOption[] = periodChoices.map((choice) => ({
    value: choice.value,
    label:
      choice.period.kind === "allTime"
        ? t("period.allTime")
        : choice.period.kind === "fiscalYearOrEarlier"
          ? t("period.fiscalYearOrEarlier", { year: choice.period.year })
          : t("period.fiscalYear", { year: choice.period.year }),
  }));

  const aggregationOptions: FilterRadioOption[] = RANKING_AGGREGATION_VALUES.map((value) => ({
    value,
    label: t(`aggregation.${value}`),
  }));

  return (
    <div className="mb-4 flex flex-col gap-3" data-testid="team-rankings-filters">
      {/* 並び順は ユーザー指定: 期間 → 性別 → 水路 → 種目 → 距離 → 対象 → 集計。
          ⚠️ **`対象` / `集計` が末尾に隣接する不変条件は維持する** — どちらも
          個人種目限定の軸なので、リレーへ切り替えると末尾2つが同時に消える。
          個人限定の軸を間に挟むとモード切替のたびに下のグループが上下する。 */}

      {/* 期間だけ `<select>`。選択肢が 通算 + 明示年度3つ + 以前バケット の5つで、
          ラジオのピル列にすると1行に収まらず他の軸より目立ってしまう。
          ⚠️ ボックスの指定は `@/components/ui/selectStyles` の
          `COMPACT_SELECT_CLASS` が唯一の定義元。**新しい select スタイルを
          作らないこと** (過去に同一指定が3箇所へ散り、640〜767px 帯で ▼ の
          重なりが片側だけ再発している)。
          見出しは `<legend>` ではなく `<label>` だが、クラスは他のグループと
          同じ `FILTER_LEGEND_CLASS` を読む。 */}
      <div className="min-w-0" data-testid="team-rankings-period">
        <label htmlFor="team-rankings-period-select" className={FILTER_LEGEND_CLASS}>
          {t("filter.period")}
        </label>
        <select
          id="team-rankings-period-select"
          data-testid="team-rankings-period-select"
          className={COMPACT_SELECT_CLASS}
          value={toRankingPeriodValue(state.period)}
          onChange={(event) => handlePeriodChange(event.target.value)}
        >
          {periodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <FilterRadioGroup
        name="team-rankings-gender"
        legend={isIndividual ? t("filter.gender") : t("relay.filter.genderCategory")}
        optionRows={[genderOptions]}
        // 個人種目では `toIndividualGender` を通した値を選択状態にする。
        // state 側もモード切替時に同じ関数で正規化しているので通常は恒等だが、
        // 表示とクエリ条件が**同じ関数を通る**ことを構造で保証しておく。
        value={isIndividual ? toIndividualGender(state.genderCategory) : state.genderCategory}
        onChange={handleGenderChange}
      />

      {/* 水路は両モードで同じ選択肢・同じラベルキー (同義キーを増やさない)。
          ⚠️ 距離より**前**に置く。長水路では 25m が選択肢から消えるので、
          「水路を決めてから距離を選ぶ」順のほうが選択肢の変化が自然に見える。 */}
      <FilterRadioGroup
        name="team-rankings-pool-type"
        legend={t("filter.poolType")}
        optionRows={[poolTypeOptions]}
        value={String(state.poolType)}
        onChange={handlePoolTypeChange}
      />

      <FilterRadioGroup
        name="team-rankings-event"
        legend={t("filter.style")}
        // 1行目 = 個人種目、2行目 = リレー。**fieldset と name は1つのまま**
        // (根拠はこのコンポーネントの docstring)。
        optionRows={[individualEventOptions, relayEventOptions]}
        value={toRankingEventValue(state.event)}
        onChange={handleEventChange}
      />

      <FilterRadioGroup
        name="team-rankings-distance"
        // legend は両モードで `filter.distance`。統合後は距離グループが1つで、
        // 選択肢が `25m` か `25m × 4` に変わるだけなので、モードでキーを
        // 分けると同じ文言の別キーを引く隠れた分岐になる
        // (5ロケールすべてで `relay.filter.legDistance` と同一文言だった)。
        legend={t("filter.distance")}
        optionRows={[distanceOptions]}
        value={String(state.distance)}
        onChange={handleDistanceChange}
      />

      {/* ↓ ここから個人種目限定の軸。値は state に保持されるので、リレーを見て
          個人に戻ると選択が復元される。 */}

      {/* 対象大会スコープ (リレーの RPC に引数が無い) */}
      {isIndividual && (
        <FilterRadioGroup
          name="team-rankings-scope"
          legend={t("filter.scope")}
          optionRows={[scopeOptions]}
          value={state.scope}
          onChange={handleScopeChange}
        />
      )}

      {/* 集計モード (リレー RPC は7引数で `p_aggregation` を持たない) */}
      {isIndividual && (
        <FilterRadioGroup
          name="team-rankings-aggregation"
          legend={t("filter.aggregation")}
          optionRows={[aggregationOptions]}
          value={state.aggregation}
          onChange={handleAggregationChange}
        />
      )}
    </div>
  );
}
