/**
 * 動画アップロード API の所有権/代理権限判定ヘルパー
 *
 * 個人動画 (本人所有) は本人のみ操作可。
 * 代理動画 (チーム練習ログ / チーム記録) は、対象が属する team の active admin が操作可。
 * これにより、コーチがメンバーに代理添付する動画の upload-url / confirm が通る。
 *
 * 認可モデルの代理枝 (admin OR) は records / practice_logs の代理 UPDATE RLS と同型:
 *   本人判定 (下記に注意)
 *   OR
 *   ( 当該 team が存在 (team_id NOT NULL)
 *     AND caller が当該 team の active admin (is_active=true AND role='admin')
 *     AND 対象行の owner (record.user_id / practice_log.user_id) が当該 team の active member )
 *
 * 最後の「対象 owner が active member」条件を API 認可でも検証することで、RLS と
 * 認可を一致させる。退会済みメンバーの過去行に admin が代理操作しようとした場合、
 * RLS では 0 行更新になるが、API 側で早期 403 にして loud に弾く (W-a)。
 *
 * 「本人」判定は record と practice-log で同じ列を基準にしている:
 * - record: records.user_id = caller。records は team_id を直接持つ (チーム記録)。
 *   team_id が NULL の個人記録は本人のみ。
 * - practice-log: authorizePracticeLogVideoMutation は practice_logs.user_id
 *   (ログの所有者 = 動画が紐づくメンバー) === caller を「本人」として早期
 *   ok:true を返す。RLS (20260803000002_practice_logs_owner_self_update.sql) も
 *   同じ practice_logs.user_id を「本人」として UPDATE を許可する枝を持つため、
 *   このヘルパーの判定と RLS は一致する (2026-08-03 のプロダクト判断で、選手が
 *   コーチ代理入力ログの動画を自分で削除できるようにするため、practice_logs の
 *   RLS に「本人 = practice_logs.user_id」の枝を追加した。従来は「本人」枝が
 *   practices.user_id (練習の作成者) のみを見ており、選手本人でも代理入力された
 *   ログを更新できない不一致があった)。
 *   呼び出し側 (削除 API) は DB 更新を R2 削除より先に行い影響行数 0 を検知して
 *   から R2 側を削除する多層防御を維持している。これはこのヘルパーと RLS の
 *   一致が将来また崩れた場合や、その他の予期しない 0 行更新に対しても
 *   「ファイルだけ消えて DB は不整合」という不可逆な破壊を避けるためであり、
 *   現在の一致状態に依存しない安全策として意図的に残している。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";

/** caller が指定 team の active admin か (is_team_admin と同型) */
async function isActiveTeamAdmin(
  supabase: SupabaseClient<Database>,
  teamId: string,
  callerId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("team_memberships")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", callerId)
    .eq("role", "admin")
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}

/** 対象 user が指定 team の active member か (is_team_member と同型) */
async function isActiveTeamMember(
  supabase: SupabaseClient<Database>,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("team_memberships")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}

export type VideoAuthzResult =
  | { ok: true }
  | { ok: false; status: 403 | 404; error: string };

/**
 * record に対する操作権限を判定する。
 * 本人所有、またはチーム記録 (team_id あり) で caller が当該 team の active admin なら許可。
 */
export async function authorizeRecordVideoMutation(
  supabase: SupabaseClient<Database>,
  recordId: string,
  callerId: string,
): Promise<VideoAuthzResult> {
  const { data: record, error } = await supabase
    .from("records")
    .select("id, user_id, team_id")
    .eq("id", recordId)
    .single();

  if (error || !record) {
    return { ok: false, status: 404, error: "記録が見つかりません" };
  }

  if (record.user_id === callerId) {
    return { ok: true };
  }

  // 代理: チーム記録のみ、当該 team の active admin かつ
  // 対象 record の owner が当該 team の active member の場合に限り許可。
  // (RLS の代理 UPDATE 条件と一致させ、退会済みメンバーの行を弾く)
  if (
    record.team_id &&
    (await isActiveTeamAdmin(supabase, record.team_id, callerId)) &&
    (await isActiveTeamMember(supabase, record.team_id, record.user_id))
  ) {
    return { ok: true };
  }

  return { ok: false, status: 403, error: "権限がありません" };
}

/**
 * practice-log に対する操作権限を判定する。
 * 本人所有 (practice_logs.user_id = caller)、またはチーム練習 (practice.team_id あり)
 * で caller が当該 team の active admin なら許可。
 *
 * ここでの「本人」(practice_logs.user_id) は、RLS の UPDATE ポリシー
 * (20260803000002_practice_logs_owner_self_update.sql) が定義する
 * ログ所有者本人の枝と一致する。ファイル冒頭のモジュール docstring 参照。
 */
export async function authorizePracticeLogVideoMutation(
  supabase: SupabaseClient<Database>,
  practiceLogId: string,
  callerId: string,
): Promise<VideoAuthzResult> {
  const { data: log, error } = await supabase
    .from("practice_logs")
    .select("id, user_id, practice_id")
    .eq("id", practiceLogId)
    .single();

  if (error || !log) {
    return { ok: false, status: 404, error: "練習ログが見つかりません" };
  }

  if (log.user_id === callerId) {
    return { ok: true };
  }

  // 代理: 練習ログが属する practice の team を辿り、当該 team の active admin かつ
  // 対象ログの owner (log.user_id) が当該 team の active member の場合に限り許可。
  // (RLS の代理 UPDATE 条件と一致させ、退会済みメンバーの行を弾く)
  const { data: practice } = await supabase
    .from("practices")
    .select("team_id")
    .eq("id", log.practice_id)
    .single();

  if (
    practice?.team_id &&
    (await isActiveTeamAdmin(supabase, practice.team_id, callerId)) &&
    (await isActiveTeamMember(supabase, practice.team_id, log.user_id))
  ) {
    return { ok: true };
  }

  return { ok: false, status: 403, error: "権限がありません" };
}
