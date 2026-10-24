// =============================================================================
// domesticRecords.test.ts
// ベストタイム表「比較指標プルダウン」機能 (Sprint Contract) 検証観点
//
// 対象: packages/shared/utils/domesticRecords.ts (新規追加 API)
//   export type AgeCategory = "elementary" | "juniorHigh" | "highSchool" | "university" | "general";
//   export const AGE_CATEGORY_ORDER: readonly AgeCategory[];
//   export function getDomesticRecordTime(category, poolType, gender, styleKey, distance): number | null;
//   export function resolveAgeCategory(birthday: string | null | undefined, today?: Date): AgeCategory | null;
//   export function getBestDomesticPointsForCandidates(candidates, category, gender, styleKey, distance): WaPointsCellResult | null;
//
// 現時点で domesticRecords.ts は未実装のため、本テストは import 解決エラーで全滅する。
// これは意図的な「検出器」であり、Developer 実装後に green になることを Sprint Contract の
// 完了条件とする (既存 packages/shared/__tests__/utils/waPointsCellCandidate.test.ts と同方針)。
//
// Sprint Contract 検証観点:
//   [V-DR-01] VERIFIED_DATA.md (scratchpad, PM が328/328一致・差異0を確認済み) の全349件が
//             getDomesticRecordTime 経由で1件も欠落・改変なく取得できる
//   [V-DR-02] 長水路(poolType=1)の100m個人メドレーは全カテゴリで存在せず null (WAと同じ制約)
//   [V-DR-03] 学童記録(長水路)の女子1500m自由形はキー自体が無く null (学童カテゴリのみの制約。
//             他4カテゴリでは同じ組合せが実在することとの対比で検証する)
//   [V-DR-04] 種目・距離として無効な組合せ (個人メドレー50/800、平泳ぎ・背泳ぎ・バタフライ400/800)
//             は全カテゴリで null
//   [V-DR-05] 不変条件「日本記録(general) <= 全カテゴリの対応する記録」が349件から導出される
//             全ペアで成立する (VERIFIED_DATA.md で実測済み・違反0を再確認)
//   [V-DR-06] resolveAgeCategory: 学校年度(4/1)境界 — 1月/2月/3月に閲覧した場合は前年度の4/1を
//             基準にする (最重要。素朴に「今年の4/1」と書くと年度末3ヶ月間だけ区分が1つ若くズレる)
//   [V-DR-07] resolveAgeCategory: 早生まれ境界 (3/31生まれ・4/1生まれ・4/2生まれの3点)
//   [V-DR-08] resolveAgeCategory: 各区分の境界年齢ちょうど (11→12 / 14→15 / 17→18 / 21→22)
//   [V-DR-09] resolveAgeCategory: birthday が null/undefined/不正文字列 → null
//             (`?? "general"` 等のフォールバックを禁止。既存の「gender が undefined なら
//             常に『—』」という契約と対称にする)
//   [V-DR-10] 「学童 >= 中学 >= 高校」は成り立たない (女子50m平泳ぎ長水路で中学記録の方が
//             高校記録より速い逆転が実在する)。これを invariant として書くと必ず落ちるため、
//             逆に「壊れていないこと」を実データで確認する対照テストとして書く
//   [V-DR-11] getBestDomesticPointsForCandidates: WA 版 (getBestWaPointsForCandidates) と同じ
//             契約 (空配列→null、base 不在候補の除外、最高得点採用であり最速タイム採用ではない、
//             floor 丸め) を国内記録ベースでも満たす
//   [V-DR-12] AGE_CATEGORY_ORDER が AgeCategory の定義順と一致する
//
// ## 期待値の作成方法 (トートロジー回避)
// [V-DR-01]〜[V-DR-05][V-DR-10] の期待値は scratchpad/VERIFIED_DATA.md の機械生成 TS ブロックを
// そのまま複写したリテラルテーブル (このファイル内の *_RECORD_TABLE_FIXTURE)。
// domesticRecords.ts の実装を呼び出して期待値を生成していない。
// [V-DR-11] の得点期待値は `node -e` で P=floor(1000*(B/T)^3) を独立に計算したハードコード値
// (VERIFIED_DATA.md のタイムを base として使用)。
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  getDomesticRecordTime,
  resolveAgeCategory,
  getBestDomesticPointsForCandidates,
  AGE_CATEGORY_ORDER,
  type AgeCategory,
} from "../../utils/domesticRecords";
import type { PoolType, Gender } from "../../utils/waPoints";
import type { StyleTranslationKey } from "../../utils/swimStyles";

// ---------------------------------------------------------------------------
// VERIFIED_DATA.md (scratchpad/VERIFIED_DATA.md) 由来の literal table。
// 唯一の定義元は VERIFIED_DATA.md。手打ち転記ではなく、そこに記載された機械生成 TS ブロックを
// そのまま複写した (件数は node で機械検証済み: 70/70/70/70/69 = 349)。
// ---------------------------------------------------------------------------

// ===== 日本記録 (70 件) =====
const JAPAN_RECORD_TABLE_FIXTURE: Readonly<Record<string, number>> = {
  "0_0_Fr_50": 20.95,
  "0_0_Fr_100": 46.22,
  "0_0_Fr_200": 101.29,
  "0_0_Fr_400": 216.87,
  "0_0_Fr_800": 453.78,
  "0_0_Fr_1500": 863.26,
  "0_0_Ba_50": 22.81,
  "0_0_Ba_100": 49.65,
  "0_0_Ba_200": 108.25,
  "0_0_Br_50": 25.88,
  "0_0_Br_100": 55.77,
  "0_0_Br_200": 120.35,
  "0_0_Fly_50": 22.16,
  "0_0_Fly_100": 49.54,
  "0_0_Fly_200": 106.85,
  "0_0_IM_100": 51.29,
  "0_0_IM_200": 110.47,
  "0_0_IM_400": 234.81,
  "0_1_Fr_50": 23.95,
  "0_1_Fr_100": 51.62,
  "0_1_Fr_200": 112.64,
  "0_1_Fr_400": 239.41,
  "0_1_Fr_800": 492.98,
  "0_1_Fr_1500": 944.84,
  "0_1_Ba_50": 25.95,
  "0_1_Ba_100": 55.23,
  "0_1_Ba_200": 120.18,
  "0_1_Br_50": 29.57,
  "0_1_Br_100": 64.01,
  "0_1_Br_200": 135.76,
  "0_1_Fly_50": 24.71,
  "0_1_Fly_100": 55.1,
  "0_1_Fly_200": 122.96,
  "0_1_IM_100": 57.75,
  "0_1_IM_200": 123.93,
  "0_1_IM_400": 262.73,
  "1_0_Fr_50": 21.64,
  "1_0_Fr_100": 47.85,
  "1_0_Fr_200": 104.54,
  "1_0_Fr_400": 223.9,
  "1_0_Fr_800": 467.81,
  "1_0_Fr_1500": 882.59,
  "1_0_Ba_50": 24.24,
  "1_0_Ba_100": 52.24,
  "1_0_Ba_200": 112.51,
  "1_0_Br_50": 26.65,
  "1_0_Br_100": 58.54,
  "1_0_Br_200": 126.4,
  "1_0_Fly_50": 23.06,
  "1_0_Fly_100": 50.81,
  "1_0_Fly_200": 112.53,
  "1_0_IM_200": 115.07,
  "1_0_IM_400": 246.05,
  "1_1_Fr_50": 24.21,
  "1_1_Fr_100": 52.79,
  "1_1_Fr_200": 114.85,
  "1_1_Fr_400": 245.19,
  "1_1_Fr_800": 503.11,
  "1_1_Fr_1500": 958.55,
  "1_1_Ba_50": 27.51,
  "1_1_Ba_100": 58.7,
  "1_1_Ba_200": 127.13,
  "1_1_Br_50": 30.1,
  "1_1_Br_100": 65.19,
  "1_1_Br_200": 139.65,
  "1_1_Fly_50": 25.11,
  "1_1_Fly_100": 56.08,
  "1_1_Fly_200": 124.69,
  "1_1_IM_200": 127.91,
  "1_1_IM_400": 270.82,
};

// ===== 学生記録 (70 件) =====
const UNIVERSITY_RECORD_TABLE_FIXTURE: Readonly<Record<string, number>> = {
  "0_0_Fr_50": 21.25,
  "0_0_Fr_100": 46.72,
  "0_0_Fr_200": 102.51,
  "0_0_Fr_400": 218.54,
  "0_0_Fr_800": 457.23,
  "0_0_Fr_1500": 871.64,
  "0_0_Ba_50": 22.88,
  "0_0_Ba_100": 50.07,
  "0_0_Ba_200": 108.84,
  "0_0_Br_50": 26.05,
  "0_0_Br_100": 56.34,
  "0_0_Br_200": 122.03,
  "0_0_Fly_50": 22.16,
  "0_0_Fly_100": 49.83,
  "0_0_Fly_200": 106.85,
  "0_0_IM_100": 51.3,
  "0_0_IM_200": 110.47,
  "0_0_IM_400": 236.33,
  "0_1_Fr_50": 24.22,
  "0_1_Fr_100": 51.83,
  "0_1_Fr_200": 113.52,
  "0_1_Fr_400": 239.41,
  "0_1_Fr_800": 492.98,
  "0_1_Fr_1500": 944.84,
  "0_1_Ba_50": 26.1,
  "0_1_Ba_100": 55.23,
  "0_1_Ba_200": 120.18,
  "0_1_Br_50": 30.04,
  "0_1_Br_100": 64.05,
  "0_1_Br_200": 136.73,
  "0_1_Fly_50": 25.26,
  "0_1_Fly_100": 56.21,
  "0_1_Fly_200": 123.55,
  "0_1_IM_100": 57.77,
  "0_1_IM_200": 125.99,
  "0_1_IM_400": 264.03,
  "1_0_Fr_50": 21.9,
  "1_0_Fr_100": 48.29,
  "1_0_Fr_200": 104.54,
  "1_0_Fr_400": 223.9,
  "1_0_Fr_800": 467.92,
  "1_0_Fr_1500": 882.59,
  "1_0_Ba_50": 24.24,
  "1_0_Ba_100": 52.24,
  "1_0_Ba_200": 112.51,
  "1_0_Br_50": 26.96,
  "1_0_Br_100": 59.18,
  "1_0_Br_200": 126.4,
  "1_0_Fly_50": 23.06,
  "1_0_Fly_100": 51.08,
  "1_0_Fly_200": 112.7,
  "1_0_IM_200": 115.07,
  "1_0_IM_400": 246.05,
  "1_1_Fr_50": 24.78,
  "1_1_Fr_100": 53.83,
  "1_1_Fr_200": 116.82,
  "1_1_Fr_400": 245.25,
  "1_1_Fr_800": 503.11,
  "1_1_Fr_1500": 958.59,
  "1_1_Ba_50": 27.88,
  "1_1_Ba_100": 59.14,
  "1_1_Ba_200": 127.81,
  "1_1_Br_50": 30.9,
  "1_1_Br_100": 66.25,
  "1_1_Br_200": 140.72,
  "1_1_Fly_50": 25.49,
  "1_1_Fly_100": 57.31,
  "1_1_Fly_200": 124.69,
  "1_1_IM_200": 127.91,
  "1_1_IM_400": 271.42,
};

// ===== 高校記録 (70 件) =====
const HIGH_SCHOOL_RECORD_TABLE_FIXTURE: Readonly<Record<string, number>> = {
  "0_0_Fr_50": 21.7,
  "0_0_Fr_100": 47.07,
  "0_0_Fr_200": 101.47,
  "0_0_Fr_400": 220.72,
  "0_0_Fr_800": 454.93,
  "0_0_Fr_1500": 863.26,
  "0_0_Ba_50": 23.42,
  "0_0_Ba_100": 50.77,
  "0_0_Ba_200": 110.32,
  "0_0_Br_50": 26.18,
  "0_0_Br_100": 56.65,
  "0_0_Br_200": 121.24,
  "0_0_Fly_50": 22.78,
  "0_0_Fly_100": 50.44,
  "0_0_Fly_200": 110.51,
  "0_0_IM_100": 52.86,
  "0_0_IM_200": 112.48,
  "0_0_IM_400": 239.15,
  "0_1_Fr_50": 23.95,
  "0_1_Fr_100": 51.62,
  "0_1_Fr_200": 112.64,
  "0_1_Fr_400": 240.24,
  "0_1_Fr_800": 495.25,
  "0_1_Fr_1500": 960.66,
  "0_1_Ba_50": 26.23,
  "0_1_Ba_100": 56.15,
  "0_1_Ba_200": 122.54,
  "0_1_Br_50": 30.21,
  "0_1_Br_100": 64.32,
  "0_1_Br_200": 136.92,
  "0_1_Fly_50": 24.71,
  "0_1_Fly_100": 55.1,
  "0_1_Fly_200": 122.96,
  "0_1_IM_100": 57.75,
  "0_1_IM_200": 125.41,
  "0_1_IM_400": 268.19,
  "1_0_Fr_50": 22.46,
  "1_0_Fr_100": 48.75,
  "1_0_Fr_200": 105.67,
  "1_0_Fr_400": 225.84,
  "1_0_Fr_800": 467.81,
  "1_0_Fr_1500": 890.18,
  "1_0_Ba_50": 25.15,
  "1_0_Ba_100": 53.58,
  "1_0_Ba_200": 115.12,
  "1_0_Br_50": 26.98,
  "1_0_Br_100": 58.54,
  "1_0_Br_200": 126.59,
  "1_0_Fly_50": 23.65,
  "1_0_Fly_100": 51.92,
  "1_0_Fly_200": 115.08,
  "1_0_IM_200": 116.53,
  "1_0_IM_400": 248.69,
  "1_1_Fr_50": 24.21,
  "1_1_Fr_100": 52.79,
  "1_1_Fr_200": 114.85,
  "1_1_Fr_400": 248.37,
  "1_1_Fr_800": 507.24,
  "1_1_Fr_1500": 973.8,
  "1_1_Ba_50": 27.82,
  "1_1_Ba_100": 59.2,
  "1_1_Ba_200": 128.13,
  "1_1_Br_50": 31.33,
  "1_1_Br_100": 65.88,
  "1_1_Br_200": 141.09,
  "1_1_Fly_50": 25.11,
  "1_1_Fly_100": 56.08,
  "1_1_Fly_200": 126,
  "1_1_IM_200": 129.68,
  "1_1_IM_400": 275.39,
};

// ===== 中学記録 (70 件) =====
const JUNIOR_HIGH_RECORD_TABLE_FIXTURE: Readonly<Record<string, number>> = {
  "0_0_Fr_50": 22.11,
  "0_0_Fr_100": 48.35,
  "0_0_Fr_200": 105.68,
  "0_0_Fr_400": 226.02,
  "0_0_Fr_800": 473.54,
  "0_0_Fr_1500": 894,
  "0_0_Ba_50": 23.75,
  "0_0_Ba_100": 51.77,
  "0_0_Ba_200": 113.49,
  "0_0_Br_50": 27.05,
  "0_0_Br_100": 58.49,
  "0_0_Br_200": 125.28,
  "0_0_Fly_50": 22.93,
  "0_0_Fly_100": 51.08,
  "0_0_Fly_200": 113.5,
  "0_0_IM_100": 53.49,
  "0_0_IM_200": 114.38,
  "0_0_IM_400": 246.49,
  "0_1_Fr_50": 24.51,
  "0_1_Fr_100": 53.25,
  "0_1_Fr_200": 115.92,
  "0_1_Fr_400": 243.62,
  "0_1_Fr_800": 503.19,
  "0_1_Fr_1500": 980.69,
  "0_1_Ba_50": 26.92,
  "0_1_Ba_100": 58.11,
  "0_1_Ba_200": 123.48,
  "0_1_Br_50": 30.6,
  "0_1_Br_100": 65.64,
  "0_1_Br_200": 139.05,
  "0_1_Fly_50": 26.08,
  "0_1_Fly_100": 56.67,
  "0_1_Fly_200": 124.8,
  "0_1_IM_100": 59.72,
  "0_1_IM_200": 127.5,
  "0_1_IM_400": 268.71,
  "1_0_Fr_50": 23,
  "1_0_Fr_100": 49.79,
  "1_0_Fr_200": 108.86, // [公式PDF採用] 1:48.86
  "1_0_Fr_400": 233.84,
  "1_0_Fr_800": 485.28,
  "1_0_Fr_1500": 925.32,
  "1_0_Ba_50": 25.46,
  "1_0_Ba_100": 55.05,
  "1_0_Ba_200": 119.71,
  "1_0_Br_50": 27.86, // [公式PDF採用]
  "1_0_Br_100": 60.92, // [公式PDF採用] 1:00.92
  "1_0_Br_200": 131.13,
  "1_0_Fly_50": 23.87, // [公式PDF採用]
  "1_0_Fly_100": 53.07, // [公式PDF採用]
  "1_0_Fly_200": 117.66,
  "1_0_IM_200": 119.26,
  "1_0_IM_400": 256.5,
  "1_1_Fr_50": 24.74,
  "1_1_Fr_100": 53.99,
  "1_1_Fr_200": 118.01,
  "1_1_Fr_400": 250.56,
  "1_1_Fr_800": 515.45,
  "1_1_Fr_1500": 985.62,
  "1_1_Ba_50": 28.21,
  "1_1_Ba_100": 60.12,
  "1_1_Ba_200": 129.52,
  "1_1_Br_50": 31.15,
  "1_1_Br_100": 67.1,
  "1_1_Br_200": 143.43,
  "1_1_Fly_50": 26.17,
  "1_1_Fly_100": 57.56,
  "1_1_Fly_200": 127.89,
  "1_1_IM_200": 131.45,
  "1_1_IM_400": 276.71,
};

// ===== 学童記録 (69 件、女子長水路1500m自由形のキーが無い) =====
const ELEMENTARY_RECORD_TABLE_FIXTURE: Readonly<Record<string, number>> = {
  "0_0_Fr_50": 23.82,
  "0_0_Fr_100": 52.42,
  "0_0_Fr_200": 114.7,
  "0_0_Fr_400": 246.16,
  "0_0_Fr_800": 510.39,
  "0_0_Fr_1500": 963.16,
  "0_0_Ba_50": 26.29,
  "0_0_Ba_100": 56.52,
  "0_0_Ba_200": 123.87,
  "0_0_Br_50": 29.96,
  "0_0_Br_100": 64.63,
  "0_0_Br_200": 138.05,
  "0_0_Fly_50": 25.14,
  "0_0_Fly_100": 56.19,
  "0_0_Fly_200": 126.42,
  "0_0_IM_100": 59.64,
  "0_0_IM_200": 125.5,
  "0_0_IM_400": 267.75,
  "0_1_Fr_50": 25.6,
  "0_1_Fr_100": 55.72,
  "0_1_Fr_200": 120.92,
  "0_1_Fr_400": 254.96,
  "0_1_Fr_800": 528.47,
  "0_1_Fr_1500": 1016.12, // [原典で参考記録] 16:56.12
  "0_1_Ba_50": 27.7,
  "0_1_Ba_100": 60.1,
  "0_1_Ba_200": 130.55,
  "0_1_Br_50": 31.73,
  "0_1_Br_100": 67.53,
  "0_1_Br_200": 144.56,
  "0_1_Fly_50": 26.72,
  "0_1_Fly_100": 59.44,
  "0_1_Fly_200": 132.95,
  "0_1_IM_100": 63.62,
  "0_1_IM_200": 132.44,
  "0_1_IM_400": 284.81,
  "1_0_Fr_50": 24.85,
  "1_0_Fr_100": 54.27,
  "1_0_Fr_200": 119.11,
  "1_0_Fr_400": 250.78,
  "1_0_Fr_800": 526.89,
  "1_0_Fr_1500": 994.64,
  "1_0_Ba_50": 27.77,
  "1_0_Ba_100": 59.55,
  "1_0_Ba_200": 128.87,
  "1_0_Br_50": 30.95,
  "1_0_Br_100": 67.16,
  "1_0_Br_200": 142.77,
  "1_0_Fly_50": 26.28,
  "1_0_Fly_100": 58.16,
  "1_0_Fly_200": 130.88,
  "1_0_IM_200": 129.42,
  "1_0_IM_400": 279.57,
  "1_1_Fr_50": 26.06,
  "1_1_Fr_100": 56.83,
  "1_1_Fr_200": 124.29,
  "1_1_Fr_400": 264.04,
  "1_1_Fr_800": 545.15,
  // "1_1_Fr_1500" は原典に存在しない (女子長水路1500m自由形の記録なし)
  "1_1_Ba_50": 29.17,
  "1_1_Ba_100": 62.54,
  "1_1_Ba_200": 136.95,
  "1_1_Br_50": 32.91,
  "1_1_Br_100": 70.35,
  "1_1_Br_200": 147.63,
  "1_1_Fly_50": 27.43,
  "1_1_Fly_100": 61.43,
  "1_1_Fly_200": 135.48,
  "1_1_IM_200": 137.02,
  "1_1_IM_400": 294.23,
};

const CATEGORY_TABLE_FIXTURES: Record<AgeCategory, Readonly<Record<string, number>>> = {
  general: JAPAN_RECORD_TABLE_FIXTURE,
  university: UNIVERSITY_RECORD_TABLE_FIXTURE,
  highSchool: HIGH_SCHOOL_RECORD_TABLE_FIXTURE,
  juniorHigh: JUNIOR_HIGH_RECORD_TABLE_FIXTURE,
  elementary: ELEMENTARY_RECORD_TABLE_FIXTURE,
};

// 件数の恒等性チェック用 (transcription 破損の早期検出。VERIFIED_DATA.md 実測値)
const EXPECTED_COUNTS: Record<AgeCategory, number> = {
  general: 70,
  university: 70,
  highSchool: 70,
  juniorHigh: 70,
  elementary: 69,
};

function parseKey(key: string): {
  poolType: PoolType;
  gender: Gender;
  styleKey: StyleTranslationKey;
  distance: number;
} {
  const parts = key.split("_");
  const poolTypeStr = parts[0] as string;
  const genderStr = parts[1] as string;
  const styleKey = parts[2] as StyleTranslationKey;
  const distanceStr = parts[3] as string;
  return {
    poolType: Number(poolTypeStr) as PoolType,
    gender: Number(genderStr) as Gender,
    styleKey,
    distance: Number(distanceStr),
  };
}

// =============================================================================
// [V-DR-01] VERIFIED_DATA.md 全349件の網羅一致
// =============================================================================

describe("[V-DR-01] getDomesticRecordTime: VERIFIED_DATA.md 全349件の網羅一致", () => {
  (Object.keys(CATEGORY_TABLE_FIXTURES) as AgeCategory[]).forEach((category) => {
    const fixture = CATEGORY_TABLE_FIXTURES[category];
    const entries = Object.entries(fixture);

    it(`category="${category}" の件数が VERIFIED_DATA.md と一致する (${EXPECTED_COUNTS[category]}件)`, () => {
      expect(entries).toHaveLength(EXPECTED_COUNTS[category]);
    });

    describe(`category="${category}"`, () => {
      it.each(entries)(`%s -> %s 秒`, (key, expected) => {
        const { poolType, gender, styleKey, distance } = parseKey(key);
        expect(getDomesticRecordTime(category, poolType, gender, styleKey, distance)).toBe(expected);
      });
    });
  });

  it("全カテゴリ合計が349件である (VERIFIED_DATA.md の総件数)", () => {
    const total = Object.values(CATEGORY_TABLE_FIXTURES).reduce(
      (sum, table) => sum + Object.keys(table).length,
      0,
    );
    expect(total).toBe(349);
  });
});

// =============================================================================
// [V-DR-02] 長水路100m個人メドレーは全カテゴリで存在しない (WAと同じ制約)
// =============================================================================

describe("[V-DR-02] getDomesticRecordTime: 長水路(poolType=1)の100m個人メドレーは全カテゴリで null", () => {
  const categories: AgeCategory[] = ["general", "university", "highSchool", "juniorHigh", "elementary"];
  const genders: Gender[] = [0, 1];

  for (const category of categories) {
    for (const gender of genders) {
      it(`category="${category}" gender=${gender}: poolType=1, IM, 100m -> null`, () => {
        expect(getDomesticRecordTime(category, 1, gender, "IM", 100)).toBeNull();
      });
    }
  }
});

// =============================================================================
// [V-DR-03] 学童記録(長水路)の女子1500m自由形のみキーが無い
// =============================================================================

describe("[V-DR-03] getDomesticRecordTime: 学童(長水路)女子1500m自由形は null、他カテゴリは実在する", () => {
  it('category="elementary": poolType=1, gender=1, Fr, 1500m -> null (原典に記録が存在しない)', () => {
    expect(getDomesticRecordTime("elementary", 1, 1, "Fr", 1500)).toBeNull();
  });

  it.each([
    ["general", 958.55],
    ["university", 958.59],
    ["highSchool", 973.8],
    ["juniorHigh", 985.62],
  ] as const)(
    'category="%s": 同じ組合せ (poolType=1, gender=1, Fr, 1500m) は %s 秒として実在する (学童のみの欠落であることの対比確認)',
    (category, expected) => {
      expect(getDomesticRecordTime(category, 1, 1, "Fr", 1500)).toBe(expected);
    },
  );
});

// =============================================================================
// [V-DR-04] 種目・距離として無効な組合せは全カテゴリで null
// =============================================================================

describe("[V-DR-04] getDomesticRecordTime: 無効な種目/距離の組合せは null", () => {
  const invalidCombos: Array<{ styleKey: StyleTranslationKey; distance: number }> = [
    { styleKey: "IM", distance: 50 },
    { styleKey: "IM", distance: 800 },
    { styleKey: "Br", distance: 400 },
    { styleKey: "Br", distance: 800 },
    { styleKey: "Ba", distance: 400 },
    { styleKey: "Ba", distance: 800 },
    { styleKey: "Fly", distance: 400 },
    { styleKey: "Fly", distance: 800 },
  ];
  const categories: AgeCategory[] = ["general", "elementary"];

  for (const category of categories) {
    for (const { styleKey, distance } of invalidCombos) {
      it(`category="${category}": poolType=0, gender=0, ${styleKey} ${distance}m -> null`, () => {
        expect(getDomesticRecordTime(category, 0, 0, styleKey, distance)).toBeNull();
      });
    }
  }
});

// =============================================================================
// [V-DR-05] 不変条件「日本記録(general) <= 全カテゴリの対応する記録」
// =============================================================================

describe("[V-DR-05] getDomesticRecordTime: 不変条件「日本記録 <= 全カテゴリ」(VERIFIED_DATA.md で違反0を実測済み)", () => {
  const otherCategories: AgeCategory[] = ["university", "highSchool", "juniorHigh", "elementary"];

  for (const category of otherCategories) {
    const fixture = CATEGORY_TABLE_FIXTURES[category];
    const keys = Object.keys(fixture);

    it.each(keys)(`日本記録 <= ${category} (key=%s)`, (key) => {
      const { poolType, gender, styleKey, distance } = parseKey(key);
      const nrTime = getDomesticRecordTime("general", poolType, gender, styleKey, distance);
      const categoryTime = getDomesticRecordTime(category, poolType, gender, styleKey, distance);
      // 日本記録が存在しないキーは union に含まれないため、両方 non-null のはず
      expect(nrTime).not.toBeNull();
      expect(categoryTime).not.toBeNull();
      expect(nrTime as number).toBeLessThanOrEqual(categoryTime as number);
    });
  }
});

// =============================================================================
// [V-DR-10] 「学童 >= 中学 >= 高校」は成り立たない (逆転の実在確認・対照テスト)
// =============================================================================

describe("[V-DR-10] getDomesticRecordTime: 年少カテゴリほど遅いとは限らない (女子50m平泳ぎ長水路で逆転)", () => {
  it("女子50m平泳ぎ(長水路)は中学記録(31.15)が高校記録(31.33)より速い(小さい)", () => {
    const juniorHigh = getDomesticRecordTime("juniorHigh", 1, 1, "Br", 50);
    const highSchool = getDomesticRecordTime("highSchool", 1, 1, "Br", 50);
    expect(juniorHigh).toBe(31.15);
    expect(highSchool).toBe(31.33);
    expect(juniorHigh as number).toBeLessThan(highSchool as number);
  });

  it("したがって「学童 >= 中学 >= 高校」を全種目で仮定すると誤りである (この1件が反例になる)", () => {
    const juniorHigh = getDomesticRecordTime("juniorHigh", 1, 1, "Br", 50) as number;
    const highSchool = getDomesticRecordTime("highSchool", 1, 1, "Br", 50) as number;
    // 「高校 <= 中学」(年少ほど速いという誤った仮定) は成り立たないことを明示的に確認する
    expect(highSchool <= juniorHigh).toBe(false);
  });
});

// =============================================================================
// [V-DR-06] resolveAgeCategory: 学校年度(4/1)境界 — 最重要
// =============================================================================

describe("[V-DR-06] resolveAgeCategory: 学校年度境界 (1〜3月は前年度の4/1を基準にする)", () => {
  // birthday=2011-04-01。
  // - 正しい実装: 今日が2026年1〜3月なら fiscalYear=2025 → 基準日2025-04-01 → 満14歳 → juniorHigh
  // - 素朴な実装 (「今年の4/1」決め打ち): 基準日2026-04-01 → 満15歳 → highSchool (誤り)
  // この2つの結果が食い違う日付を選んでいるため、素朴なバグを確実に検出できる。
  const BIRTHDAY = "2011-04-01";

  // NOTE: today は "T12:00:00" (正午) を明示して構築する。日付のみの文字列 ("2026-01-15" 等) を
  // new Date() に渡すと ECMA-262 の規定で UTC 深夜 0時として解釈されるため、CI 実行環境の
  // タイムゾーンによっては現地日付が前日にずれ得る (このテスト自体が壊れる)。正午を明示すれば
  // 現実的などのタイムゾーンでも同一暦日として解釈される。
  it.each([
    ["2026-01-15 (1月)", "2026-01-15T12:00:00"],
    ["2026-02-20 (2月)", "2026-02-20T12:00:00"],
    ["2026-03-31 (3月末日、年度最終日)", "2026-03-31T12:00:00"],
  ])("today=%s のとき、前年度(2025-04-01)基準の満14歳=juniorHigh になる (highSchoolではない)", (_label, todayStr) => {
    const today = new Date(todayStr);
    const result = resolveAgeCategory(BIRTHDAY, today);
    expect(result).toBe("juniorHigh");
    expect(result).not.toBe("highSchool");
  });

  it.each([
    ["2026-04-01 (4月最初の日、新年度開始)", "2026-04-01T12:00:00"],
    ["2026-04-02 (4月)", "2026-04-02T12:00:00"],
    ["2026-12-31 (年度末ではない12月)", "2026-12-31T12:00:00"],
  ])("today=%s のとき、当年度(2026-04-01)基準の満15歳=highSchool になる", (_label, todayStr) => {
    const today = new Date(todayStr);
    expect(resolveAgeCategory(BIRTHDAY, today)).toBe("highSchool");
  });
});

// =============================================================================
// [V-DR-07] resolveAgeCategory: 早生まれ境界 (3/31・4/1・4/2生まれ)
// =============================================================================

describe("[V-DR-07] resolveAgeCategory: 早生まれ境界 (基準日 2026-04-01、today=2026-09-05で固定)", () => {
  // today を 2026-09-05 (fiscalYear=2026, month>=4) に固定し、基準日を 2026-04-01 に確定させたうえで
  // 生年月日側の1日違いによる区分の変化のみを検証する。
  // (T12:00:00 = 正午を明示。タイムゾーンによる暦日ズレを避けるため。V-DR-06 の注記参照)
  const TODAY = new Date("2026-09-05T12:00:00");

  it("2014-03-31生まれ (3/31): 基準日2026-04-01時点で満12歳 -> juniorHigh", () => {
    expect(resolveAgeCategory("2014-03-31", TODAY)).toBe("juniorHigh");
  });

  it("2014-04-01生まれ (4/1、PM検算済み境界): 基準日2026-04-01時点で満12歳(中1) -> juniorHigh", () => {
    expect(resolveAgeCategory("2014-04-01", TODAY)).toBe("juniorHigh");
  });

  it("2014-04-02生まれ (4/2、PM検算済み境界・早生まれ): 誕生日未到来で満11歳(小6) -> elementary", () => {
    expect(resolveAgeCategory("2014-04-02", TODAY)).toBe("elementary");
  });

  it("2020-04-01生まれ (PM検算済み境界): 基準日2026-04-01時点で満6歳(小1) -> elementary", () => {
    expect(resolveAgeCategory("2020-04-01", TODAY)).toBe("elementary");
  });
});

// =============================================================================
// [V-DR-08] resolveAgeCategory: 各区分の境界年齢ちょうど
// =============================================================================

describe("[V-DR-08] resolveAgeCategory: 区分境界年齢ちょうど (基準日2026-04-01固定)", () => {
  const TODAY = new Date("2026-04-01T12:00:00");

  it.each([
    ["2015-04-01", 11, "elementary"],
    ["2014-04-01", 12, "juniorHigh"],
    ["2012-04-01", 14, "juniorHigh"],
    ["2011-04-01", 15, "highSchool"],
    ["2009-04-01", 17, "highSchool"],
    ["2008-04-01", 18, "university"],
    ["2005-04-01", 21, "university"],
    ["2004-04-01", 22, "general"],
  ] as const)("birthday=%s (満%i歳) -> %s", (birthday, _age, expected) => {
    expect(resolveAgeCategory(birthday, TODAY)).toBe(expected);
  });
});

// =============================================================================
// [V-DR-09] resolveAgeCategory: 不正な birthday は null (フォールバック禁止)
// =============================================================================

describe("[V-DR-09] resolveAgeCategory: birthday が null/undefined/不正文字列のとき null を返す", () => {
  const TODAY = new Date("2026-04-01T12:00:00");

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["空文字列", ""],
    ["日付として解釈不能な文字列", "not-a-date"],
    ["月が範囲外(13月)", "2020-13-45"],
    ["月日が完全に範囲外", "2020-99-99"],
  ])("birthday=%s のとき null (「一般」等へのフォールバックをしない)", (_label, birthday) => {
    expect(resolveAgeCategory(birthday, TODAY)).toBeNull();
  });

  // CLAUDE.md: 日付の format() 前に isValid() チェックが必須という既存プロジェクト規約により、
  // date-fns の isValid ベースで判定される前提。ネイティブ Date の寛容なロールオーバー
  // (例: 2020-02-30 -> 2020-03-01) を採用していないことも合わせて確認する。
  it("月は正しいが存在しない日付 (2020-02-30、うるう日換算に頼らない日) のとき null", () => {
    expect(resolveAgeCategory("2020-02-30", TODAY)).toBeNull();
  });

  // Reviewer 実測: `differenceInYears` はゼロ方向に丸めるため、1年未満先の未来日は
  // age が 0 になり `age < 0` のガードをすり抜けて誤って区分判定されてしまっていた
  // (例: today=2026-09-05 のとき「明日」の 2026-09-06 が elementary と判定されていた)。
  // 未来日そのものを直接判定する境界を検証する。
  describe("未来の生年月日 (1年未満先を含む) は age の符号に頼らず弾く", () => {
    const TODAY_SEP5 = new Date("2026-09-05T12:00:00");

    it.each([
      ["翌日", "2026-09-06"],
      ["年内の遠い未来日", "2026-12-31"],
      ["翌年度末", "2027-03-31"],
    ])("today=2026-09-05 のとき birthday=%s (%s) は未来日なので null", (_label, birthday) => {
      expect(resolveAgeCategory(birthday, TODAY_SEP5)).toBeNull();
    });

    it("birthday が today とちょうど同日のときは未来日ではないので弾かない -> elementary", () => {
      expect(resolveAgeCategory("2026-09-05", TODAY_SEP5)).toBe("elementary");
    });

    it("学校年度の基準日(4/1)より後・today以前に生まれた乳児は実在するため弾かない -> elementary", () => {
      expect(resolveAgeCategory("2026-06-01", TODAY_SEP5)).toBe("elementary");
    });
  });
});

// =============================================================================
// [V-DR-12] AGE_CATEGORY_ORDER が AgeCategory の定義順と一致する
// =============================================================================

describe("[V-DR-12] AGE_CATEGORY_ORDER: AgeCategory の定義順と一致する", () => {
  it('["elementary","juniorHigh","highSchool","university","general"] の順である', () => {
    expect(AGE_CATEGORY_ORDER).toEqual([
      "elementary",
      "juniorHigh",
      "highSchool",
      "university",
      "general",
    ]);
  });
});

// =============================================================================
// [V-DR-11] getBestDomesticPointsForCandidates
// 期待値は `node -e` で P=floor(1000*(B/T)^3) を独立に計算したハードコード値。
// =============================================================================

describe("[V-DR-11] getBestDomesticPointsForCandidates: 空配列", () => {
  it("candidates が空配列のとき null を返す", () => {
    expect(getBestDomesticPointsForCandidates([], "general", 0, "Fr", 50)).toBeNull();
  });
});

describe("[V-DR-11] getBestDomesticPointsForCandidates: base time が無い組合せは除外される", () => {
  it("長水路(poolType=1)のIM100mのみの候補は null (国内記録にも存在しない組合せ)", () => {
    const result = getBestDomesticPointsForCandidates(
      [{ time: 56.0, poolType: 1 }],
      "general",
      0,
      "IM",
      100,
    );
    expect(result).toBeNull();
  });
});

describe("[V-DR-11] getBestDomesticPointsForCandidates: 単一候補、ちょうど記録タイム", () => {
  it('category="general" (日本記録) 男子SCM自由形50m T=20.95 (=記録) -> 1000点', () => {
    const result = getBestDomesticPointsForCandidates(
      [{ time: 20.95, poolType: 0 }],
      "general",
      0,
      "Fr",
      50,
    );
    expect(result?.points).toBe(1000);
    expect(result?.time).toBe(20.95);
    expect(result?.poolType).toBe(0);
  });
});

describe("[V-DR-11] getBestDomesticPointsForCandidates: floor丸めのpin (round実装への回帰検出)", () => {
  it("学童男子SCM自由形100m base=52.42, T=53.00 -> 967 (raw=967.527..., roundなら968になり本テストがredになる)", () => {
    const result = getBestDomesticPointsForCandidates(
      [{ time: 53.0, poolType: 0 }],
      "elementary",
      0,
      "Fr",
      100,
    );
    expect(result?.points).toBe(967);
    expect(result?.points).not.toBe(968);
  });
});

describe("[V-DR-11] getBestDomesticPointsForCandidates: 最高得点採用であり最速タイム採用ではない (WA版と同じ契約)", () => {
  it("学童男子自由形100m: SCM(T=53.50,base=52.42)->940点, LCM(T=54.50,base=54.27)->987点。絶対タイムはSCMが速い(53.50<54.50)がLCMの方が高得点なのでLCMが選ばれる", () => {
    const result = getBestDomesticPointsForCandidates(
      [
        { time: 53.5, poolType: 0 }, // 絶対タイムはこちらが速い
        { time: 54.5, poolType: 1 }, // だが得点はこちらが高い
      ],
      "elementary",
      0,
      "Fr",
      100,
    );
    expect(result).not.toBeNull();
    expect(result?.points).toBe(987);
    expect(result?.poolType).toBe(1);
    expect(result?.time).toBe(54.5);
    expect(result?.points).not.toBe(940);
  });

  it("対照: 候補がSCM(53.50)のみの場合は940点がそのまま採用される", () => {
    const result = getBestDomesticPointsForCandidates(
      [{ time: 53.5, poolType: 0 }],
      "elementary",
      0,
      "Fr",
      100,
    );
    expect(result?.points).toBe(940);
    expect(result?.poolType).toBe(0);
  });
});

describe("[V-DR-11] getBestDomesticPointsForCandidates: 性別分岐 (getDomesticRecordTime への正しい委譲)", () => {
  it("学生記録 自由形50m T=22.00: 男性(base=21.25)->901点、女性(base=24.22)->1334点", () => {
    const male = getBestDomesticPointsForCandidates([{ time: 22.0, poolType: 0 }], "university", 0, "Fr", 50);
    const female = getBestDomesticPointsForCandidates([{ time: 22.0, poolType: 0 }], "university", 1, "Fr", 50);
    expect(male?.points).toBe(901);
    expect(female?.points).toBe(1334);
    expect(male?.points).not.toBe(female?.points);
  });
});

describe("[V-DR-11] getBestDomesticPointsForCandidates: カテゴリ分岐 (同じ実タイムでもカテゴリで得点が変わる。UI帰結の根拠)", () => {
  // 男子SCM自由形100m、T=48.00固定。カテゴリごとの base:
  // general=46.22 / university=46.72 / highSchool=47.07 / juniorHigh=48.35 / elementary=52.42
  it.each([
    ["general", 892],
    ["university", 922],
    ["highSchool", 942],
    ["juniorHigh", 1022],
    ["elementary", 1302],
  ] as const)("category=%s, T=48.00 -> %s点", (category, expectedPoints) => {
    const result = getBestDomesticPointsForCandidates([{ time: 48.0, poolType: 0 }], category, 0, "Fr", 100);
    expect(result?.points).toBe(expectedPoints);
  });

  it("同じ実タイム(48.00)でもカテゴリが違えば得点が異なる (少なくとも1組は不一致)", () => {
    const general = getBestDomesticPointsForCandidates([{ time: 48.0, poolType: 0 }], "general", 0, "Fr", 100);
    const elementary = getBestDomesticPointsForCandidates(
      [{ time: 48.0, poolType: 0 }],
      "elementary",
      0,
      "Fr",
      100,
    );
    expect(general?.points).not.toBe(elementary?.points);
  });
});
