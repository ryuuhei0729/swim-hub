// =============================================================================
// ランキング順位付け - Swim Hub共通パッケージ
// チーム記録ランキング (web/mobile) が共用する純粋関数
//
// 種目/距離軸の導出は関心が別なので ./rankingStyleAxis.ts にある。
//
// 「1メンバー1行に畳む」処理をここに置かないこと。畳み込みは RPC
// `get_team_record_rankings` の p_aggregation='personalBest' が
// `ORDER BY time, competition_date, record_id` のタイブレークまで含めて
// 担っており、クライアント側に同じ畳み込みを持つと RPC のタイブレークを
// 変えた瞬間に静かに乖離する (実際に入力順先勝ちの実装が乖離していた)。
// =============================================================================

/**
 * タイム昇順に並んだ配列へ順位を付与する。
 *
 * 同着は同順位で、次の順位は同着の件数分スキップする (1, 2, 2, 4)。
 * 日本水泳連盟の順位表記に準拠する。
 *
 * **前提: `sortedAsc` は既にタイム昇順に並んでいること。** この関数は並べ替えを
 * 行わず、隣接する要素のタイムが等しいかどうかだけを見て順位を決める。未ソートの
 * 配列を渡すと順位は無意味になる (RPC `get_team_record_rankings` が
 * `ORDER BY time ASC` で返すため、その結果をそのまま渡す想定)。
 *
 * 同着判定は厳密一致 (`===`) で行う。`bestTimeBadge.ts` の `BEST_EPSILON`
 * (0.005) は「差分表示のしきい値」であって順位判定用ではなく、順位に使うと
 * 1.00 と 1.005 が同着になる。DB のタイム列は `numeric(10,2)` で小数第2位固定
 * なので 1.005 のような値は存在せず、厳密一致で十分。
 *
 * @param sortedAsc タイム昇順に並んだ行
 * @param getTime 行からタイム(秒)を取り出す関数
 */
export function assignCompetitionRanks<T>(
  sortedAsc: readonly T[],
  getTime: (item: T) => number,
): Array<T & { rank: number }> {
  const ranked: Array<T & { rank: number }> = [];
  let previousTime: number | null = null;
  let previousRank = 0;
  let position = 0;

  for (const item of sortedAsc) {
    position += 1;
    const time = getTime(item);
    const rank = previousTime !== null && time === previousTime ? previousRank : position;
    ranked.push({ ...item, rank });
    previousTime = time;
    previousRank = rank;
  }

  return ranked;
}
