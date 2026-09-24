// =============================================================================
// チームAPI - relayRankings (チームリレー記録ランキング)
// =============================================================================
// SECURITY DEFINER RPC `get_team_relay_rankings` (20260908000100) を呼ぶ薄い境界層。
// RPC 側が「承認済みかつアクティブなメンバーだけが呼べる」「返す列を11列に限定する」を
// 担保しているので、ここでは snake_case → camelCase の写像だけを行う。
//
// 第1弾の `./rankings.ts` (個人種目) と同型。順位付与は共通の
// `assignCompetitionRanks` (utils/ranking.ts) を表示側で使う。
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import type {
  RelayGenderCategory,
  RelayKind,
  TeamRelayRankingFilters,
  TeamRelayRankingLeg,
  TeamRelayRankingRecord,
} from "../../types";
import { periodToRpcArgs } from "./rankingPeriod";

/**
 * RPC に渡す1回あたりの取得上限。RPC 側は 1〜500 にクランプする。
 * UI の「さらに表示」はここで取った行のクライアント側ページングであり、
 * サーバーへの追加リクエストは発生しない。
 */
export const TEAM_RELAY_RANKING_FETCH_LIMIT = 500;

/** RPC の `legs` JSONB 配列の1要素 (snake_case ではなく RPC 側で camelCase を組んでいる)。 */
interface TeamRelayRankingLegJson {
  legId: string;
  legIndex: number;
  userId: string | null;
  displayName: string | null;
  styleId: number;
  style: string;
  legTime: number;
  reactionTime: number | null;
}

/** RPC `get_team_relay_rankings` の戻り行 (snake_case)。 */
interface TeamRelayRankingRpcRow {
  relay_record_id: string;
  relay_kind: RelayKind;
  leg_distance: number;
  leg_count: number;
  pool_type: number;
  gender_category: RelayGenderCategory;
  total_time: number;
  competition_id: string | null;
  competition_title: string | null;
  competition_date: string | null;
  /** null を取りうる (根拠は `TeamRelayRankingRecord.relayCreatedAt` の docstring) */
  relay_created_at: string | null;
  legs: TeamRelayRankingLegJson[];
}

/**
 * `legs` を `legIndex` 昇順に整える。
 *
 * RPC は `jsonb_agg(... ORDER BY leg_index)` で既に昇順に組んでいるが、
 * **通算タイムの導出 (`calcCumulativeTimes`) は配列順に完全に依存する**ため、
 * 境界を越えた後にもう一度昇順を確定させる。順序が1つ狂うと lap 表示が
 * エラーを出さずに嘘になる (過去に通算値の混入で lap が崩れた前科がある)。
 *
 * **どのレグも値を理由に落とさない。** `userId` / `displayName` は退会で null に
 * なるが、レグが欠けると通算の積み上げがずれる。
 */
function toRankingLegs(legs: readonly TeamRelayRankingLegJson[]): TeamRelayRankingLeg[] {
  return [...legs]
    .sort((a, b) => a.legIndex - b.legIndex)
    .map((leg) => ({
      legId: leg.legId,
      legIndex: leg.legIndex,
      userId: leg.userId,
      displayName: leg.displayName,
      styleId: leg.styleId,
      style: leg.style,
      legTime: leg.legTime,
      reactionTime: leg.reactionTime,
    }));
}

/**
 * RPC の行 → `TeamRelayRankingRecord`。
 *
 * **どの列の値を理由にしても行を落とさない。** ランキングは順位の母集団が
 * そのまま表示になるため、表示専用の列の検証で行を除外すると母集団が静かに欠ける。
 *
 * - `pool_type` / `relay_kind` / `gender_category` は再検証しない。RPC が
 *   厳密一致で絞る (kind / pool_type) か CHECK 制約で保証される (gender_category)
 *   ため、検証はトートロジーになる
 * - `total_time` は `legs[].legTime` の総和で置き換えない (保存値を正とする)
 * - `relay_created_at` は null を取りうるがそのまま通す
 */
function toRelayRankingRecord(row: TeamRelayRankingRpcRow): TeamRelayRankingRecord {
  return {
    relayRecordId: row.relay_record_id,
    relayKind: row.relay_kind,
    legDistance: row.leg_distance,
    legCount: row.leg_count,
    poolType: row.pool_type,
    genderCategory: row.gender_category,
    totalTime: row.total_time,
    competitionId: row.competition_id,
    competitionTitle: row.competition_title,
    competitionDate: row.competition_date,
    relayCreatedAt: row.relay_created_at,
    legs: toRankingLegs(row.legs ?? []),
  };
}

export class TeamRelayRankingsAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * チームのリレー記録ランキングを取得する (総合タイム昇順)。
   *
   * 認証・認可は RPC 内で行うため、ここでは requireAuth を重ねない
   * (フィルタを変えるたびに auth.getUser() の往復が増えるのを避ける。
   *  第1弾 TeamRankingsAPI.getRankings と同じ方針)。
   *
   * @throws 生の `PostgrestError` をそのまま re-throw する。テーブル名・関数名・
   *   ポリシー名を含みうるため `UserFacingError` にはしない。表示側は
   *   `toUserFacingMessage(error, fallback)` で汎用文言にフォールバックする。
   */
  async getRelayRankings(
    teamId: string,
    filters: TeamRelayRankingFilters,
  ): Promise<TeamRelayRankingRecord[]> {
    const { data, error } = await this.supabase.rpc("get_team_relay_rankings", {
      p_team_id: teamId,
      p_relay_kind: filters.relayKind,
      p_leg_distance: filters.legDistance,
      p_pool_type: filters.poolType,
      // `RelayRankingGenderFilter` は DB 値と同一の3択なのでそのまま渡す。
      // RPC は NULL で「すべて」を意味する枝を持つが、UI から NULL は来ない
      // (根拠は `types/teamRelayRanking.ts` の `RelayRankingGenderFilter`)。
      p_gender_category: filters.genderCategory,
      // 個人種目版と同じ `periodToRpcArgs` を通す (期間の軸は両 RPC で同一)。
      ...periodToRpcArgs(filters.period),
      p_limit: TEAM_RELAY_RANKING_FETCH_LIMIT,
    });

    if (error) throw error;

    const rows = (data ?? []) as TeamRelayRankingRpcRow[];
    return rows.map(toRelayRankingRecord);
  }

  /**
   * このチームにリレー記録が1件でも存在するかを返す。
   *
   * 「絞り込み条件に一致するリレー記録が0件」と「チームにリレー記録が1件もない」を
   * 空状態の文言として区別するためだけに使う。ランキングが0件だったときにのみ呼ぶこと。
   *
   * 第1弾の `hasAnyRecord` と違い、**この結果は常に信用してよい**。
   * `relay_records` の SELECT RLS は `team_id` 一本 (承認済みかつアクティブな
   * メンバー) で、第1弾の `records` のような「他チームの記録は見えない」枝が
   * 存在しないため。`relay_records` はチームに属する記録しか持たない。
   */
  async hasAnyRelayRecord(teamId: string): Promise<boolean> {
    const { count, error } = await this.supabase
      .from("relay_records")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);

    if (error) throw error;

    // count は count オプション未指定時などに null になりうる。ここでは
    // 「数えられなかった = 記録が無い」とみなして空状態の文言を選ぶ。
    return count !== null && count > 0;
  }
}
