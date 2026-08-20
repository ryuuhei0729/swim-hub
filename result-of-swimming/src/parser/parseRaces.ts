// =============================================================================
// parser/parseRaces.ts - /games/{code}/races (種目ツリー) を取得対象へ平坦化
// =============================================================================
// ツリー構造 (Phase 0 実測):
//   race_date -> race_genders[] -> held_styles[] -> held_distances[] -> classes[] -> race_divisions[]
// リレー (swimming_style 6/7) は LAP 比率の意味が違う (引き継ぎスタート) ため除外する。
// =============================================================================
import type { Stroke } from "@shared/racePace";
import { isRelayStyle, toDistance, toStroke } from "./enums";

export interface RaceTarget {
  gameCode: string;
  raceDate?: string;
  genderCode: number;
  swimmingStyleCode: number;
  distanceCode: number;
  classCode: number;
  raceDivisionCode: number;

  stroke: Stroke;
  distance: number;
  className?: string;
  roundName?: string;
}

export function flattenRaceTree(response: unknown, gameCode: string): RaceTarget[] {
  const days = (response as { data?: unknown[] })?.data;
  if (!Array.isArray(days)) return [];

  const targets: RaceTarget[] = [];

  for (const day of days) {
    const raceDate = (day as { race_date?: string })?.race_date;
    for (const rg of (day as { race_genders?: unknown[] })?.race_genders ?? []) {
      const genderCode = (rg as { gender?: { code?: number } })?.gender?.code;
      if (typeof genderCode !== "number") continue;

      for (const style of (rg as { held_styles?: unknown[] })?.held_styles ?? []) {
        const styleCode = (style as { swimming_style?: { code?: number } })?.swimming_style?.code;
        if (typeof styleCode !== "number") continue;
        if (isRelayStyle(styleCode)) continue;

        const stroke = toStroke(styleCode);
        if (stroke === "unknown") continue;

        for (const hd of (style as { held_distances?: unknown[] })?.held_distances ?? []) {
          const distanceNode = (hd as { distance?: { code?: number; name?: string } })?.distance;
          const distanceCode = distanceNode?.code;
          const distance = toDistance(distanceNode);
          if (typeof distanceCode !== "number" || distance === null) continue;

          for (const cls of (hd as { classes?: unknown[] })?.classes ?? []) {
            const classNode = (cls as { class?: { code?: number; name?: string } })?.class;
            const classCode = classNode?.code;
            if (typeof classCode !== "number") continue;

            for (const rd of (cls as { race_divisions?: unknown[] })?.race_divisions ?? []) {
              const div = (rd as { division?: { code?: number; name?: string } })?.division;
              if (typeof div?.code !== "number") continue;

              targets.push({
                gameCode,
                raceDate,
                genderCode,
                swimmingStyleCode: styleCode,
                distanceCode,
                classCode,
                raceDivisionCode: div.code,
                stroke,
                distance,
                className: classNode?.name,
                roundName: div.name,
              });
            }
          }
        }
      }
    }
  }

  return targets;
}
