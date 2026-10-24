// =============================================================================
// エントリーAPI - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数（個人・チーム共通）
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { Entry, EntryInsert, EntryUpdate, EntryWithDetails } from "../types";
import { requireAuth, requireTeamMembership, requireTeamAdmin } from "./auth-utils";

export class EntryAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // エントリーの取得
  // =========================================================================

  /**
   * 大会別のエントリー一覧取得
   */
  async getEntriesByCompetition(competitionId: string): Promise<EntryWithDetails[]> {
    await requireAuth(this.supabase);

    const { data, error } = await this.supabase
      .from("entries")
      .select(
        `
        *,
        competition:competitions(*),
        style:styles(*),
        user:users(*)
      `,
      )
      .eq("competition_id", competitionId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data as EntryWithDetails[];
  }

  /**
   * 現在のユーザーのエントリー一覧取得
   * セキュリティのため、常に認証されたユーザー自身のエントリーのみを取得します
   */
  async getEntriesByUser(): Promise<EntryWithDetails[]> {
    const userId = await requireAuth(this.supabase);

    const { data, error } = await this.supabase
      .from("entries")
      .select(
        `
        *,
        competition:competitions(*),
        style:styles(*),
        user:users(*),
        team:teams(*)
      `,
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as EntryWithDetails[];
  }

  /**
   * チーム別のエントリー一覧取得
   */
  async getEntriesByTeam(teamId: string): Promise<EntryWithDetails[]> {
    await requireTeamMembership(this.supabase, teamId);

    const { data, error } = await this.supabase
      .from("entries")
      .select(
        `
        *,
        competition:competitions(*),
        style:styles(*),
        user:users(*),
        team:teams(*)
      `,
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as EntryWithDetails[];
  }

  /**
   * 単一エントリー取得（アクセス制御付き）
   * エントリーの所有者またはチーム管理者のみがアクセス可能
   */
  async getEntry(entryId: string): Promise<EntryWithDetails> {
    const userId = await requireAuth(this.supabase);

    const { data, error } = await this.supabase
      .from("entries")
      .select(
        `
        *,
        competition:competitions(*),
        style:styles(*),
        user:users(*),
        team:teams(*)
      `,
      )
      .eq("id", entryId)
      .single();

    if (error) throw error;

    // アクセス制御チェック
    // 1. エントリーの所有者かどうかチェック
    if (data.user_id === userId) {
      return data as EntryWithDetails;
    }

    // 2. チームエントリーの場合、チーム管理者かどうかチェック
    if (data.team_id) {
      const { data: membership, error: membershipError } = await this.supabase
        .from("team_memberships")
        .select("role")
        .eq("team_id", data.team_id)
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (!membershipError && membership?.role === "admin") {
        return data as EntryWithDetails;
      }
    }

    // アクセス権限がない場合
    throw new Error("アクセスが拒否されました");
  }

  // =========================================================================
  // エントリーの作成
  // =========================================================================

  /**
   * 個人エントリー作成
   */
  async createPersonalEntry(entry: Omit<EntryInsert, "team_id" | "user_id">): Promise<Entry> {
    const userId = await requireAuth(this.supabase);

    const { data, error } = await this.supabase
      .from("entries")
      .insert({
        ...entry,
        user_id: userId,
        team_id: null, // 個人エントリー
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * チームエントリー作成（アクセス制御付き）
   * 管理者は任意のユーザーのエントリーを作成可能
   * 一般メンバーは自分のエントリーのみ作成可能
   */
  async createTeamEntry(
    teamId: string,
    targetUserId: string,
    entry: Omit<EntryInsert, "team_id" | "user_id">,
  ): Promise<Entry> {
    const currentUserId = await requireAuth(this.supabase);

    // チームメンバーシップ確認
    const { data: membership } = await this.supabase
      .from("team_memberships")
      .select("id, role")
      .eq("team_id", teamId)
      .eq("user_id", currentUserId)
      .eq("is_active", true)
      .single();

    if (!membership) {
      throw new Error("チームへのアクセス権限がありません");
    }

    // アクセス制御チェック
    // 管理者以外は自分のエントリーのみ作成可能
    if (membership.role !== "admin" && targetUserId !== currentUserId) {
      throw new Error("自分のエントリーのみ作成可能です");
    }

    const { data, error } = await this.supabase
      .from("entries")
      .insert({
        ...entry,
        team_id: teamId,
        user_id: targetUserId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 複数の「新規」エントリーを一括作成（チーム用・管理者代理一括入力）
   *
   * **注意: このメソッドは新規行 (existingEntryId が無い行) のみに使うこと。**
   * 既存行の更新 (種目/タイム/メモの変更) には絶対に使わない。
   *
   * `.insert()` ではなく `.upsert()` (onConflict: competition_id,user_id,style_id) を使うのは、
   * 「diff 計算時点ではスナップショットに存在しなかったが、保存直前の競合で既に
   * 同じ (competition_id,user_id,style_id) の行が作成されていた」という稀な競合状態を
   * 安全に処理するための防御であり、既存行の更新用途ではない。
   *
   * upsert の衝突判定は自然キー (competition_id,user_id,style_id) のみで行われ、
   * entries.id は一切見ない。そのため「既存行 X の style_id を Y に変更した」パッチを
   * ここに混ぜると、Postgres は X ではなく「変更後の自然キーに元から一致する別の行」を
   * 衝突相手として上書きしてしまい、X 自体は古い style_id のまま残留する
   * (サイレントなデータ破壊)。既存行の更新は必ず `updateEntry(id, patch)` を使うこと
   * (mobile の TeamEntryBulkFormScreen.tsx と同じ id ベースの更新)。
   *
   * アプリケーション層バリデーション (セキュリティ):
   * `requireTeamAdmin` は「呼び出し元が teamId の admin か」しか検証しないため、
   * entries 配列の各要素の competitionId/userId が teamId に属することを
   * 追加で検証する (他チームへの偽エントリー注入を防ぐ)。競合しうる ID を
   * ユニーク化した上でそれぞれ1クエリで検証し、N+1 を避ける。
   *
   * 0件バッチのときは requireTeamAdmin を含め何も実行せず空配列を返す。
   */
  async createBulkEntries(
    teamId: string,
    entries: Array<{
      userId: string;
      competitionId: string;
      styleId: number;
      entryTime?: number | null;
      note?: string | null;
      isRelaying?: boolean;
    }>,
  ): Promise<Entry[]> {
    if (entries.length === 0) return [];

    await requireTeamAdmin(this.supabase, teamId);

    const uniqueCompetitionIds = Array.from(new Set(entries.map((e) => e.competitionId)));
    const uniqueUserIds = Array.from(new Set(entries.map((e) => e.userId)));

    const [competitionsResult, membershipsResult] = await Promise.all([
      this.supabase
        .from("competitions")
        .select("id")
        .eq("team_id", teamId)
        .in("id", uniqueCompetitionIds),
      this.supabase
        .from("team_memberships")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("is_active", true)
        .in("user_id", uniqueUserIds),
    ]);

    if (competitionsResult.error) throw competitionsResult.error;
    if (membershipsResult.error) throw membershipsResult.error;

    const validCompetitionIds = new Set((competitionsResult.data ?? []).map((c) => c.id));
    const validUserIds = new Set((membershipsResult.data ?? []).map((m) => m.user_id));

    if (entries.some((e) => !validCompetitionIds.has(e.competitionId))) {
      throw new Error("指定された大会はこのチームに属していません");
    }
    if (entries.some((e) => !validUserIds.has(e.userId))) {
      throw new Error("指定されたユーザーはこのチームのメンバーではありません");
    }

    const upsertData = entries.map((entry) => ({
      team_id: teamId,
      user_id: entry.userId,
      competition_id: entry.competitionId,
      style_id: entry.styleId,
      entry_time: entry.entryTime ?? null,
      note: entry.note ?? null,
      is_relaying: entry.isRelaying ?? false,
    }));

    const { data, error } = await this.supabase
      .from("entries")
      .upsert(upsertData, { onConflict: "competition_id,user_id,style_id" })
      .select();

    if (error) throw error;
    return data;
  }

  /**
   * 複数エントリーを一括削除（チーム用・管理者代理一括入力の差分保存）
   *
   * 差分保存の削除フェーズ専用。全置換ではなく、呼び出し側が計算した
   * 「削除対象のみ」の entries.id を削除する。
   * `.eq("team_id", teamId)` を明示することで、関数の見た目上の契約
   * (「teamId のエントリーだけを消す」) を実装でも保証する
   * (RLS の DELETE ポリシーが最終防衛線として効くため実害は無かったが、多層防御として追加)。
   *
   * 呼び出し順序: createBulkEntries (upsert) / updateEntry を先に実行し、成功を確認した後に
   * このメソッドを呼ぶこと。逆順は upsert/update 失敗時に「削除だけ実行され新規/更新が
   * 失われる」データ損失を起こす。
   *
   * 0件のときは requireTeamAdmin を含め何も実行しない。
   */
  async deleteBulkEntries(teamId: string, entryIds: string[]): Promise<void> {
    if (entryIds.length === 0) return;

    await requireTeamAdmin(this.supabase, teamId);

    // PostgRESTはRLSでDELETEが拒否された場合もerrorを返さず0行削除で正常終了する。
    // .select() で削除された行を返させ、件数で成否を判定する（practices.ts の deletePractice と同型）。
    const { data, error } = await this.supabase
      .from("entries")
      .delete()
      .eq("team_id", teamId)
      .in("id", entryIds)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("エントリーの一括削除に失敗しました");
    }
  }

  // =========================================================================
  // エントリーの更新
  // =========================================================================

  /**
   * エントリー更新（アクセス制御付き）
   * エントリーの所有者またはチーム管理者のみが更新可能
   * competition_idとuser_idの更新は禁止
   */
  async updateEntry(entryId: string, updates: EntryUpdate): Promise<Entry> {
    const userId = await requireAuth(this.supabase);

    // 1. 既存エントリーを取得
    const { data: existingEntry, error: fetchError } = await this.supabase
      .from("entries")
      .select(
        `
        *,
        competition:competitions(*)
      `,
      )
      .eq("id", entryId)
      .single();

    if (fetchError) throw fetchError;
    if (!existingEntry) throw new Error("エントリーが見つかりません");

    // 2. アクセス制御チェック
    // エントリーの所有者かどうかチェック
    if (existingEntry.user_id === userId) {
      // 所有者の場合は更新可能
    } else if (existingEntry.team_id) {
      // チームエントリーの場合、チーム管理者かどうかチェック
      const { data: membership, error: membershipError } = await this.supabase
        .from("team_memberships")
        .select("role")
        .eq("team_id", existingEntry.team_id)
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (membershipError || membership?.role !== "admin") {
        throw new Error("アクセスが拒否されました");
      }
    } else {
      // 個人エントリーで所有者でない場合は拒否
      throw new Error("アクセスが拒否されました");
    }

    // 3. データサニタイゼーション
    // competition_idとuser_idの更新を禁止
    const sanitizedUpdates = { ...updates };
    if ("competition_id" in sanitizedUpdates) {
      throw new Error("competition_idの更新は許可されていません");
    }
    if ("user_id" in sanitizedUpdates) {
      throw new Error("user_idの更新は許可されていません");
    }

    // 4. データベース更新
    const { data, error } = await this.supabase
      .from("entries")
      .update(sanitizedUpdates)
      .eq("id", entryId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // =========================================================================
  // エントリーの削除
  // =========================================================================

  /**
   * エントリー削除（アクセス制御付き）
   * エントリーの所有者またはチーム管理者のみが削除可能
   */
  async deleteEntry(entryId: string): Promise<void> {
    const userId = await requireAuth(this.supabase);

    // 1. 既存エントリーを取得（所有者とチーム情報を含む）
    const { data: existingEntry, error: fetchError } = await this.supabase
      .from("entries")
      .select("user_id, team_id")
      .eq("id", entryId)
      .single();

    if (fetchError) throw fetchError;
    if (!existingEntry) throw new Error("エントリーが見つかりません");

    // 2. アクセス制御チェック
    // エントリーの所有者かどうかチェック
    if (existingEntry.user_id === userId) {
      // 所有者の場合は削除可能
    } else if (existingEntry.team_id) {
      // チームエントリーの場合、チーム管理者かどうかチェック
      const { data: membership, error: membershipError } = await this.supabase
        .from("team_memberships")
        .select("role")
        .eq("team_id", existingEntry.team_id)
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (membershipError || membership?.role !== "admin") {
        throw new Error("アクセスが拒否されました");
      }
    } else {
      // 個人エントリーで所有者でない場合は拒否
      throw new Error("アクセスが拒否されました");
    }

    // 3. データベース削除
    // PostgRESTはRLSでDELETEが拒否された場合もerrorを返さず0行削除で正常終了する。
    // .select() で削除された行を返させ、件数で成否を判定する（practices.ts の deletePractice と同型）。
    const { data, error } = await this.supabase
      .from("entries")
      .delete()
      .eq("id", entryId)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("エントリーの削除に失敗しました");
    }
  }

  /**
   * 大会の全エントリーを削除（管理者のみ）
   * チーム管理者のみが実行可能
   */
  async deleteEntriesByCompetition(competitionId: string): Promise<void> {
    await requireAuth(this.supabase);

    // 1. 大会情報を取得してチームIDを確認
    const { data: comp, error: compError } = await this.supabase
      .from("competitions")
      .select("team_id")
      .eq("id", competitionId)
      .single();

    if (compError) throw compError;
    if (!comp?.team_id) throw new Error("チーム大会ではありません");

    // 2. チーム管理者権限を確認
    await requireTeamAdmin(this.supabase, comp.team_id);

    // 3. エントリー削除実行
    // competition_id単位の削除のため、エントリーが0件の大会では0行が正当な結果となる
    // (deleteEntryのようなid指定削除とは異なり0行ガードは付けない)。
    const { error } = await this.supabase
      .from("entries")
      .delete()
      .eq("competition_id", competitionId);

    if (error) throw error;
  }

  // =========================================================================
  // ユーティリティ
  // =========================================================================

  /**
   * 既存エントリーのチェック（重複確認）
   */
  async checkExistingEntry(
    competitionId: string,
    userId: string,
    styleId: number,
  ): Promise<Entry | null> {
    const { data, error } = await this.supabase
      .from("entries")
      .select("*")
      .eq("competition_id", competitionId)
      .eq("user_id", userId)
      .eq("style_id", styleId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * 大会のエントリー数を取得
   */
  async getEntryCount(competitionId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("entries")
      .select("*", { count: "exact", head: true })
      .eq("competition_id", competitionId);

    if (error) throw error;
    return count || 0;
  }
}
