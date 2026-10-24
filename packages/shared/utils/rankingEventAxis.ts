// =============================================================================
// ランキングの「種目」軸 - 個人種目とリレーを1つの選択に統合する (Swim Hub共通パッケージ)
// =============================================================================
//
// UI 上は1つのラジオグループ (種目) に 個人5種目 + リレー2種類 = 7択が並び、
// 個人とリレーの間で改行される。**「個人種目 / リレー」のビュー切替は持たない** —
// 種目の選択そのものがモードを決める (根拠は `types/teamRanking.ts` の
// `RankingEventSelection` の docstring)。
//
// このファイルは `./rankingStyleAxis.ts` (個人の種目/距離軸) と
// `./relayRankingAxis.ts` (リレーの軸) の**両方を読む上位のモジュール**である。
// 選択肢の並び・距離の引き継ぎ規則・既定値はすべて下位2ファイルに委譲し、
// ここでは「モードをまたぐときにどう写すか」だけを持つ:
//
//   - 7択の選択肢配列 (`RANKING_EVENT_CHOICES`)
//   - `RankingEventSelection` ↔ `RankingEventValue` の相互変換 (全単射)
//   - 絞り込み state (`RankingFilterState`) と、そこから各 RPC の条件への射影
//
// ⚠️ web (`apps/web/components/team/rankings/`) と
//    mobile (`apps/mobile/components/teams/rankings/`) の**唯一の定義元**。
//    `"relay:"` 接頭辞のパースを両プラットフォームで書くと、片方だけ新しい種目を
//    追加したときに静かに壊れる (CLAUDE.md「同一のドメイン対応表を2箇所に
//    ハードコードするな」)。
// =============================================================================

import { SWIM_STYLES } from "../types";
import type {
  PoolType,
  RankingAggregation,
  RankingEventSelection,
  RankingEventValue,
  RankingGenderFilter,
  RankingPeriod,
  RankingPeriodValue,
  RankingScope,
  RelayRankingGenderFilter,
  SwimStyle,
  TeamRankingFilters,
  TeamRelayRankingFilters,
} from "../types";
import { resolveFiscalYear } from "./date";
import {
  RANKING_DEFAULT_AGGREGATION,
  RANKING_DEFAULT_GENDER,
  RANKING_DEFAULT_SCOPE,
  RANKING_GENDER_VALUES,
  buildDefaultRankingFilters,
  findStyleAxis,
  findStyleId,
  resolveStyleIdOnStyleChange,
  type RankingStyleGroup,
} from "./rankingStyleAxis";
import {
  RELAY_RANKING_KIND_VALUES,
  buildDefaultRelayRankingFilters,
  getRelayDistanceOptions,
  resolveLegDistanceOnKindChange,
} from "./relayRankingAxis";

// -----------------------------------------------------------------------------
// 7択の選択肢と value の相互変換
// -----------------------------------------------------------------------------

/** 個人種目に絞った選択。個人の配列を扱う UI で `mode` の死んだ分岐を書かせないため。 */
export type IndividualRankingEvent = Extract<RankingEventSelection, { mode: "individual" }>;

/** リレーに絞った選択。 */
export type RelayRankingEvent = Extract<RankingEventSelection, { mode: "relay" }>;

/**
 * 種目ラジオの1択。`value` が input の value、`selection` がその意味。
 *
 * 型引数は「個人だけ / リレーだけ」の配列で `selection` を絞ったまま扱うためにある
 * (`RANKING_INDIVIDUAL_EVENT_CHOICES` から `.selection.style` を読むときに
 * 到達しない `mode` の分岐を書かずに済む)。
 */
export interface RankingEventChoice<S extends RankingEventSelection = RankingEventSelection> {
  value: RankingEventValue;
  selection: S;
}

/**
 * `RankingEventSelection` をラジオの value に写す。
 *
 * **`"relay:"` 接頭辞のリテラルが現れるのはこの関数だけ。** 選択肢配列も
 * `parseRankingEventValue` もこの関数を通して作るので、接頭辞を変えても
 * 片側だけ古いままになる余地が無い。
 */
export function toRankingEventValue(selection: RankingEventSelection): RankingEventValue {
  return selection.mode === "individual" ? selection.style : `relay:${selection.relayKind}`;
}

function toChoice<S extends RankingEventSelection>(selection: S): RankingEventChoice<S> {
  return { value: toRankingEventValue(selection), selection };
}

/**
 * 個人種目の選択肢。並びは canonical (`SWIM_STYLES`) の定義順。
 *
 * ⚠️ ここは canonical な5種目を**そのまま**並べる (styles マスターに依存しない)。
 * 「マスターに実在するか」は距離軸の話であり `./rankingStyleAxis.ts` の
 * `buildRankingStyleGroups` が判定する。UI はその結果と突き合わせて、
 * 距離が1つも無い種目のピルを出さない (押しても何も起きないピルを作らない)。
 */
export const RANKING_INDIVIDUAL_EVENT_CHOICES: readonly RankingEventChoice<IndividualRankingEvent>[] =
  SWIM_STYLES.map((style) => toChoice({ mode: "individual", style }));

/** リレーの選択肢。並びは `RELAY_KIND_VALUES` (フリー → メドレー)。 */
export const RANKING_RELAY_EVENT_CHOICES: readonly RankingEventChoice<RelayRankingEvent>[] =
  RELAY_RANKING_KIND_VALUES.map((relayKind) => toChoice({ mode: "relay", relayKind }));

/**
 * 種目ラジオの全7択。**個人5種目 → リレー2種類**の順。
 *
 * UI はこの配列を2行に割って描くが、`<fieldset>` と `name` は1つのままにする
 * (2つに分けると radio group が2つになり矢印キーで7択を跨げない)。行の割り方は
 * `RANKING_INDIVIDUAL_EVENT_CHOICES` / `RANKING_RELAY_EVENT_CHOICES` を使う。
 */
export const RANKING_EVENT_CHOICES: readonly RankingEventChoice[] = [
  ...RANKING_INDIVIDUAL_EVENT_CHOICES,
  ...RANKING_RELAY_EVENT_CHOICES,
];

/**
 * ラジオの value を `RankingEventSelection` に戻す。未知の value は null。
 *
 * `RANKING_EVENT_CHOICES` の逆引きなので、選択肢に無い値が通ることはない
 * (`as` キャストで検証を迂回しない)。7つの value と7つの selection は
 * `toRankingEventValue` を通して1対1に対応する。
 */
export function parseRankingEventValue(value: string): RankingEventSelection | null {
  return RANKING_EVENT_CHOICES.find((choice) => choice.value === value)?.selection ?? null;
}

// -----------------------------------------------------------------------------
// 期間 (通算 / 年度) の選択肢と value の相互変換
//
// 選択肢は**静的** (通算 + 直近 N 年度)。データから「記録が存在する年度」を
// 導出しない — `scope = allCompetitions` では他チームの大会も数える必要があり、
// それは RLS では見えないので専用 RPC (= migration) が必要になる
// (根拠は `types/teamRanking.ts` の第2弾の契約)。
// 結果として記録が0件の年度も選択肢に出るが、空状態は既存の `empty` で受ける。
// -----------------------------------------------------------------------------

/**
 * 年度を**明示的に**並べる本数 (現年度を含む)。**web / mobile はこの1箇所を読む。**
 *
 * 🚨 **これは選択肢の総数ではない。** 名前のとおり「明示年度 (`fiscalYear`) を
 * いくつ並べるか」だけを表す。選択肢の総数は
 *
 *     1 (通算) + N (明示年度) + 1 (以前バケット)
 *
 * なので、N = 3 なら **5件**。4 にすれば 6件、5 にすれば 7件になる。
 * (旧名 `RANKING_FISCAL_YEAR_COUNT` から改名したのは、`= 3` で選択肢が 5件
 *  出るのを「5 にすれば 5年度出る」と読み違えられないようにするため)
 *
 * 🚨 **以前バケットの上端は `現年度 - N`** — 明示年度の最小
 * (`現年度 - (N - 1)`) より**1つ小さい**年度である。
 *   - `現年度 - (N - 1)` にすると明示年度の最小が「以前」にも入り
 *     **同じ記録が二重に数えられる**
 *   - `現年度 - (N + 1)` にすると間の1年度が**どのバケットにも入らず消える**
 * この関係を保っているのは `buildRankingPeriodChoices` の1箇所だけなので、
 * N を変えても隣接関係は自動的に保たれる。
 *
 * 3 にしている理由:
 *   - 中学・高校の在籍は各3年。**明示年度3つ**あれば在籍中の全年度を個別に
 *     比較でき、それより前は「以前」でまとめて足りる (卒業生の記録は
 *     年度ごとに分けるより「過去のチーム記録」として一括で見る)
 *   - 通算 + 3年度 + 以前 = **5件**。プルダウン1つに収まる
 *
 * 変えるときはここだけを変える。**UI 側に年度リストを持たせないこと。**
 */
export const RANKING_EXPLICIT_FISCAL_YEAR_COUNT = 3;

/** 期間の1択。`value` がラジオの value、`period` がその意味。 */
export interface RankingPeriodChoice {
  value: RankingPeriodValue;
  period: RankingPeriod;
}

/**
 * `RankingPeriod` をラジオの value に写す。
 *
 * **`"fy:"` 接頭辞のリテラルが現れるのはこの関数だけ。** 選択肢配列も
 * `parseRankingPeriodValue` もこの関数を通して作るので、接頭辞を変えても
 * 片側だけ古いままになる余地が無い (`"relay:"` と同じ規律)。
 */
export function toRankingPeriodValue(period: RankingPeriod): RankingPeriodValue {
  if (period.kind === "allTime") return "allTime";
  return period.kind === "fiscalYearOrEarlier" ? `fyle:${period.year}` : `fy:${period.year}`;
}

/**
 * 期間の選択肢。**通算 → 新しい年度 → 古い年度 → 「N年度以前」**の順で
 * `1 + RANKING_EXPLICIT_FISCAL_YEAR_COUNT + 1` 件を返す。
 *
 * 通算を先頭にするのは既定値だからではなく (既定は選択状態で示される)、
 * 「絞っていない状態」が先にあるほうが絞り込みとして読みやすいため。
 * 年度は新しい順 — 直近の年度のほうが選ばれる頻度が高い。
 *
 * 🚨 **「以前」バケットの `year` は明示年度の最小値より 1 小さい。**
 * 例: 現年度 2026 / N=3 なら明示年度は 2026・2025・2024 で、以前バケットは
 * **2023** (= `2026 - 3`)。ここを `currentFiscalYear - (N - 1)` と取り違えると
 * 明示年度の最小 (2024) が「2024年度以前」にも入って**二重に数えられる**。
 * 逆に `currentFiscalYear - (N + 1)` にすると 2024 と 2022 の間の 2023 が
 * **どのバケットにも入らず消える**。
 *
 * 隣接して重複しないことの根拠:
 *   明示年度の最小 = `currentFiscalYear - (N - 1)`
 *   以前の上端     = `currentFiscalYear - N`          = 明示年度の最小 - 1
 *   RPC 側は明示年度を `[4/1, 翌3/31]` で閉じ、以前を `<= 上端+1年の3/31` で
 *   絞る (`20260909000000`)。上端が明示最小の1つ前の年度なので、両者の
 *   日付範囲は接するだけで重ならない (実測: 2024-04-01 は FY2024、
 *   2024-03-31 は「2023年度以前」)。
 *
 * ⚠️ **`today` を渡さない呼び出しはレンダーごとに配列を作り直す。** React 側は
 * `useMemo` で包むこと (毎レンダーで identity が変わると絞り込みの再計算が走る)。
 *
 * @param today 基準となる「現在時刻」。省略時は `new Date()`
 */
export function buildRankingPeriodChoices(today: Date = new Date()): RankingPeriodChoice[] {
  // 4/1 基準の年度判定は `./date.ts` の `resolveFiscalYear` が唯一の定義元
  // (`domesticRecords.ts` の年齢区分の基準年度と同じ関数を読む)。
  const currentFiscalYear = resolveFiscalYear(today);
  const allTime: RankingPeriod = { kind: "allTime" };
  const orEarlier: RankingPeriod = {
    kind: "fiscalYearOrEarlier",
    year: currentFiscalYear - RANKING_EXPLICIT_FISCAL_YEAR_COUNT,
  };

  return [
    { value: toRankingPeriodValue(allTime), period: allTime },
    ...Array.from({ length: RANKING_EXPLICIT_FISCAL_YEAR_COUNT }, (_, index) => {
      const period: RankingPeriod = { kind: "fiscalYear", year: currentFiscalYear - index };
      return { value: toRankingPeriodValue(period), period };
    }),
    { value: toRankingPeriodValue(orEarlier), period: orEarlier },
  ];
}

/**
 * ラジオの value を `RankingPeriod` に戻す。選択肢に無い value は null。
 *
 * **画面に出している `choices` をそのまま渡す設計**にしてある。`today` を受けて
 * 内部で選択肢を組み直す形にすると、セッション中に年度が切り替わった瞬間
 * (3/31 23:59 → 4/1 00:00) に「画面の選択肢」と「パースが受理する値」が食い違う。
 * 同じ配列を引くなら食い違いようが無い。
 *
 * `choices` の逆引きなので**選択肢に出していない年度は通らない**
 * (`as` キャストで検証を迂回しない)。value と period は `toRankingPeriodValue`
 * を通して1対1に対応する。
 *
 * ⚠️ web と mobile で `.find()` を各自書かないこと。この1箇所に集約している
 * のは「選択肢に無い値を弾く」規則を片方だけ緩められないようにするため。
 */
export function parseRankingPeriodValue(
  value: string,
  choices: readonly RankingPeriodChoice[],
): RankingPeriod | null {
  return choices.find((choice) => choice.value === value)?.period ?? null;
}

// -----------------------------------------------------------------------------
// モードをまたぐ絞り込み state
// -----------------------------------------------------------------------------

/**
 * ランキングの絞り込み state。**個人種目とリレーで1つの state を共有する。**
 *
 * 個人用とリレー用の条件オブジェクトを別々に持つと、種目ラジオの選択と表の中身が
 * 食い違う状態が表現可能になる (`types/teamRanking.ts` の
 * `RankingEventSelection` の docstring)。よって
 * **モードは `event` からのみ導出し**、各 RPC の条件は `toRankingQueryTarget` で
 * この state から射影する。
 *
 * モードをまたいで値を引き継ぐのがこの形の目的でもある。距離と性別は選択肢集合が
 * モードで変わるので、切り替え時に `resolveRankingEventChange` が
 * 「同値が選べるなら維持、無ければそのモードの既定」に正規化する。
 */
export interface RankingFilterState {
  /** 種目 = モード + 個人種目 or リレー種類。 */
  event: RankingEventSelection;
  /**
   * 距離 (m)。個人種目は `styles.distance`、リレーは**1レグの距離**
   * (合計距離ではない)。1つの数値で持つのはモードをまたいで引き継ぐため
   * (100m Fr → フリーリレーで 100m×4 が選ばれる)。
   */
  distance: number;
  poolType: PoolType;
  /**
   * 性別。リレーの語彙 (`male` / `female` / `mixed`) で保持する。
   *
   * 個人種目に `mixed` は無いので、個人へ切り替えた時点で
   * `toIndividualGender` が既定 (男子) へ**正規化して state に書き戻す**。
   * state に mixed を残したまま表示だけ男子にすると、画面に出ている条件と
   * 問い合わせている条件が食い違う。
   */
  genderCategory: RelayRankingGenderFilter;
  /**
   * 対象大会スコープ。**個人種目にしか無い軸だが、リレー表示中も保持する。**
   * リレーを見て個人に戻ったときに「すべての大会」の選択が消えていると、
   * ユーザーには絞り込みが勝手に狭まったように見える。
   */
  scope: RankingScope;
  /**
   * 集計期間 (通算 / 年度)。**両モードに出る** — 両 RPC が `p_fiscal_year` を持つ。
   *
   * ⚠️ 年度指定時は `competitions.date` で絞るので、**大会に紐づかない記録
   * (一括登録) は年度が決まらず除外される**。UI で伝えること
   * (根拠は `types/teamRanking.ts` の第2弾の契約)。
   */
  period: RankingPeriod;
  /**
   * 集計モード。**`scope` と全く同じ扱い** — 個人種目にしか無い軸だが、リレー
   * 表示中も state からは消さない (個人に戻ると選択が復元される)。
   *
   * リレー RPC (`get_team_relay_rankings`) は7引数で `p_aggregation` を持たない。
   * リレーには「1チーム1行」に畳み込む単位が無いため意図的に落としてある
   * (根拠は `types/teamRelayRanking.ts` の `TeamRelayRankingFilters`)。
   */
  aggregation: RankingAggregation;
}

/**
 * リレーの性別区分を個人種目の性別に写す。個人種目に `mixed` は存在しないので
 * 既定 (男子) に落とす。
 *
 * ⚠️ モード切替時の state 正規化・ラジオの選択値・RPC の条件が**すべてこの関数を
 * 通る**ようにしてある。片方だけ正規化すると、画面に出ている条件と実際に
 * 問い合わせている条件が静かに食い違う。
 */
export function toIndividualGender(category: RelayRankingGenderFilter): RankingGenderFilter {
  return RANKING_GENDER_VALUES.find((gender) => gender === category) ?? RANKING_DEFAULT_GENDER;
}

/** 種目1つ分の距離の選択肢。 */
export interface RankingDistanceChoice {
  /** 距離 (m)。リレーは1レグの距離。 */
  distance: number;
  /**
   * レグ数。**個人種目は null** (レグという概念が無い)。
   * リレーのラベルを `{distance}m × {legCount}` で組むために返す
   * (`× 4` を UI にハードコードさせないため)。
   */
  legCount: number | null;
}

/**
 * 長水路で実施できない距離。**50m プールで 25m のレースは成立しない**
 * (スタートとゴールが同じ壁になる)。
 *
 * 個人種目の 25m もリレーの `25m × 4` も同じ理由で落ちるので、
 * ここ1箇所で持つ。
 */
const LONG_COURSE_EXCLUDED_DISTANCES: readonly number[] = [25];

/**
 * いま選んでいる種目 **× 水路**で選べる距離を昇順で返す。
 *
 * 個人種目は styles マスター由来 (25〜1500m、種目ごとに違う)、リレーは
 * `RELAY_EVENTS` 由来 (25/50/100/200)。**web と mobile が同じ集合を出すために
 * ここに集約している。**
 *
 * 🚨 **`poolType` に依存する。** 長水路 (1) では 25m を落とす
 * (50m プールで 25m のレースは実施できない)。styles マスターにも
 * `RELAY_EVENTS` にも 25m は存在するので、**除外はここでしかできない**。
 * 長水路 × 25m の記録が DB に在っても到達できなくなるが、実施不可能な
 * 組み合わせなのでそのデータ自体が誤りであり、仕様として受ける。
 *
 * ⚠️ 水路を切り替えたときの正規化は `resolvePoolTypeChange` が行う。
 * この関数だけを使って「表示から消す」だけにすると、選べない距離が選択状態で
 * 残って**画面の条件とクエリ条件が食い違う** (第3弾の `mixed → male` と同型)。
 */
export function getRankingDistanceChoices(
  groups: readonly RankingStyleGroup[],
  event: RankingEventSelection,
  poolType: PoolType,
): RankingDistanceChoice[] {
  const isExcluded = (distance: number) =>
    poolType === 1 && LONG_COURSE_EXCLUDED_DISTANCES.includes(distance);

  if (event.mode === "relay") {
    return getRelayDistanceOptions(event.relayKind)
      .filter((option) => !isExcluded(option.legDistance))
      .map((option) => ({ distance: option.legDistance, legCount: option.legCount }));
  }
  const group = groups.find((candidate) => candidate.style === event.style);
  return (group?.distances ?? [])
    .filter((option) => !isExcluded(option.distance))
    .map((option) => ({ distance: option.distance, legCount: null }));
}

/**
 * 種目を切り替えたときの距離の引き継ぎ。
 *
 * 規則 (「同じ距離が選べるなら維持、無ければそのモードの最短距離」) は
 * 下位2ファイルの `resolveStyleIdOnStyleChange` / `resolveLegDistanceOnKindChange`
 * が定義元で、ここでは**委譲するだけ**にしてある (同じ規則を書き直すと片方だけ
 * 変わって個人とリレーで挙動が乖離する)。
 *
 * 個人種目側は styleId を返す関数なので、距離に戻すために `findStyleAxis` を
 * 通している。その styleId は `groups` から得た値なので必ず見つかる。
 *
 * その種目に距離が1つも無い場合は null (呼び出し側は切り替えを見送る)。
 */
function resolveDistanceOnEventChange(
  groups: readonly RankingStyleGroup[],
  next: RankingEventSelection,
  currentDistance: number,
  poolType: PoolType,
): number | null {
  const resolved =
    next.mode === "relay"
      ? resolveLegDistanceOnKindChange(next.relayKind, currentDistance)
      : resolveIndividualDistance(groups, next.style, currentDistance);
  if (resolved === null) return null;

  // 下位2ファイルの引き継ぎ規則は水路を知らないので、長水路で落ちる距離
  // (25m) を返してくることがある。その場合だけここで選択可能な集合へ丸める。
  // 規則そのものは下位に委譲したまま、水路の制約だけを後段で適用する。
  return clampDistanceToChoices(groups, next, resolved, poolType);
}

/** 個人種目の距離の引き継ぎ。styleId 経由なので距離へ戻す。 */
function resolveIndividualDistance(
  groups: readonly RankingStyleGroup[],
  style: SwimStyle,
  currentDistance: number,
): number | null {
  const styleId = resolveStyleIdOnStyleChange(groups, style, currentDistance);
  if (styleId === null) return null;
  return findStyleAxis(groups, styleId)?.distance ?? null;
}

/**
 * 距離を「その種目 × その水路で選べる集合」に丸める。
 * 既に含まれていればそのまま、含まれなければ**最短距離**にする
 * (`resolveStyleIdOnStyleChange` / `resolveLegDistanceOnKindChange` と同じ流儀)。
 *
 * 選択肢が1つも無い場合は null (呼び出し側で切り替えを見送る)。
 */
function clampDistanceToChoices(
  groups: readonly RankingStyleGroup[],
  event: RankingEventSelection,
  distance: number,
  poolType: PoolType,
): number | null {
  const choices = getRankingDistanceChoices(groups, event, poolType);
  if (choices.some((choice) => choice.distance === distance)) return distance;
  return choices.at(0)?.distance ?? null;
}

/**
 * 初期表示の絞り込み state。既定は**個人種目**で、種目 / 距離 / 水路 / 性別 /
 * 対象 / 集計 / 期間の値はすべて `./rankingStyleAxis.ts` の
 * `buildDefaultRankingFilters` (と `DEFAULT_STYLE` / `DEFAULT_DISTANCE` 等の定数)
 * が定義元。ここではそれを state の形に写すだけ。
 *
 * ⚠️ **既定値を散文で書き写さないこと。** 以前ここに「100m 自由形」と書いて
 * あったが、`DEFAULT_DISTANCE` が 50 に変わって腐った。値を知りたければ
 * 定義元を読む。
 *
 * 🚨 **`groups` が空 (styles マスターが取れていない) ときはリレーへ
 * フォールバックし、null は返さない。**
 *
 * リレーランキングは `styles` に一切依存していない (距離は `RELAY_EVENTS` 由来で、
 * RPC `get_team_relay_rankings` も `styles` を引かない)。個人種目とリレーを1つの
 * 種目軸に統合したので、null を返すと**無関係なマスターの失敗でランキングタブ全体が
 * 死ぬ**。統合前はリレーが別ビューだったため個人種目だけが止まっていた —
 * ここで null を返すのはその退行になる。
 *
 * ⚠️ `styles` は `authenticated` に TRUNCATE 権限が付いており (TRUNCATE は RLS を
 * 通らないので RLS では防げない)、マスターが空になる状態は到達可能である。
 *
 * ⚠️ **呼び出し側は「取得中」と「取得できなかった」を区別すること。** この関数は
 * `groups` が空になった理由を知らないので、取得中に呼ぶとリレーの state を返す。
 * 取得中はこの state で問い合わせず読み込み表示に留めること
 * (web は `stylesQuery.isPending` で判定している)。
 */
export function buildDefaultRankingFilterState(
  groups: readonly RankingStyleGroup[],
): RankingFilterState {
  const defaults = buildDefaultRankingFilters(groups);
  const axis = defaults ? findStyleAxis(groups, defaults.styleId) : null;

  if (defaults && axis) {
    // ⚠️ 既定距離も**既定水路で選べる集合に丸める**。`buildDefaultRankingFilters`
    // は水路を知らないので、styles マスターが 25m しか持たない種目を既定に
    // 選んだ場合に「長水路 (既定) では選べない距離」が初期値になりうる。
    // そのまま置くと距離ラジオが未選択のまま RPC には 25m が飛ぶ
    // (画面の条件とクエリ条件の食い違い)。
    const event: RankingEventSelection = { mode: "individual", style: axis.style };
    const distance = clampDistanceToChoices(groups, event, axis.distance, defaults.poolType);
    return {
      event,
      distance: distance ?? axis.distance,
      poolType: defaults.poolType,
      genderCategory: defaults.gender,
      scope: defaults.scope,
      period: defaults.period,
      aggregation: defaults.aggregation,
    };
  }

  // 個人種目が1つも解決できない = styles マスターが無い。リレーだけで成立させる。
  // 既定値の定義元は `buildDefaultRelayRankingFilters` (フリー / 100m×4 / 長水路 /
  // 男子 / 通算)。
  const relayDefaults = buildDefaultRelayRankingFilters();
  return {
    event: { mode: "relay", relayKind: relayDefaults.relayKind },
    distance: relayDefaults.legDistance,
    poolType: relayDefaults.poolType,
    genderCategory: relayDefaults.genderCategory,
    // scope / aggregation はリレーでは使わないが state の軸なので既定を入れておく
    // (個人種目が復活したときにそのまま使われる)。リレーの条件オブジェクトは
    // どちらも持たないので、既定は `rankingStyleAxis` の定数から取る。
    scope: RANKING_DEFAULT_SCOPE,
    period: relayDefaults.period,
    aggregation: RANKING_DEFAULT_AGGREGATION,
  };
}

/**
 * 種目を切り替えた後の state。距離と性別だけがモードで選択肢集合が変わるので
 * 正規化し、水路とスコープはそのまま引き継ぐ。
 *
 * 新しい種目に距離が1つも無い場合は **null を返す (切り替えを見送る = 何もしない)**。
 *
 * 🚨 **`resolvePoolTypeChange` が non-nullable なのに対してこちらが nullable
 * なのは、正しい非対称である。「揃えよう」としないこと。**
 * 分かれ目は**どちらがユーザーの意図の本体か**:
 *
 * | 関数 | 意図 | 不可能なとき |
 * |---|---|---|
 * | `resolvePoolTypeChange` | **水路を変える** | 意図を通し、別の軸 (種目) を調整して既定へ倒す |
 * | `resolveRankingEventChange` (これ) | **その種目を見る** | 倒すと意図そのものを捨てるので**何もしない** |
 *
 * 種目軸で既定へ倒すと「バタフライを押したら自由形が出た」になる。それより
 * 「何も起きない」ほうが安全なので、呼び出し側は見送るのが正しい。
 * 水路軸は逆で、見送ると**水路コントロールが行き止まりになる**
 * (根拠は `resolvePoolTypeChange` の docstring)。
 *
 * ⚠️ **この null は現在の UI からは到達しない。** W-1 で種目のピル / チップを
 * `poolType` 込みで絞ったため (`getRankingDistanceChoices(...).length > 0`)、
 * **描画されている種目は必ず1つ以上の距離を持つ**。それでも nullable を保つのは
 * **到達したときに既定へ飛ばさない**ためであり、非 null 断定 (`!`) で潰すためでも
 * 「未使用だから」で撤去するためでもない。
 * 呼び出し側が `?? prev` (mobile) / 早期 return (web) で見送るのはこの意図に
 * 沿った実装であり、**値の意味を捏造する `?? 0` とは別物**である。
 */
export function resolveRankingEventChange(
  groups: readonly RankingStyleGroup[],
  state: RankingFilterState,
  next: RankingEventSelection,
): RankingFilterState | null {
  const distance = resolveDistanceOnEventChange(groups, next, state.distance, state.poolType);
  if (distance === null) return null;

  return {
    ...state,
    event: next,
    distance,
    genderCategory:
      next.mode === "individual" ? toIndividualGender(state.genderCategory) : state.genderCategory,
  };
}

/**
 * 年度注意書き (「年度を選ぶと、大会に紐づかない記録 (一括登録) は含まれません」)
 * を出すべきか。**この規則の唯一の定義元。**
 *
 * 🚨 **web / mobile で別実装を持たないこと。** 一度 shared (`TeamRankingFilters`
 * 版) と mobile (`RankingFilterState` 版) に同じ規則が並立し、
 * CLAUDE.md「同一のドメイン対応表を2箇所にハードコードするな」に触れていた。
 * 引数を `RankingFilterState` にしてあるので**適用済み state でも
 * 絞り込みシートの draft でも同じ関数を通せる** (どちらも同じ型)。
 * 消費経路:
 *   - web  : `TeamRankings.tsx` が `active.state` を渡す (結果カラムの注意書き)
 *   - mobile: 本体上部の条件説明と絞り込みシートの `期間` グループの note。
 *     シートは draft を渡す — **同じ関数でないと「シートを開いたときと閉じた
 *     ときで言っていることが変わる」**
 *
 * 4状態の真理値表:
 *
 * | 状態 | 出す |
 * |---|---|
 * | 個人 + `allCompetitions` + 年度 (`fiscalYear` / `fiscalYearOrEarlier`) | ✅ |
 * | 個人 + `teamCompetitions` + 年度 | ❌ |
 * | 個人 + 通算 | ❌ |
 * | リレー + 年度 | ❌ |
 *
 * 🚨 **`teamCompetitions` で出さない理由**: あのスコープは
 * `c.team_id = p_team_id` で絞るため、**大会を持たない一括登録記録は年度に
 * 関係なく常に落ちている** (LEFT JOIN の未結合行は `c.team_id IS NULL` →
 * 述語が NULL → 偽)。通算でも既に含まれていないので、年度を選んだときだけ
 * 注意書きを出すと**「年度選択が原因で消えた」と誤読させる**。
 *
 * 🚨 **リレーで出さない理由**: リレー RPC にはスコープ軸が無く、
 * `relay_records.team_id` が行に付いているので構造上チーム内に閉じている。
 * そして `relay_records.competition_id = NULL` の行を生む経路が**現状存在しない**
 * (根拠は `../types/relayRecord.ts` の `competitionId` の docstring —
 * 「将来『大会に紐づかないリレー記録』を直接入力できるようにするための予約。
 * 現状その行を生む経路は無い」)。つまり**注意書きが説明する事象が発生しえない**。
 *
 * ⚠️ **将来復活させる条件**: `relay_records` に `competition_id = NULL` の行を
 * 作る経路が実装されたら、リレーでも出すこと (`event.mode` の枝を外す)。
 * `../types/relayRecord.ts` の `competitionId` docstring 側にもこのファイルへの
 * 相互参照を置いてあるので、予約を実装するときは両方を見ること。
 *
 * ⚠️ 年度の判定は `kind !== "allTime"` にする。「2023年度以前」
 * (`fiscalYearOrEarlier`) も RPC に年度を渡す枝なので同じ除外が起きる。
 * **`=== "fiscalYear"` と書くと以前バケットだけ注意書きが出ない。**
 * `RankingPeriod` に4番目の variant が来ても、`allTime` 以外を年度扱いに
 * しておけばこの判定は自動的に追従する。
 */
export function shouldShowFiscalYearNote(state: RankingFilterState): boolean {
  if (state.event.mode !== "individual") return false;
  if (state.scope !== "allCompetitions") return false;
  return state.period.kind !== "allTime";
}

/**
 * 水路を切り替えた後の state。**必ず切り替わる (null を返さない)。**
 *
 * 🚨 **距離を必ず正規化して state に書き戻す。** 長水路では 25m が選択肢から
 * 消えるので、短水路で 25m を選んだまま長水路へ切り替えると
 * **選べない距離が選択状態で残る**。表示だけ変えて state を放置すると
 * 画面に出ている条件と問い合わせている条件が食い違う
 * (第3弾の `mixed → male` と同型の問題)。
 *
 * 丸め方は `resolveLegDistanceOnKindChange` と同じ流儀 —
 * 「その水路でも選べるなら維持、選べなければ最短距離」。
 * 例: 短水路 25m Fr → 長水路 で 50m Fr になる。
 *
 * 🚨 **選択中の種目がその水路で距離を1つも持たないときは種目ごと既定へ倒す。**
 * (styles マスターに 25m だけの種目があると、それを短水路で選んでから長水路へ
 * 切り替える経路で起きる。) ここで null を返して切り替えを見送ると
 * **水路のピルが押しても何も起きない行き止まりになる** — ピルを描くなら押せる、
 * を守る。倒し先は `buildDefaultRankingFilterState` (`active` が条件不成立時に
 * 倒す先と同じ)。水路・期間・性別・スコープ・集計は引き継ぐ。
 *
 * 🚨 **`resolveRankingEventChange` が nullable なのにこちらが non-nullable
 * なのは、正しい非対称である。「揃えよう」としないこと。**
 * ユーザーの意図の本体が違う — こちらは「**水路を変えたい**」なので意図を通し、
 * 副次的な軸 (種目) を調整する。あちらは「**その種目を見たい**」なので、
 * 不可能なときに別の種目へ倒すと意図そのものを捨てることになる
 * (対の説明は `resolveRankingEventChange` の docstring)。
 *
 * ⚠️ 種目ごと倒れるのは**距離が丸められないときだけ**である。25m と 50m を持つ
 * 種目を短水路で選んで長水路へ切り替えた場合は、種目はそのままで距離が 50m に
 * 丸まる (実測: web / mobile の両方で対照確認済み)。
 */
export function resolvePoolTypeChange(
  groups: readonly RankingStyleGroup[],
  state: RankingFilterState,
  nextPoolType: PoolType,
): RankingFilterState {
  const distance = clampDistanceToChoices(groups, state.event, state.distance, nextPoolType);
  if (distance !== null) return { ...state, poolType: nextPoolType, distance };

  // 種目ごと既定へ。既定の距離も念のため同じ水路で丸める
  // (`buildDefaultRankingFilterState` は既定水路で丸めているので、
  //  切替先が短水路なら恒等。長水路への切替でも既定は長水路で丸め済み)。
  const fallback = buildDefaultRankingFilterState(groups);
  const fallbackDistance = clampDistanceToChoices(
    groups,
    fallback.event,
    fallback.distance,
    nextPoolType,
  );
  return {
    ...state,
    poolType: nextPoolType,
    event: fallback.event,
    distance: fallbackDistance ?? fallback.distance,
  };
}

/**
 * 表示するランキングの種類とその RPC 条件。**モードは `RankingFilterState.event`
 * からのみ決まる**ので、「個人種目を選んでいるのにリレーの条件で問い合わせる」
 * 組み合わせを作れない。
 */
export type RankingQueryTarget =
  | { mode: "individual"; filters: TeamRankingFilters }
  | { mode: "relay"; filters: TeamRelayRankingFilters };

/**
 * 絞り込み state を RPC の条件に射影する。
 *
 * 既定条件オブジェクトを展開したうえで state の値で上書きする。展開しているのは
 * まだ可変になっていない軸 (現状は無し) を1箇所から引き継ぐためで、リテラルを
 * ここに書き直さないための規律でもある。
 *
 * ⚠️ **`aggregation` は個人種目にしか流さない。** リレー RPC は7引数で
 * `p_aggregation` を持たず、`TeamRelayRankingFilters` にもフィールドが無い
 * (根拠は `types/teamRanking.ts` の第2弾の契約)。`period` は両方に流す。
 *
 * null は**個人種目で `styles.id` が引けなかった場合だけ**返る (種目マスターが
 * 空 / 全行が canonical 化できない等のデータ異常)。リレーの軸は静的定義から
 * 決まるので null にならない。
 */
export function toRankingQueryTarget(
  groups: readonly RankingStyleGroup[],
  state: RankingFilterState,
): RankingQueryTarget | null {
  if (state.event.mode === "relay") {
    return {
      mode: "relay",
      filters: {
        ...buildDefaultRelayRankingFilters(),
        relayKind: state.event.relayKind,
        legDistance: state.distance,
        poolType: state.poolType,
        genderCategory: state.genderCategory,
        period: state.period,
        // `aggregation` は**渡さない**。リレー RPC は7引数で受け取り口が無い
        // (`TeamRelayRankingFilters` にフィールドすら無いので型が弾く)。
      },
    };
  }

  const defaults = buildDefaultRankingFilters(groups);
  if (!defaults) return null;
  const styleId = findStyleId(groups, state.event.style, state.distance);
  if (styleId === null) return null;

  return {
    mode: "individual",
    filters: {
      ...defaults,
      styleId,
      poolType: state.poolType,
      gender: toIndividualGender(state.genderCategory),
      scope: state.scope,
      period: state.period,
      aggregation: state.aggregation,
    },
  };
}

/**
 * 既定条件から変更されている項目数。mobile の絞り込みシートのバッジ表示に使う
 * (履歴タブの ListToolbar と同じ「適用中の件数バッジ」)。
 *
 * 個人種目とリレーで別々に数える関数は持たない。種目軸を統合したので数える対象は
 * 1つの `RankingFilterState` だけで、**この関数がバッジの唯一の定義元**である。
 *
 * 🚨 **その画面に出ていない軸は数えない。** リレー表示中の `scope` / `aggregation`
 * は絞り込みに現れないので、既定と違っていてもバッジに含めるとユーザーには
 * 消せないバッジになる。`period` は両モードに出るので**常に数える**
 * (軸の出る場所の対応表は `types/teamRanking.ts` の第2弾の契約)。
 */
export function countActiveRankingFilterState(
  state: RankingFilterState,
  defaults: RankingFilterState,
): number {
  let count = 0;
  if (toRankingEventValue(state.event) !== toRankingEventValue(defaults.event)) count += 1;
  if (state.distance !== defaults.distance) count += 1;
  if (state.poolType !== defaults.poolType) count += 1;
  // 期間は両モードに出るので常に数える。`RankingPeriod` はオブジェクトなので
  // value 表現に写して比べる (`===` は identity 比較になり、同じ年度でも
  // 別インスタンスなら「変更あり」と数えてしまう)。
  if (toRankingPeriodValue(state.period) !== toRankingPeriodValue(defaults.period)) count += 1;

  if (state.event.mode === "individual") {
    if (toIndividualGender(state.genderCategory) !== toIndividualGender(defaults.genderCategory)) {
      count += 1;
    }
    if (state.scope !== defaults.scope) count += 1;
    if (state.aggregation !== defaults.aggregation) count += 1;
    return count;
  }

  // リレー表示中は scope / aggregation を数えない (絞り込みに出ていない軸)
  if (state.genderCategory !== defaults.genderCategory) count += 1;
  return count;
}
