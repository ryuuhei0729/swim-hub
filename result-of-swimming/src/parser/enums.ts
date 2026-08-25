// =============================================================================
// parser/enums.ts - Result of Swimming の code 体系をドメイン語彙へ写す
// =============================================================================
// Phase 0 実測値。API は {code, name} を返すため、可能なら name を優先して
// 判定する (code の意味が既存 scraping/types.ts のコメントと食い違っていた前例あり)。
// =============================================================================
import type { PoolLength, RawGender, RawStroke } from "../types";

export const GENDER_BY_CODE: Record<number, RawGender> = {
  1: "male",
  2: "female",
};

/** swimming_style.code -> styles.style。6/7 はリレーなので個人種目の語彙を持たない */
export const STROKE_BY_CODE: Record<number, RawStroke> = {
  1: "fr",
  2: "ba",
  3: "br",
  4: "fly",
  5: "im",
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
