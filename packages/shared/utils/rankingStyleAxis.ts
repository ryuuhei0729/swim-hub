// =============================================================================
// ランキングの種目/距離軸 - styles マスターからの導出 (Swim Hub共通パッケージ)
// =============================================================================
//
// ランキングの絞り込みは `styles.id` (種目 × 距離を一意に決める) を軸にする。
// 選択肢は **必ず styles テーブルの実データから導出する**。
//
// ⚠️ `./swimStyles.ts` の `DISTANCES` / `getDistancesForStyle()` や
//    `./regionalStandardTimes.ts` の `SELECTABLE_DISTANCES` を使ってはいけない。
//    いずれも [50,100,200,400,800] 系の静的リストで 25m×4種目と 1500mFr を含まず、
//    styles マスターに存在する5種目が選択肢から黙って消える。
//    同じ理由で、ここに独自の距離定数を置くこともしない (二重管理になる)。
//
// このファイルは web (`apps/web/components/team/rankings/`) と
// mobile (`apps/mobile/components/teams/rankings/`) の**唯一の定義元**である。
// 当初は両プラットフォームが個別に同じ導出を持っていたため、片方だけ更新されて
// 静かに壊れる状態になっていた (CLAUDE.md: 同一のドメイン対応表を2箇所に持つな)。
// 順位付与 (`./ranking.ts`) とは関心が別なのでファイルを分けている。
// =============================================================================

import { SWIM_STYLES } from "../types";
import type {
  PoolType,
  RankingAggregation,
  RankingGenderFilter,
  RankingScope,
  Style,
  SwimStyle,
  TeamRankingFilters,
} from "../types";
import { toStyleCode } from "./swimStyles";

// -----------------------------------------------------------------------------
// 絞り込み軸の選択肢と並び順
//
// web のラジオボタンと mobile のセグメント/ボトムシートが**同じ配列を読む**。
//
// 並び順の方針は「canonical な列挙順に従い、既存画面の並びと一致させる」:
//   - 水路は 短水路(0) → 長水路(1)。既存の `/time-level`
//     (`TimeLevelClient.tsx:175-193`) と一括ベストタイム画面のタブが同じ並びで、
//     ランキングだけ逆にすると画面間の一貫性が壊れる。既定値 (長水路) は
//     選択状態で示されるのでリストの先頭である必要はない
//   - 性別は `users.gender` の canonical な数値順 (male=0 → female=1)。
//     「男女すべて」は選択肢に持たない (根拠は `types/teamRanking.ts` の
//     `RankingGenderFilter` の docstring)
//   - スコープは狭い → 広い。RLS では見えない範囲まで露出する
//     `allCompetitions` を後ろに置き、既定 (チームの大会) から明示的に
//     選ばせる
// -----------------------------------------------------------------------------

/**
 * 性別フィルタの選択肢。`users.gender` の canonical な数値順 (0=男性, 1=女性)。
 *
 * 「男女すべて」は含めない。水泳は性別で分かれて実施されるため男女を混ぜた
 * 順位表に競技上の意味が無く、混合はリレーの `mixed` でのみ表現する
 * (根拠は `types/teamRanking.ts` の `RankingGenderFilter`)。
 */
export const RANKING_GENDER_VALUES: readonly RankingGenderFilter[] = ["male", "female"];

/** 水路の選択肢。`records.pool_type` の canonical な数値順 (0=短水路, 1=長水路)。 */
export const RANKING_POOL_TYPE_VALUES: readonly PoolType[] = [0, 1];

/** 対象大会スコープの選択肢。狭い → 広い。 */
export const RANKING_SCOPE_VALUES: readonly RankingScope[] = [
  "teamCompetitions",
  "allCompetitions",
];

/** ある種目で選べる1つの距離と、それに対応する `styles.id`。 */
export interface RankingDistanceOption {
  distance: number;
  styleId: number;
}

/** 1種目分の選択肢。`distances` は距離の昇順。 */
export interface RankingStyleGroup {
  style: SwimStyle;
  distances: RankingDistanceOption[];
}

/**
 * 既定で選ぶ種目/距離。**50m 自由形** (ユーザー指定)。
 *
 * 50m Fr は全国大会から地区大会・記録会まで最も広く実施され、どのチームでも
 * 記録が存在しやすい。**長水路 (既定) でも実施できる**ことも条件になる —
 * 25m は長水路で実施不可なので既定にできない
 * (`./rankingEventAxis.ts` の `getRankingDistanceChoices`)。
 *
 * ⚠️ styles マスターに 50m Fr が無い場合のフォールバック
 * (`groups.at(0)?.distances.at(0)`) は残すこと。マスターが差し替わったときに
 * 既定が決まらず null になると、ランキングタブがリレーへ倒れてしまう。
 */
const DEFAULT_STYLE: SwimStyle = "Fr";
/**
 * 既定の**レースの距離** (m)。
 *
 * ⚠️ `./relayRankingAxis.ts` の `DEFAULT_LEG_DISTANCE` (= 100) とは**別の量**
 * (あちらは 1レグの距離で、100 は 4×100m = 総距離 400m を意味する)。
 * **数値を揃えに来ないこと** — 理由はあちらの docstring に書いてある。
 */
const DEFAULT_DISTANCE = 50;

/**
 * 既定の水路。長水路 (1) を初期表示にする。日本水泳連盟の公認記録・全国大会は
 * 長水路が基準であり、同じ「種目 × 距離 × 水路でタイムを比較する」画面である
 * `/time-level` (`TimeLevelClient.tsx`) も長水路を既定にしている。
 */
const DEFAULT_POOL_TYPE = 1;

/**
 * 既定の性別。男子を初期表示にする。男女を混ぜた「すべて」は選択肢に無いため、
 * どちらかが必ず初期選択になる。
 *
 * export しているのは `./rankingEventAxis.ts` がリレーの `mixed` を個人種目へ
 * 写すときの落とし先として読むため。`RANKING_GENDER_VALUES.at(0)` で代用しない
 * (配列の並びは canonical な数値順という別の根拠で決まっているので、既定値と
 * 同一視すると片方を変えたときにもう片方が黙って変わる)。
 */
export const RANKING_DEFAULT_GENDER: RankingGenderFilter = "male";

/**
 * 既定の対象大会スコープ。狭い側 (チームの大会) から始める。
 *
 * export しているのは `./rankingEventAxis.ts` が **styles マスター無しで
 * 絞り込み state を組み立てる**ときに読むため (リレーへフォールバックする経路では
 * `buildDefaultRankingFilters` が null を返すのでそこから scope を取れない)。
 */
export const RANKING_DEFAULT_SCOPE: RankingScope = "teamCompetitions";

/**
 * 既定の集計モード。1人1行の `personalBest` から始める。
 *
 * 「チームの誰が速いか」を見る画面なので、同一メンバーが何行も並ぶ `allRaces` を
 * 初期表示にすると上位が数人で埋まる。`allRaces` は取得上限 (500件) に到達しうる
 * モードでもあるので、明示的に選ばせる。
 *
 * export しているのは `./rankingEventAxis.ts` が **styles マスター無しで
 * 絞り込み state を組み立てる**ときに読むため (リレーへフォールバックする経路では
 * `buildDefaultRankingFilters` が null を返し、リレーの条件オブジェクトには
 * `aggregation` が無いのでどちらからも取れない)。
 */
export const RANKING_DEFAULT_AGGREGATION: RankingAggregation = "personalBest";

/** 集計モードの選択肢。1人1行 → 全レースの順 (狭い → 広い)。 */
export const RANKING_AGGREGATION_VALUES: readonly RankingAggregation[] = [
  "personalBest",
  "allRaces",
];

/**
 * styles マスターを「種目 → 距離リスト」に畳み込む。
 *
 * - 種目の並びは canonical (`SWIM_STYLES`) の定義順
 * - 距離は昇順
 * - `styles.style` は `toStyleCode()` で正規化する (Issue #13 のデプロイ窓で
 *   DB にまだ旧ケーシングの小文字が残っていても拾えるようにするため)。
 *   正規化できない値の行は選択肢に出さない (`as SwimStyle` で押し通さない)
 * - `styles.distance` は integer NOT NULL だが CHECK 制約が無いため、
 *   0 以下・非有限の行は選択肢に出さない
 * - 同一 (種目, 距離) の行が複数ある場合は `styles.id` が小さい方を採用する
 *   (取得順に依存せず決定的にするため)
 */
export function buildRankingStyleGroups(styles: readonly Style[]): RankingStyleGroup[] {
  const optionsByStyle = new Map<SwimStyle, Map<number, RankingDistanceOption>>();

  for (const row of styles) {
    const code = toStyleCode(row.style);
    if (!code) continue;
    if (!Number.isFinite(row.distance) || row.distance <= 0) continue;

    let byDistance = optionsByStyle.get(code);
    if (!byDistance) {
      byDistance = new Map<number, RankingDistanceOption>();
      optionsByStyle.set(code, byDistance);
    }
    const existing = byDistance.get(row.distance);
    if (!existing || row.id < existing.styleId) {
      byDistance.set(row.distance, { distance: row.distance, styleId: row.id });
    }
  }

  return SWIM_STYLES.flatMap<RankingStyleGroup>((code) => {
    const byDistance = optionsByStyle.get(code);
    if (!byDistance || byDistance.size === 0) return [];
    const distances = [...byDistance.values()].sort((a, b) => a.distance - b.distance);
    return [{ style: code, distances }];
  });
}

/** `styles.id` から種目/距離を逆引きする。見つからない場合は null。 */
export function findStyleAxis(
  groups: readonly RankingStyleGroup[],
  styleId: number,
): { style: SwimStyle; distance: number } | null {
  for (const group of groups) {
    for (const option of group.distances) {
      if (option.styleId === styleId) {
        return { style: group.style, distance: option.distance };
      }
    }
  }
  return null;
}

/** 種目 + 距離から `styles.id` を引く。存在しない組み合わせの場合は null。 */
export function findStyleId(
  groups: readonly RankingStyleGroup[],
  style: SwimStyle,
  distance: number,
): number | null {
  const group = groups.find((candidate) => candidate.style === style);
  if (!group) return null;
  return group.distances.find((option) => option.distance === distance)?.styleId ?? null;
}

/**
 * 種目を切り替えたときの距離の引き継ぎ。
 * 同じ距離が新しい種目にも存在すればそれを維持し、無ければその種目の最短距離にする。
 * (例: 400mFr → 平泳ぎ に切り替えると 400m が無いので 25m/50m 側に落ちる)
 */
export function resolveStyleIdOnStyleChange(
  groups: readonly RankingStyleGroup[],
  nextStyle: SwimStyle,
  currentDistance: number,
): number | null {
  const group = groups.find((candidate) => candidate.style === nextStyle);
  if (!group) return null;
  const sameDistance = group.distances.find((option) => option.distance === currentDistance);
  if (sameDistance) return sameDistance.styleId;
  return group.distances.at(0)?.styleId ?? null;
}

/**
 * 初期表示の絞り込み条件。
 * `aggregation` / `period` は第1弾では固定 (モード切替と年度セレクタは第2弾)。
 * styles マスターが空 (取得前・取得失敗) の場合は null を返す。
 */
export function buildDefaultRankingFilters(
  groups: readonly RankingStyleGroup[],
): TeamRankingFilters | null {
  const styleId =
    findStyleId(groups, DEFAULT_STYLE, DEFAULT_DISTANCE) ??
    groups.at(0)?.distances.at(0)?.styleId ??
    null;
  if (styleId === null) return null;

  return {
    styleId,
    poolType: DEFAULT_POOL_TYPE,
    gender: RANKING_DEFAULT_GENDER,
    scope: RANKING_DEFAULT_SCOPE,
    aggregation: RANKING_DEFAULT_AGGREGATION,
    period: { kind: "allTime" },
  };
}
