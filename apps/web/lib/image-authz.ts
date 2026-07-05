/**
 * 画像表示 API (署名付きURL発行) の認可判定ヘルパー
 *
 * private 化した profile-images / practice-images / competition-images の
 * オブジェクトを、以下のいずれかを満たす場合のみ閲覧許可する:
 *   - 本人所有 (パス先頭セグメント === caller の uid)
 *   - チーム共有 (practice-images / competition-images):
 *     対象の practice / competition が team に紐づき、caller が当該 team の active member
 *   - 同一チーム (profile-images):
 *     caller と画像所有者が、同一 team の active member 同士
 *     (チームメンバー一覧・練習/大会詳細でのアバター表示を壊さないため)
 *
 * パス規約 (bucket 内相対パス):
 *   - profile-images:      "{userId}/{fileName}"
 *   - practice-images:     "{userId}/{practiceId}/{fileName}"
 *   - competition-images:  "{userId}/{competitionId}/{fileName}"
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";

export const IMAGE_BUCKETS = ["profile-images", "practice-images", "competition-images"] as const;
export type ImageBucket = (typeof IMAGE_BUCKETS)[number];

export type ImageAuthzResult =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string };

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

/** caller と owner が、同一 team の active member 同士かどうか */
async function shareActiveTeam(
  supabase: SupabaseClient<Database>,
  callerId: string,
  ownerId: string,
): Promise<boolean> {
  const { data: callerTeams } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", callerId)
    .eq("is_active", true);

  const teamIds = (callerTeams ?? []).map((t) => t.team_id);
  if (teamIds.length === 0) return false;

  const { data: shared } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("user_id", ownerId)
    .eq("is_active", true)
    .in("team_id", teamIds)
    .limit(1);

  return !!shared && shared.length > 0;
}

/**
 * バケット内相対パスから、練習/大会画像の認可を判定する。
 * 本人所有、またはチーム練習/大会 (team_id あり) で caller が当該 team の active member なら許可。
 * (practice_images / competition_images テーブルの SELECT RLS と同型)
 */
async function authorizeResourceImage(
  supabase: SupabaseClient<Database>,
  table: "practices" | "competitions",
  segments: string[],
  callerId: string,
): Promise<ImageAuthzResult> {
  if (segments.length < 3) {
    return { ok: false, status: 400, error: "不正なパスです" };
  }
  const [ownerId, resourceId] = segments;

  if (ownerId === callerId) {
    return { ok: true };
  }

  const { data: resource } = await supabase
    .from(table)
    .select("team_id, user_id")
    .eq("id", resourceId)
    .eq("user_id", ownerId)
    .maybeSingle();

  if (!resource || !resource.team_id) {
    return { ok: false, status: 403, error: "権限がありません" };
  }

  const isMember = await isActiveTeamMember(supabase, resource.team_id, callerId);
  return isMember ? { ok: true } : { ok: false, status: 403, error: "権限がありません" };
}

/**
 * バケット内相対パスから、プロフィール画像の認可を判定する。
 * 本人所有、または caller が画像所有者と同一チームの active member なら許可。
 */
async function authorizeProfileImage(
  supabase: SupabaseClient<Database>,
  segments: string[],
  callerId: string,
): Promise<ImageAuthzResult> {
  if (segments.length < 2) {
    return { ok: false, status: 400, error: "不正なパスです" };
  }
  const [ownerId] = segments;

  if (ownerId === callerId) {
    return { ok: true };
  }

  const shared = await shareActiveTeam(supabase, callerId, ownerId);
  return shared ? { ok: true } : { ok: false, status: 403, error: "権限がありません" };
}

/**
 * 画像取得 (署名付きURL発行) の認可を判定する。
 *
 * @param supabase 呼び出し元 (caller) の認証済みクライアント
 * @param bucket 対象バケット
 * @param path バケット内相対パス (正規化・トラバーサル検証済みであること)
 * @param callerId 呼び出し元ユーザーID
 */
export async function authorizeImageAccess(
  supabase: SupabaseClient<Database>,
  bucket: ImageBucket,
  path: string,
  callerId: string,
): Promise<ImageAuthzResult> {
  const segments = path.split("/").filter(Boolean);

  switch (bucket) {
    case "profile-images":
      return authorizeProfileImage(supabase, segments, callerId);
    case "practice-images":
      return authorizeResourceImage(supabase, "practices", segments, callerId);
    case "competition-images":
      return authorizeResourceImage(supabase, "competitions", segments, callerId);
    default:
      return { ok: false, status: 400, error: "不正な bucket です" };
  }
}
