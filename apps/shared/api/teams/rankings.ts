// =============================================================================
// チームAPI - rankings (チーム記録ランキング)
// =============================================================================
// SECURITY DEFINER RPC `get_team_record_rankings` (20260907000000) を呼ぶ薄い境界層。
// RPC 側が「承認済みかつアクティブなメンバーだけが呼べる」「返す列を14列に限定する」を
// 担保しているので、ここでは snake_case → camelCase の写像と値の検証だけを行う。
//
// ⚠️ 同ディレクトリの TeamRecordsAPI (records.ts) とは無関係。あれは名前に反して
// competitions テーブルの CRUD を行う別物なので、ランキングをそこに足さない。
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import type { RankingGenderFilter, TeamRankingFilters, TeamRankingRecord } from "../../types";
import { toStyleCode } from "../../utils/swimStyles";
import { periodToRpcArgs } from "./rankingPeriod";

/**
 * RPC に渡す1回あたりの取得上限。RPC 側は 1〜500 にクランプする。
 * UI の「さらに表示」はここで取った行のクライアント側ページングであり、
 * サーバーへの追加リクエストは発生しない。
 */
export const TEAM_RANKING_FETCH_LIMIT = 500;

/**
 * `RankingGenderFilter` → `users.gender` の DB 値。
 * `users.gender` は integer NOT NULL DEFAULT 0 で CHECK (0 or 1)。0=男性 / 1=女性。
 *
 * ⚠️ RPC の `p_gender` は **NULL で「絞り込まない」**を意味する実装を持つが、
 * `RankingGenderFilter` は男子/女子の2択なのでここから NULL は出ない
 * (根拠は `types/teamRanking.ts` の `RankingGenderFilter` の docstring)。
 * 「すべて」を戻すときは NULL を返す枝をここに足すだけで済む。
 */
const GENDER_FILTER_TO_DB: Record<RankingGenderFilter, number> = {
  male: 0,
  female: 1,
};

/** RPC `get_team_record_rankings` の戻り行 (snake_case)。 */
interface TeamRankingRpcRow {
  record_id: string;
  user_id: string;
  display_name: string;
  time: number;
  style_id: number;
  style: string;
  distance: number;
  pool_type: number;
  gender: number;
  competition_id: string | null;
  competition_title: string | null;
  competition_date: string | null;
  /** null を取りうる (根拠は `TeamRankingRecord.recordCreatedAt` の docstring) */
  record_created_at: string | null;
}

/**
 * RPC の行 → `TeamRankingRecord`。
 *
 * **どの列の値を理由にしても行を落とさない。** ランキングは順位の母集団が
 * そのまま表示になるため、表示専用の列の検証で行を除外すると母集団が静かに欠ける。
 *
 * - `style` は `toStyleCode()` で canonical 化する。`as SwimStyle` の unchecked cast は
 *   使わない (過去に `.toLowerCase()` 前提の正規化コードが cast で検証を迂回し、静かに
 *   0件を返した前科がある)。canonical 化できなければ `null` をそのまま通す
 * - `pool_type` は再検証しない。RPC が `r.pool_type = p_pool_type` の厳密一致で絞るため
 *   返る値は呼び出し側が渡した値と恒等で、検証はトートロジーになる
 * - `created_at` は null を取りうるがそのまま通す (根拠は
 *   `TeamRankingRecord.recordCreatedAt` の docstring)
 */
function toRankingRecord(row: TeamRankingRpcRow): TeamRankingRecord {
  return {
    recordId: row.record_id,
    userId: row.user_id,
    displayName: row.display_name,
    time: row.time,
    styleId: row.style_id,
    style: toStyleCode(row.style),
    distance: row.distance,
    poolType: row.pool_type,
    gender: row.gender,
    competitionId: row.competition_id,
    competitionTitle: row.competition_title,
    competitionDate: row.competition_date,
    recordCreatedAt: row.record_created_at,
  };
}

export class TeamRankingsAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * チームメンバーの記録ランキングを取得する (タイム昇順)。
   *
   * 認証・認可は RPC 内で行うため、ここでは requireAuth を重ねない
   * (フィルタを変えるたびに auth.getUser() の往復が増えるのを避ける。
   *  RacePaceModelAPI.getModels と同じ方針)。
   *
   * @throws 生の `PostgrestError` をそのまま re-throw する。テーブル名・関数名・
   *   ポリシー名を含みうるため `UserFacingError` にはしない。表示側は
   *   `toUserFacingMessage(error, fallback)` で汎用文言にフォールバックする。
   */
  async getRankings(teamId: string, filters: TeamRankingFilters): Promise<TeamRankingRecord[]> {
    const { data, error } = await this.supabase.rpc("get_team_record_rankings", {
      p_team_id: teamId,
      p_scope: filters.scope,
      p_style_id: filters.styleId,
      p_pool_type: filters.poolType,
      p_gender: GENDER_FILTER_TO_DB[filters.gender],
      p_aggregation: filters.aggregation,
      // 期間の3 variant を RPC の2引数に写す。**この対応表は
      // `periodToRpcArgs` (1箇所) が定義元** — ここに三項演算子を書き足すと
      // 個人とリレーで片方だけ更新されて静かに乖離する。
      ...periodToRpcArgs(filters.period),
      p_limit: TEAM_RANKING_FETCH_LIMIT,
    });

    if (error) throw error;

    const rows = (data ?? []) as TeamRankingRpcRow[];
    return rows.map(toRankingRecord);
  }

  /**
   * このチームに大会記録が1件でも存在するかを返す。
   *
   * 「絞り込み条件に一致する記録が0件」と「チームに大会記録が1件もない」を空状態の
   * 文言として区別するためだけに使う。ランキングが0件だったときにのみ呼ぶこと。
   *
   * ⚠️ **`scope = 'teamCompetitions'` のときだけ結果を信用してよい。**
   * これは RLS 下の素のクエリなので、`records` の SELECT ポリシー3枝
   * (自分の記録 / チームメイトの個人記録 (team_id IS NULL) / 自チームの
   * チーム記録) のいずれにも当たらない行は数えられない。具体的には、メンバーが
   * **別チームの** チーム大会で出した記録 (`records.team_id` が他チーム) は
   * このチームの視点では見えず count に入らない。一方 SECURITY DEFINER の
   * RPC は `scope = 'allCompetitions'` でそれを返すため、false を「記録が
   * 1件もない」と読むと嘘になる (「チームに大会記録がありません」と出したのに
   * 種目を変えると記録が出る)。
   * `teamCompetitions` ではチーム大会の記録は `records.team_id` が NULL か
   * 自チームのどちらかなので必ず読め、結果は信用できる。
   *
   * 集計対象メンバーの述語は RPC と同じ (承認済み かつ アクティブ)。
   */
  async hasAnyRecord(teamId: string): Promise<boolean> {
    const { data: memberships, error: membershipsError } = await this.supabase
      .from("team_memberships")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("status", "approved")
      .eq("is_active", true);

    if (membershipsError) throw membershipsError;

    const memberIds = (memberships ?? []).map((membership: { user_id: string }) => membership.user_id);
    if (memberIds.length === 0) return false;

    const { count, error } = await this.supabase
      .from("records")
      .select("id", { count: "exact", head: true })
      .in("user_id", memberIds)
      .eq("is_relaying", false);

    if (error) throw error;

    // count は count オプション未指定時などに null になりうる。ここでは
    // 「数えられなかった = 記録が無い」とみなして空状態の文言を選ぶ。
    return count !== null && count > 0;
  }
}
