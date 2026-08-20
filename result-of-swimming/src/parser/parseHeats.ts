// =============================================================================
// parser/parseHeats.ts - 組一覧 -> 実際に取得する組
// =============================================================================
// Phase 0 実測: heats に 100 が含まれる場合、heat=100 はその division の
// 全組をまとめた集約レスポンス (個別組の完全な上位集合)。
// 100 だけ取れば済むため、リクエスト数が大きく減る (実測 6 -> 1)。
// =============================================================================

/** 集約レスポンスを表す特別な heat 番号 */
export const AGGREGATE_HEAT = 100;

export interface HeatSelection {
  raceDivisionCode: number;
  roundName?: string;
  heats: number[];
  /** 集約 heat を使ったか (ログ・検算用) */
  usedAggregate: boolean;
}

export function selectHeats(response: unknown): HeatSelection[] {
  const rows = (response as { data?: unknown[] })?.data;
  if (!Array.isArray(rows)) return [];

  const out: HeatSelection[] = [];

  for (const row of rows) {
    const div = (row as { division?: { code?: number; name?: string } })?.division;
    const heats = (row as { heats?: unknown })?.heats;
    if (typeof div?.code !== "number" || !Array.isArray(heats)) continue;

    const numbers = heats.filter((h): h is number => typeof h === "number");
    const others = numbers.filter((h) => h !== AGGREGATE_HEAT);

    // 安全弁: 実在組が 100 以上まで伸びている division では 100 を集約と見なさない。
    // (誤認すると 99 組を静かに取り落とす)
    const canAggregate =
      numbers.includes(AGGREGATE_HEAT) &&
      others.length > 0 &&
      Math.max(...others) < AGGREGATE_HEAT;

    out.push({
      raceDivisionCode: div.code,
      roundName: div.name,
      heats: canAggregate ? [AGGREGATE_HEAT] : numbers,
      usedAggregate: canAggregate,
    });
  }

  return out;
}
