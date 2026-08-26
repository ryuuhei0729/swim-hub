// =============================================================================
// waPoints.ts - World Aquatics (WA) ポイント計算 共有ユーティリティ
// =============================================================================
// 出典: https://www.worldaquatics.com/swimming/points (World Aquatics 公式ポイント制度)
//
// 計算式: P = floor(1000 * (B / T)^3)
//   B = base time (世界記録級のタイムを基準に World Aquatics が公式に定める基準タイム)
//   T = 対象タイム
// 丸めは floor (切り捨て) のみ。round は使わない
// (B=46.40, T=44.94 のとき raw=1100.66... で floor=1100 / round=1101 となり
//  公式点数表と不一致になるため)。
//
// チーム詳細メンバータブ「WAポイントで比較」機能で使用。
// 対象種目はメンバー管理表の既存列 (自由形50/100/200/400/800, 背/平/バタ50/100/200,
// 個人メドレー100/200/400) のみ。1500m・リレー種目は対象外
// (= BASE_TIME_TABLE に存在しない組合せは getWaBaseTime が null を返す)。
// =============================================================================

import type { StyleTranslationKey } from "./swimStyles";

export type PoolType = 0 | 1; // 0: 短水路(SCM), 1: 長水路(LCM)
export type Gender = 0 | 1; // 0: 男性, 1: 女性

/**
 * World Aquatics Points base time table (公式PDF由来、PMが世界記録と突合済みの実数値)。
 *
 * - LCM (poolType=1): 有効期間 2026-01-01 〜 2026-12-31
 * - SCM (poolType=0): 有効期間 2025-09-01 〜 2026-08-31
 *   ★ SCM は 2026-08-31 に失効する。以降は World Aquatics の新しい公式表に
 *     差し替える必要がある (このコメントと合わせて更新すること)。
 *
 * key: `${poolType}_${gender}_${styleKey}_${distance}`
 * LCM の 100IM は公式表に存在しないため意図的に未定義 (getWaBaseTime が null を返す)。
 */
const BASE_TIME_TABLE: Readonly<Record<string, number>> = {
  // --- LCM (poolType=1), 有効期間 2026-01-01〜2026-12-31 ---
  "1_0_Fr_50": 20.91,
  "1_1_Fr_50": 23.61,
  "1_0_Fr_100": 46.4,
  "1_1_Fr_100": 51.71,
  "1_0_Fr_200": 102.0,
  "1_1_Fr_200": 112.23,
  "1_0_Fr_400": 219.96,
  "1_1_Fr_400": 234.18,
  "1_0_Fr_800": 452.12,
  "1_1_Fr_800": 484.12,
  "1_0_Ba_50": 23.55,
  "1_1_Ba_50": 26.86,
  "1_0_Ba_100": 51.6,
  "1_1_Ba_100": 57.13,
  "1_0_Ba_200": 111.92,
  "1_1_Ba_200": 123.14,
  "1_0_Br_50": 25.95,
  "1_1_Br_50": 29.16,
  "1_0_Br_100": 56.88,
  "1_1_Br_100": 64.13,
  "1_0_Br_200": 125.48,
  "1_1_Br_200": 137.55,
  "1_0_Fly_50": 22.27,
  "1_1_Fly_50": 24.43,
  "1_0_Fly_100": 49.45,
  "1_1_Fly_100": 54.6,
  "1_0_Fly_200": 110.34,
  "1_1_Fly_200": 121.81,
  "1_0_IM_200": 112.69,
  "1_1_IM_200": 125.7,
  "1_0_IM_400": 242.5,
  "1_1_IM_400": 263.65,
  // 1_0_IM_100 / 1_1_IM_100 は LCM に存在しない (意図的に未定義)

  // --- SCM (poolType=0), 有効期間 2025-09-01〜2026-08-31 ---
  "0_0_Fr_50": 19.9,
  "0_1_Fr_50": 22.83,
  "0_0_Fr_100": 44.84,
  "0_1_Fr_100": 50.25,
  "0_0_Fr_200": 98.61,
  "0_1_Fr_200": 110.31,
  "0_0_Fr_400": 212.25,
  "0_1_Fr_400": 230.25,
  "0_0_Fr_800": 440.46,
  "0_1_Fr_800": 477.42,
  "0_0_Ba_50": 22.11,
  "0_1_Ba_50": 25.23,
  "0_0_Ba_100": 48.33,
  "0_1_Ba_100": 54.02,
  "0_0_Ba_200": 105.63,
  "0_1_Ba_200": 118.04,
  "0_0_Br_50": 24.95,
  "0_1_Br_50": 28.37,
  "0_0_Br_100": 55.28,
  "0_1_Br_100": 62.36,
  "0_0_Br_200": 120.16,
  "0_1_Br_200": 132.5,
  "0_0_Fly_50": 21.32,
  "0_1_Fly_50": 23.94,
  "0_0_Fly_100": 47.71,
  "0_1_Fly_100": 52.71,
  "0_0_Fly_200": 106.85,
  "0_1_Fly_200": 119.32,
  "0_0_IM_100": 49.28,
  "0_1_IM_100": 55.11,
  "0_0_IM_200": 108.88,
  "0_1_IM_200": 121.63,
  "0_0_IM_400": 234.81,
  "0_1_IM_400": 255.48,
};

/**
 * poolType/gender/styleKey/distance の組合せから World Aquatics base time (秒) を取得する。
 * 公式表に存在しない組合せ (LCM×IM100、1500m 等の対象外種目) は null を返す。
 */
export function getWaBaseTime(
  poolType: PoolType,
  gender: Gender,
  styleKey: StyleTranslationKey,
  distance: number,
): number | null {
  const key = `${poolType}_${gender}_${styleKey}_${distance}`;
  const baseTime = BASE_TIME_TABLE[key];
  return baseTime === undefined ? null : baseTime;
}

/**
 * WA ポイントを計算する。
 * P = floor(1000 * (B / T)^3)
 *
 * T <= 0 (無効なタイム) は 0 を返す (Infinity/NaN 漏出防止)。
 */
export function calculateWaPoints(baseTime: number, time: number): number {
  if (!Number.isFinite(time) || time <= 0) return 0;
  if (!Number.isFinite(baseTime) || baseTime <= 0) return 0;
  return Math.floor(1000 * Math.pow(baseTime / time, 3));
}

export interface WaPointRecordInput {
  time: number;
  poolType: PoolType;
  gender: Gender;
  styleKey: StyleTranslationKey;
  distance: number;
  isRelaying: boolean;
}

export interface WaPointBestResult {
  points: number;
  time: number;
  poolType: PoolType;
  styleKey: StyleTranslationKey;
  distance: number;
}

/**
 * 1名のメンバーの記録群から「最も高い WA ポイント」を採用する。
 *
 * - is_relaying=true の記録は計算対象から除外する (要件5)
 * - base time が存在しない組合せ (例: LCM×IM100) はスキップする
 * - 絶対タイムが最速の記録ではなく、WA ポイントが最大の記録を採用する
 * - 有効な記録が1件も無い場合は null を返す
 */
export function getMemberBestWaPoints(records: WaPointRecordInput[]): WaPointBestResult | null {
  let best: WaPointBestResult | null = null;

  for (const record of records) {
    if (record.isRelaying) continue;

    const baseTime = getWaBaseTime(record.poolType, record.gender, record.styleKey, record.distance);
    if (baseTime === null) continue;

    const points = calculateWaPoints(baseTime, record.time);
    if (best === null || points > best.points) {
      best = {
        points,
        time: record.time,
        poolType: record.poolType,
        styleKey: record.styleKey,
        distance: record.distance,
      };
    }
  }

  return best;
}

/**
 * マイページ「ベストタイム表」WAポイントトグル用の薄い候補型。
 *
 * ★ isRelaying フィールドを意図的に持たない。
 *   WAポイントは非リレー記録のみが対象 (D1)。リレー記録の除外は呼び出し側
 *   (BestTimesTable) の責務とし、この型自体にフィールドを設けないことで
 *   「呼び出し側が非リレーに絞り込んだ配列しか渡せない」ことを構造的に強制する。
 */
export interface WaPointsCellCandidate {
  time: number;
  poolType: PoolType;
}

export interface WaPointsCellResult {
  points: number;
  time: number;
  poolType: PoolType;
}

/**
 * 1つの style/distance について、候補群 (呼び出し側が既に非リレーに絞り込んだもの)
 * の中から WA ポイントが最大の1件を返す。
 *
 * - candidates が空 → null
 * - base time が存在しない候補 (getWaBaseTime が null を返す組合せ) は除外する
 * - base time のある候補が1件も無い場合 → null
 * - 絶対タイムが最速の候補ではなく、WA ポイントが最大の候補を採用する
 *   (ALLタブで短水路/長水路が混在する場合、タイムが遅くても得点が高い方を選ぶ)
 */
export function getBestWaPointsForCandidates(
  candidates: WaPointsCellCandidate[],
  gender: Gender,
  styleKey: StyleTranslationKey,
  distance: number,
): WaPointsCellResult | null {
  let best: WaPointsCellResult | null = null;

  for (const candidate of candidates) {
    const baseTime = getWaBaseTime(candidate.poolType, gender, styleKey, distance);
    if (baseTime === null) continue;

    const points = calculateWaPoints(baseTime, candidate.time);
    if (best === null || points > best.points) {
      best = { points, time: candidate.time, poolType: candidate.poolType };
    }
  }

  return best;
}

export interface MemberWaPointsInput {
  memberId: string;
  displayName: string;
  records: WaPointRecordInput[];
}

export interface WaPointRankingEntry extends WaPointBestResult {
  rank: number;
  memberId: string;
  displayName: string;
}

/**
 * チームメンバーを WA ポイント (各メンバーの最大値) の降順でランキングする。
 *
 * - 有効な記録の無いメンバーは除外する
 * - 同点でも連番の rank を振る (dense rank ではない。index+1 方式)
 */
export function rankMembersByWaPoints(members: MemberWaPointsInput[]): WaPointRankingEntry[] {
  const entries = members
    .map((member) => {
      const best = getMemberBestWaPoints(member.records);
      if (best === null) return null;
      return {
        ...best,
        memberId: member.memberId,
        displayName: member.displayName,
      };
    })
    .filter((entry): entry is Omit<WaPointRankingEntry, "rank"> => entry !== null)
    .sort((a, b) => b.points - a.points);

  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}
