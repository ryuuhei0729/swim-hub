// =============================================================================
// チームAPI - core（チーム基本情報/作成更新/削除/可視性）
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { Team, TeamInsert, TeamMembershipWithUser, TeamUpdate, TeamWithMembers } from "../../types";
import { UserFacingError } from "../../utils/userFacingError";
import { requireAuth, requireTeamAdmin, requireTeamMembership } from "../auth-utils";

/**
 * チーム操作の失敗を「表示してはいけない機械可読コード」として運ぶエラー。
 *
 * 🚨 **`UserFacingError` と混ぜないこと。** `UserFacingError` は「message を
 * そのまま画面に出してよい」ことを型で表明するクラスで、`toUserFacingMessage()` は
 * その message を素通しする。`not_authorized` のようなコードを `UserFacingError` に
 * 載せると、将来 `toUserFacingMessage()` を通した瞬間に画面へコードが露出する。
 *
 * このクラスは `UserFacingError` を継承していないので、`toUserFacingMessage()` に
 * 渡しても汎用フォールバック文言になる = 事故っても意味不明な英字は表示されない。
 * 文言へ変換する正規の経路は `getDeleteTeamErrorMessageKey()` のみ。
 *
 * 🚨 **`CodedError` という名前にしないこと。** `expo-modules-core` が同名のクラスを
 * export しており、mobile 側はそれをモックしている。同名が混在すると
 * 「`instanceof` が静かに false を返す」という最も見つけにくい壊れ方をする。
 */
export class TeamOperationError extends Error {
  readonly code: string;

  constructor(code: string) {
    // message にもコードを入れる: コンソール・エラー収集で何が起きたか追えるようにする
    super(code);
    this.name = "TeamOperationError";
    this.code = code;
  }
}

/** delete_team_preserving_records RPC の戻り値 (jsonb)。migration 20260910000001 が定義元 */
interface DeleteTeamResult {
  success: boolean;
  /** 失敗理由の**機械可読なコード**。表示文言ではない (DELETE_TEAM_ERROR_MESSAGE_KEYS を参照) */
  error?: string;
  deleted_team_count?: number;
  cleared_record_count?: number;
  cleared_practice_count?: number;
}

/**
 * RPC が返す失敗コード → i18n メッセージキーの対応表。
 *
 * 🚨 **この表が唯一の定義元。** web (`components/team/settings/TeamSettingsTab.tsx`) と
 * mobile (`components/teams/TeamSettingsTab.tsx`) の両方がここを参照する。
 * どちらかに同じ対応表を書き写すと、片方だけ更新されて静かに壊れる。
 *
 * `apps/shared` は i18n の `t()` を持たないため、**ここでは文言を持たずキーだけを返す**。
 * 文言の解決は必ず UI 層で行う (shared に日本語を書くと ja 以外のユーザーに日本語が出る)。
 *
 * キーはドット区切りのフルパス。next-intl の `useTranslations()` (名前空間なし) と
 * react-i18next の `t()` のどちらからでもそのまま引ける。戻り値を `string` ではなく
 * リテラル union にしてあるのは、next-intl のキーが型付き (MessageKeys<IntlMessages>)
 * で、素の `string` では web 側が型エラーになるため。タイポも型で弾ける。
 */
export type DeleteTeamMessageKey =
  | "teams.settingsTab.deleteErrors.authRequired"
  | "teams.settingsTab.deleteErrors.teamNotFound"
  | "teams.settingsTab.deleteErrors.notAuthorized"
  | "teams.settingsTab.deleteFailed";

export const DELETE_TEAM_ERROR_MESSAGE_KEYS: Readonly<Record<string, DeleteTeamMessageKey>> = {
  auth_required: "teams.settingsTab.deleteErrors.authRequired",
  team_not_found: "teams.settingsTab.deleteErrors.teamNotFound",
  not_authorized: "teams.settingsTab.deleteErrors.notAuthorized",
};

/** 未知のコード・RPC 以外の失敗に使う汎用キー */
export const DELETE_TEAM_FALLBACK_MESSAGE_KEY: DeleteTeamMessageKey =
  "teams.settingsTab.deleteFailed";

/**
 * deleteTeam が投げたエラーから、表示に使う i18n メッセージキーを決める。
 *
 * deleteTeam は `TeamOperationError` にコードを載せて投げる。呼び出し側は
 * `error.message` を直接表示せず必ずこの関数を通すこと。
 * 生の PostgrestError などコードを持たないエラーは汎用キーに落ちる
 * ＝ テーブル名や RLS 詳細が画面に出ることはない。
 */
export function getDeleteTeamErrorMessageKey(error: unknown): DeleteTeamMessageKey {
  if (!(error instanceof TeamOperationError)) return DELETE_TEAM_FALLBACK_MESSAGE_KEY;
  return DELETE_TEAM_ERROR_MESSAGE_KEYS[error.code] ?? DELETE_TEAM_FALLBACK_MESSAGE_KEY;
}

export class TeamCoreAPI {
  constructor(private supabase: SupabaseClient) {}

  // NOTE: 実体は既存 teams.ts から段階的に移行する
  async getMyTeams(): Promise<TeamMembershipWithUser[]> {
    const userId = await requireAuth(this.supabase);
    // 承認済み（status='approved' && is_active=true）と承認待ち（status='pending'）の両方を取得
    // RLSポリシーにより、自分のメンバーシップ（user_id = auth.uid()）は全て取得可能
    // 承認済みの場合はis_active=trueのみ、承認待ちの場合はis_activeの条件なし
    const { data, error } = await this.supabase
      .from("team_memberships")
      .select(`*, teams:teams(*), users:users(*)`)
      .eq("user_id", userId)
      .in("status", ["approved", "pending"])
      .order("joined_at", { ascending: false });
    if (error) throw error;

    // 承認済みの場合はis_active=trueのみを返す
    // 承認待ちの場合はis_activeの条件なし
    return (data as TeamMembershipWithUser[]).filter(
      (membership) =>
        membership.status === "pending" ||
        (membership.status === "approved" && membership.is_active === true),
    );
  }

  async getTeam(teamId: string): Promise<TeamWithMembers> {
    await requireTeamMembership(this.supabase, teamId);

    const { data, error } = await this.supabase
      .from("teams")
      .select(`*, team_memberships(*, user:users(*))`)
      .eq("id", teamId)
      .single();
    if (error) throw error;
    return data as TeamWithMembers;
  }

  async createTeam(input: TeamInsert): Promise<Team> {
    const userId = await requireAuth(this.supabase);

    // created_byを含む挿入データを作成
    const insertData = {
      ...input,
      created_by: userId,
    };

    const { data, error } = await this.supabase
      .from("teams")
      .insert(insertData)
      .select("*")
      .single();
    if (error) throw error;

    // チーム作成者を自動的にadminとしてメンバーシップに追加（承認済み状態で）
    const { error: membershipError } = await this.supabase.from("team_memberships").insert({
      team_id: data.id,
      user_id: userId,
      role: "admin",
      status: "approved",
      is_active: true,
      joined_at: new Date().toISOString().split("T")[0],
    });

    if (membershipError) {
      console.error("チームメンバーシップの作成に失敗:", membershipError);
      // チームは作成されたが、メンバーシップの作成に失敗した場合はエラーを投げる
      throw new Error("チームの作成に成功しましたが、メンバーシップの追加に失敗しました");
    }

    return data as Team;
  }

  /**
   * チーム情報を更新する（管理者のみ）。
   *
   * RLS の teams_update_creator は作成者と管理者の両方を許可するが、RLS 単体では
   * 権限が無いとき 0 行更新（PostgREST はエラーを返さない）になる。members.ts の
   * updateRole / remove と同じく requireTeamAdmin を先に通し、書き込みへ到達する前に
   * 弾く。`.select("*").single()` は 0 行更新をサイレント成功にしない保険。
   *
   * ⚠️ 権限エラーは `deleteTeam` と同じく `TeamOperationError` に載せ替えて投げる
   * （message は表示文言ではなくコード）。`requireTeamAdmin` は
   * `UserFacingError("管理者権限が必要です")` という**日本語固定文言**を投げるので、
   * そのまま通すと `toUserFacingMessage` のフォールバックが設計どおりスキップされ、
   * de/en/ko/zh のユーザーに日本語が出る。auth-utils 側は呼び出し元が多く
   * 影響範囲が広いため、この境界で閉じる。
   */
  async updateTeam(id: string, updates: TeamUpdate): Promise<Team> {
    try {
      await requireTeamAdmin(this.supabase, id);
    } catch (error) {
      // UserFacingError = 認可ガードが「権限なし」と判断したケース（固定日本語）。
      // それ以外（確認クエリ自体の失敗 = 生の PostgrestError）は情報を足さずに
      // そのまま伝播させる（表示側は汎用文言へフォールバックする）。
      if (error instanceof UserFacingError) throw new TeamOperationError("not_authorized");
      throw error;
    }

    const { data, error } = await this.supabase
      .from("teams")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as Team;
  }

  /**
   * チームを削除する（管理者のみ。認可は RPC 内の is_team_admin が判定する）。
   *
   * 🚨 **teams への直接 DELETE を書いてはならない。** records_team_id_fkey は
   * ON DELETE CASCADE なので、teams を素朴に消すと**他メンバーのレース記録と
   * 練習ログが物理削除される**。RPC delete_team_preserving_records が
   * records.team_id と practices.team_id を NULL 化してから teams を消す
   * （migration 20260910000001）。
   *
   * 件数を必ず検査する: PostgREST は RLS 拒否の DELETE を「0 行・エラー無し」で
   * 返すため、成否を件数で見ないと「削除したのに残っている」状態を成功として
   * 画面に返してしまう。
   *
   * ⚠️ 失敗時は `UserFacingError` ではなく `TeamOperationError` を投げる (message は
   * 表示文言ではなくコード)。呼び出し側は `getDeleteTeamErrorMessageKey()` で
   * キーへ変換し `t()` で表示すること。
   */
  async deleteTeam(id: string): Promise<void> {
    const { data, error } = await this.supabase.rpc("delete_team_preserving_records", {
      p_team_id: id,
    });

    // 生の PostgrestError はテーブル名・RLS 詳細を含みうるのでラップせずそのまま
    // re-throw する (auth-utils の方針と同じ。表示側は汎用文言へフォールバックする)。
    if (error) throw error;

    const result = data as DeleteTeamResult | null;

    if (!result?.success) {
      // result.error は RPC が返す機械可読なコード。文言へは UI 層が変換する
      // (ここで日本語を書くと ja 以外の4ロケールに日本語が出る)。
      // data 自体が null でコードが無い場合は "unknown_error" = 未知扱いで汎用文言に落ちる
      // (コンソールやエラー収集では何が起きたか判別できる文字列を残す)。
      throw new TeamOperationError(result?.error ?? "unknown_error");
    }

    // 主キー1件の DELETE なので 1 以外 (0 / 欠落) はすべて異常。
    // 対応するコードは RPC 側に無い (RPC は success:true を返している) ため、
    // 未知コードとして汎用文言にフォールバックさせる。
    if (result.deleted_team_count !== 1) {
      throw new TeamOperationError("delete_not_applied");
    }
  }
}

export type { Team, TeamInsert, TeamUpdate, TeamWithMembers };
