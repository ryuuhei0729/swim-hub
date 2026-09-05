// =============================================================================
// regionalStandardTimes.ts - 地域大会 (東京都中学校/東京都高等学校) 参加標準記録
// =============================================================================
// `/time-level` ページ (性別・水路・種目・距離・タイムを入力し WA/都中/都高の
// 3指標を表示する) が使用する、都中・都高の基準タイム定数と評価用の純粋関数。
//
// 出典 (PM が PDF から直接抽出し、ユーザー提供の表画像と全58値を突合。差異ゼロ):
// - 都中 = 東京都中学校 参加標準記録「都選手権大会」列
//   https://file.www4.hp-ez.com/swim-jhs/file_20260511-221743.pdf
// - 都高 = 東京都高等学校「都 高 校 大 会」列 (同PDF内に春季大会/都高校大会/新人大会の
//   3表があり、採用したのは都高校大会の表のみ)
//   https://www.koutairen-suiei-tokyo.net/wp-content/uploads/2026/04/2026制限タイム.pdf
//
// ⚠ `.09` について: 都高テーブルの12値が `.09` 終端 (例: 2:15.09 / 3:00.09 / 6:00.09 /
//   5:30.09)。「3:00 ちょうど + .09」のような値が多く、原典の意図は `.00` の可能性が
//   あるが未確認。以下の4点で「PDF上の実表示が `.09` であること」自体は検証済み:
//   (a) PDF content stream の文字列リテラル (`[(2:15.09)] TJ`)
//   (b) 埋め込み TrueType subset の cmap (U+0039 → gid 28)
//   (c) gid 28 のアウトラインを目視ラスタライズし "9" と確認
//   (d) ユーザー提供の表画像と全58値を突合し差異ゼロ (2026-09-04)
//   2025年版 PDF も同一値。ユーザー判断により「PDF 表記のまま採用する」に確定した
//   (2026-09-04)。丸めたり `.00` に補正したりしないこと。
//
// 「都高の方が都中より速い」は成り立たない組合せが4件ある
// (0_IM_400 / 1_Fr_200 / 1_IM_200 / 1_IM_400。都中の方が基準タイムが厳しい)。
// 都中・都高は別団体・別大会性格であり、この非対称はバグではないので直さないこと。
//
// キー形式が waPoints.ts の WA テーブル (`${poolType}_${gender}_${styleKey}_${distance}`)
// と非対称な理由: 都中・都高はいずれも長水路 (LCM) の大会の参加標準記録・出場制限
// タイムであり、短水路の基準タイムというもの自体が存在しない。そのため poolType 次元
// を持たず `${gender}_${styleKey}_${distance}` の3パートキーにしている。
// =============================================================================

import { SWIM_STYLES } from "../types";
import type { StyleTranslationKey } from "./swimStyles";
import { calculateWaPoints, getWaBaseTime, type Gender } from "./waPoints";

/**
 * 都中 (東京都中学校 都選手権大会 参加標準記録) 基準タイムテーブル。長水路専用。
 * key: `${gender}_${styleKey}_${distance}` (gender: 0=男子 / 1=女子)
 * 精度: 小数第1位 (原典どおり)。
 *
 * 男子は自由形 1500 のみ (800 なし)、女子は自由形 800 のみ (1500 なし)。
 * 自由形以外の 50m は男女とも原典が空欄のため存在しない。
 */
const TOCHU_LCM: Readonly<Record<string, number>> = {
  "0_Fr_50": 29.5,
  "0_Fr_100": 66,
  "0_Fr_200": 137,
  "0_Fr_400": 285,
  "0_Fr_1500": 1140,
  "0_Ba_100": 74,
  "0_Ba_200": 163,
  "0_Br_100": 77,
  "0_Br_200": 168,
  "0_Fly_100": 70,
  "0_Fly_200": 166,
  "0_IM_200": 153,
  "0_IM_400": 330,
  "1_Fr_50": 32.5,
  "1_Fr_100": 72,
  "1_Fr_200": 144,
  "1_Fr_400": 293,
  "1_Fr_800": 660,
  "1_Ba_100": 80,
  "1_Ba_200": 167,
  "1_Br_100": 90,
  "1_Br_200": 196,
  "1_Fly_100": 83,
  "1_Fly_200": 185,
  "1_IM_200": 170,
  "1_IM_400": 360,
};

/**
 * 都高 (東京都高等学校「都 高 校 大 会」出場制限タイム) 基準タイムテーブル。長水路専用。
 * key: `${gender}_${styleKey}_${distance}` (gender: 0=男子 / 1=女子)
 * 精度: 小数第2位 (原典どおり。`.09` 終端の12値を含む。上部コメント参照)。
 *
 * 都中と異なり、背泳ぎ/平泳ぎ/バタフライの 50m が男女とも存在する。
 * 男子は自由形 1500 のみ (800 なし)、女子は自由形 800 のみ (1500 なし)。
 */
const TOKO_LCM: Readonly<Record<string, number>> = {
  "0_Fr_50": 27.3,
  "0_Fr_100": 58.8,
  "0_Fr_200": 135.09,
  "0_Fr_400": 272.09,
  "0_Fr_1500": 1052.69,
  "0_Ba_50": 30.2,
  "0_Ba_100": 73.09,
  "0_Ba_200": 153.3,
  "0_Br_50": 33.7,
  "0_Br_100": 74.2,
  "0_Br_200": 159.02,
  "0_Fly_50": 28.9,
  "0_Fly_100": 66.09,
  "0_Fly_200": 165.09,
  "0_IM_200": 149.09,
  "0_IM_400": 330.09,
  "1_Fr_50": 31.49,
  "1_Fr_100": 67.09,
  "1_Fr_200": 155.09,
  "1_Fr_400": 292.32,
  "1_Fr_800": 609.29,
  "1_Ba_50": 33.8,
  "1_Ba_100": 78.89,
  "1_Ba_200": 165.69,
  "1_Br_50": 37.8,
  "1_Br_100": 89.5,
  "1_Br_200": 195.09,
  "1_Fly_50": 32.1,
  "1_Fly_100": 81.84,
  "1_Fly_200": 180.09,
  "1_IM_200": 171.39,
  "1_IM_400": 360.09,
};

/**
 * 都中の基準タイム (秒) を取得する。存在しない組合せ (背/平/バタの50m、
 * 男子の800、女子の1500 等) は null を返す。
 */
export function getTochuStandardTime(
  gender: Gender,
  styleKey: StyleTranslationKey,
  distance: number,
): number | null {
  const key = `${gender}_${styleKey}_${distance}`;
  const baseTime = TOCHU_LCM[key];
  return baseTime === undefined ? null : baseTime;
}

/**
 * 都高の基準タイム (秒) を取得する。存在しない組合せ (男子の800、女子の1500 等) は
 * null を返す。
 */
export function getTokoStandardTime(
  gender: Gender,
  styleKey: StyleTranslationKey,
  distance: number,
): number | null {
  const key = `${gender}_${styleKey}_${distance}`;
  const baseTime = TOKO_LCM[key];
  return baseTime === undefined ? null : baseTime;
}

export interface StandardTimeEvaluation {
  /** calculateWaPoints(baseTime, time) をそのまま再利用した得点 (基準タイムちょうどで1000点) */
  points: number;
  /** 基準タイムを突破したか (time <= baseTime。等号を含む。原典「制限タイム以内」に準拠) */
  cleared: boolean;
  /** time - baseTime (秒)。正=未突破、負=突破 */
  diffSeconds: number;
}

/**
 * 基準タイムと対象タイムから、都中/都高ポイント・突破判定・差分秒をまとめて評価する。
 * ポイント算出式は WA ポイントと同じ 3乗式 (`calculateWaPoints` に委譲。二重定義しない)。
 *
 * `calculateWaPoints` は `time`/`baseTime` が非有限・0以下でも 0 を返すガードを持つが、
 * `cleared`/`diffSeconds` はそのガードを継承していなかった (例: time=-5 で
 * points=0 なのに cleared=true になる自己矛盾が発生していた)。この関数自身でも同じ
 * ガードを行い、評価不能なら `null` を返す。
 *
 * sentinel 値ではなく `null` を返す理由:
 * - 同ファイルの `getTochuStandardTime`/`getTokoStandardTime`、および `waPoints.ts` の
 *   `getWaBaseTime` はいずれも「無い/評価できない」を `null` で表す規約であり、それに揃える。
 * - 矛盾した組 (points=0 なのに cleared=true 等) を型レベルで作れなくするため。
 *   sentinel 値だと呼び出し元が `cleared` だけを読んで誤判定する余地が残る。
 *
 * この関数が非 null を返すとき、以下が不変条件として成立する:
 *   `cleared === true` ならば `points >= 1000`
 *   (cleared は `time <= baseTime` ⇔ `baseTime/time >= 1` ⇔ `floor(1000*(baseTime/time)^3) >= 1000`)
 */
export function evaluateStandardTime(baseTime: number, time: number): StandardTimeEvaluation | null {
  if (!Number.isFinite(baseTime) || baseTime <= 0) return null;
  if (!Number.isFinite(time) || time <= 0) return null;
  return {
    points: calculateWaPoints(baseTime, time),
    cleared: time <= baseTime,
    diffSeconds: time - baseTime,
  };
}

// 選択肢導出の距離候補。swimStyles.ts の DISTANCES は 1500 を含まない (WA/都中の
// 男子自由形1500が対象外になってしまう) ため、ここでは独自に定義する。
const SELECTABLE_DISTANCES = [50, 100, 200, 400, 800, 1500] as const;

/**
 * WA / 都中 / 都高 いずれかに基準タイムが存在する (styleKey, distance) の組を返す。
 * poolType は問わない (WA は短水路・長水路の和集合で判定)。
 *
 * 種目・距離のハードコード対応表を持たず、SWIM_STYLES × SELECTABLE_DISTANCES の
 * 全組合せを実際に3テーブルへ引いて非nullかどうかで判定する (対応表の二重管理を避ける)。
 * 返り値の順序は SWIM_STYLES の順 → 距離昇順で安定させている。
 */
export function getSelectableEvents(
  gender: Gender,
): ReadonlyArray<{ styleKey: StyleTranslationKey; distance: number }> {
  const events: { styleKey: StyleTranslationKey; distance: number }[] = [];

  for (const styleKey of SWIM_STYLES) {
    for (const distance of SELECTABLE_DISTANCES) {
      const hasWa =
        getWaBaseTime(0, gender, styleKey, distance) !== null ||
        getWaBaseTime(1, gender, styleKey, distance) !== null;
      const hasTochu = getTochuStandardTime(gender, styleKey, distance) !== null;
      const hasToko = getTokoStandardTime(gender, styleKey, distance) !== null;

      if (hasWa || hasTochu || hasToko) {
        events.push({ styleKey, distance });
      }
    }
  }

  return events;
}
