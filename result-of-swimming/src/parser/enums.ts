// =============================================================================
// parser/enums.ts - Result of Swimming の code 体系をドメイン語彙へ写す
// =============================================================================
// Phase 0 実測値。API は {code, name} を返すため、可能なら name を優先して
// 判定する (code の意味が既存 scraping/types.ts のコメントと食い違っていた前例あり)。
//
// RawStroke (../types.ts) は @shared/racePace の Stroke (= apps/shared の
// SwimStyle 型エイリアス) から導出している。つまりこのファイルは
// result-of-swimming 独自の閉じた語彙ではなく swim-hub 全体の canonical に
// 直結しており、STROKE_BY_CODE は「外部 API のコード (1-5) -> canonical」の
// 境界変換層そのもの。SwimStyle (apps/shared/types/common.ts) の値集合が
// 変わったときはこのファイルも追従が必要 (このパッケージは他スプリントの
// 変更範囲から漏れやすいので明記する)。
// =============================================================================
import type { PoolLength, RawGender, RawStroke } from "../types";

export const GENDER_BY_CODE: Record<number, RawGender> = {
  1: "male",
  2: "female",
};

/**
 * swimming_style.code -> styles.style。6/7 はリレーなので個人種目の語彙を持たない。
 * 数値コードと種目の対応 (1=自由形, 2=背泳ぎ, 3=平泳ぎ, 4=バタフライ, 5=個人メドレー) は
 * canonical 配列の並び順 (Fr, Br, Ba, Fly, IM) とは順序が異なる。ケーシングを
 * 変える際も対応関係 (特に 2=Ba, 3=Br) を機械的な並べ替えで崩さないこと。
 */
export const STROKE_BY_CODE: Record<number, RawStroke> = {
  1: "Fr",
  2: "Ba",
  3: "Br",
  4: "Fly",
  5: "IM",
};

/** リレー種目の swimming_style.code */
export const RELAY_STYLE_CODES = new Set([6, 7]);

/** game_status.code。記録確定のみ収集対象 */
export const GAME_STATUS_CONFIRMED = 5;

export function toGender(code: number | null | undefined): RawGender {
  if (code === null || code === undefined) return "unknown";
  return GENDER_BY_CODE[code] ?? "unknown";
}

export function toStroke(code: number | null | undefined): RawStroke {
  if (code === null || code === undefined) return "unknown";
  return STROKE_BY_CODE[code] ?? "unknown";
}

export function isRelayStyle(code: number | null | undefined): boolean {
  return code !== null && code !== undefined && RELAY_STYLE_CODES.has(code);
}

/**
 * waterway -> プール長。
 * code は 1=長水路(50m) / 2=短水路(25m) だが、既存コードのコメントと逆だった前例が
 * あるため name ("長水路"/"短水路") を優先し、name が無いときだけ code に落ちる。
 */
export function toPoolLength(
  waterway: { code?: number | null; name?: string | null } | null | undefined,
): PoolLength | null {
  const name = waterway?.name ?? "";
  if (name.includes("長水路")) return 50;
  if (name.includes("短水路")) return 25;
  if (waterway?.code === 1) return 50;
  if (waterway?.code === 2) return 25;
  return null;
}

/** distance.name ("100m") -> 100。name が無ければ code から引く */
const DISTANCE_BY_CODE: Record<number, number> = {
  1: 25,
  2: 50,
  3: 100,
  4: 200,
  5: 400,
  6: 800,
  7: 1500,
};

export function toDistance(
  distance: { code?: number | null; name?: string | null } | null | undefined,
): number | null {
  const m = /^(\d+)m$/.exec(distance?.name ?? "");
  if (m) return Number(m[1]);
  if (distance?.code !== null && distance?.code !== undefined) {
    return DISTANCE_BY_CODE[distance.code] ?? null;
  }
  return null;
}
