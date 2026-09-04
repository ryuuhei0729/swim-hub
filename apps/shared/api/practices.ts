// =============================================================================
// 練習記録API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient, RealtimePostgresChangesFilter } from "@supabase/supabase-js";
import {
  Practice,
  PracticeInsert,
  PracticeLog,
  PracticeLogInsert,
  PracticeLogUpdate,
  PracticeTime,
  PracticeTimeInsert,
  PracticeUpdate,
  PracticeWithLogs,
} from "../types";

// Supabaseリアルタイム購読の設定型
type RealtimeSubscriptionConfig = RealtimePostgresChangesFilter<"*">;

// 練習（ログ・タイム・タグ込み）取得時の select 定義元。
// getPracticeById / getTeamScopedPracticeById の両方がここから参照する
// (同一のネストした select を2箇所にハードコードしない)。
const PRACTICE_WITH_LOGS_SELECT = `
  *,
  practice_logs (
    *,
    practice_times (*),
    practice_log_tags (
      practice_tag_id,
      practice_tags (
        id,
        name,
        color
      )
    )
  )
`;

export class PracticeAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // 練習（日単位）の操作
  // =========================================================================

  /**
   * 練習記録一覧取得（期間指定）
   * @param startDate 開始日
   * @param endDate 終了日
   * @param limit 取得件数（オプション）
   * @param offset オフセット（オプション）
   */
  async getPractices(
    startDate: string,
    endDate: string,
    limit?: number,
    offset?: number,
  ): Promise<PracticeWithLogs[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    let query = this.supabase
      .from("practices")
      .select(
        `
        *,
        practice_logs (
          *,
          practice_times (*),
          practice_log_tags (
            practice_tag_id,
            practice_tags (
              id,
              name,
              color
            )
          )
        )
      `,
      )
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    if (limit !== undefined) {
      if (offset !== undefined) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.limit(limit);
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as PracticeWithLogs[];
  }

  /**
   * 練習記録の総件数を取得（期間指定）
   */
  async countPractices(startDate: string, endDate: string): Promise<number> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { count, error } = await this.supabase
      .from("practices")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("date", startDate)
      .lte("date", endDate);

    if (error) throw error;
    return count || 0;
  }

  /**
   * 特定日の練習記録取得
   */
  async getPracticesByDate(date: string): Promise<PracticeWithLogs[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("practices")
      .select(
        `
        *,
        practice_logs (
          *,
          practice_times (*),
          practice_log_tags (
            practice_tag_id,
            practice_tags (
              id,
              name,
              color
            )
          )
        )
      `,
      )
      .eq("user_id", user.id)
      .eq("date", date);

    if (error) throw error;
    return data as PracticeWithLogs[];
  }

  /**
   * IDで練習記録を取得
   * @param id 練習記録ID
   */
  async getPracticeById(id: string): Promise<PracticeWithLogs | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("practices")
      .select(PRACTICE_WITH_LOGS_SELECT)
      .eq("user_id", user.id)
      .eq("id", id)
      .single();

    if (error) {
      // レコードが見つからない場合は null を返す
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }
    return data as PracticeWithLogs;
  }

  /**
   * IDで練習記録を取得（チームスコープ込み）
   * user_id での絞り込みを行わず、practices の SELECT RLS
   * ((user_id = auth.uid()) OR is_team_member(team_id, auth.uid())) を
   * そのままスコープとして使う。所有者本人に加え、同じチームのメンバーであれば取得できる
   * (チーム管理者が他メンバーの練習を代理編集する際の初期化取得に使用)。
   * 既存の getPracticeById (user_id スコープ) はこのメソッドとは独立して維持する。
   * @param id 練習記録ID
   */
  async getTeamScopedPracticeById(id: string): Promise<PracticeWithLogs | null> {
    const { data, error } = await this.supabase
      .from("practices")
      .select(PRACTICE_WITH_LOGS_SELECT)
      .eq("id", id)
      .single();

    if (error) {
      // レコードが見つからない、または RLS で見えない場合は null を返す
      if (error.code === "PGRST116") {
        return null;
      }
      throw error;
    }
    return data as PracticeWithLogs;
  }

  /**
   * 練習記録作成
   */
  async createPractice(practice: Omit<PracticeInsert, "user_id">): Promise<Practice> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("practices")
      .insert({ ...practice, user_id: user.id })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 練習記録更新
   */
  async updatePractice(id: string, updates: PracticeUpdate): Promise<Practice> {
    const { data, error } = await this.supabase
      .from("practices")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 練習記録削除
   */
  async deletePractice(id: string): Promise<void> {
    // PostgRESTはRLSでDELETEが拒否された場合もerrorを返さず0行削除で正常終了する。
    // .select() で削除された行を返させ、件数で成否を判定する。
    // 「対象が存在しない」と「RLSで拒否された」はクライアントから区別できないため、
    // どちらも同じ扱いとしてthrowする（無言の成功扱いを防ぐ）。
    const { data, error } = await this.supabase
      .from("practices")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("練習記録の削除に失敗しました");
    }
  }

  // =========================================================================
  // 練習ログ（セット単位）の操作
  // =========================================================================

  /**
   * 練習ログ作成
   * @param log user_id を明示的に指定すると、チーム管理者が対象メンバーに代理して
   *   メニューを追加する際にそのメンバーを所有者にできる (replace_practice_logs RPC の
   *   p_logs_data 各要素が持つ user_id と同型)。省略時は呼び出し元本人が所有者になる
   *   (個人フローの既存挙動を維持)。実際の代理入力の可否は RLS
   *   (practice_logs INSERT ポリシー: 本人 OR 当該 team の active admin かつ
   *   対象 user_id が active member) が判定する。
   */
  async createPracticeLog(
    log: Omit<PracticeLogInsert, "user_id"> & { user_id?: string },
  ): Promise<PracticeLog> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("practice_logs")
      .insert({ ...log, user_id: log.user_id ?? user.id })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 複数の練習ログを一括作成
   * user_id の扱いは createPracticeLog と同型 (各要素で個別に指定可能。省略時は呼び出し元)。
   */
  async createPracticeLogs(
    logs: (Omit<PracticeLogInsert, "user_id"> & { user_id?: string })[],
  ): Promise<PracticeLog[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const logsWithUserId = logs.map((log) => ({ ...log, user_id: log.user_id ?? user.id }));
    const { data, error } = await this.supabase
      .from("practice_logs")
      .insert(logsWithUserId)
      .select();

    if (error) throw error;
    return data;
  }

  /**
   * 練習ログ更新
   */
  async updatePracticeLog(id: string, updates: PracticeLogUpdate): Promise<PracticeLog> {
    const { data, error } = await this.supabase
      .from("practice_logs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 練習ログ削除
   */
  async deletePracticeLog(id: string): Promise<void> {
    // PostgRESTはRLSでDELETEが拒否された場合もerrorを返さず0行削除で正常終了する。
    // .select() で削除された行を返させ、件数で成否を判定する（deletePracticeと同型）。
    const { data, error } = await this.supabase
      .from("practice_logs")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("練習ログの削除に失敗しました");
    }
  }

  // =========================================================================
  // 練習タイムの操作
  // =========================================================================

  /**
   * 練習タイム作成
   * @param time PracticeTimeInsert は user_id を必須で持つ。
   *   呼び出し元が上書きせず渡された user_id をそのまま使う (代理入力ではログ所有者の
   *   user_id が渡される想定。以前は呼び出し元自身の id で強制上書きしており、
   *   渡された値が黙って破棄されていた)。認可は RLS が担う。
   */
  async createPracticeTime(time: PracticeTimeInsert): Promise<PracticeTime> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("practice_times")
      .insert(time)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 複数の練習タイムを一括作成
   * user_id の扱いは createPracticeTime と同型 (渡された値をそのまま使う)。
   */
  async createPracticeTimes(times: PracticeTimeInsert[]): Promise<PracticeTime[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase.from("practice_times").insert(times).select();

    if (error) throw error;
    return data;
  }

  /**
   * 練習ログのタイムを全て削除して再作成
   * @param userId タイムの所有者。省略時は呼び出し元本人 (個人フローの既存挙動)。
   *   チーム管理者が対象メンバーのログを代理編集する場合は、そのメンバーの user_id を
   *   渡す (practice_times.user_id は紐づく practice_log の所有者と一致させる。
   *   20260903000000 の practice_times INSERT ポリシーは対象行の所有者を
   *   pl.user_id (= 紐づく practice_log の所有者) で判定するため、practice_times.user_id
   *   自体はこのポリシーの認可対象ではないが、データの整合性のため一致させる)。
   */
  async replacePracticeTimes(
    practiceLogId: string,
    times: Omit<PracticeTimeInsert, "practice_log_id" | "user_id">[],
    userId?: string,
  ): Promise<PracticeTime[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    // 既存のタイムを削除
    // practice_log_id単位の削除のため、既存タイムが0件のログでは0行が正当な結果となる
    // (deletePracticeTimeのようなid指定削除とは異なり0行ガードは付けない)。
    // ただし従来はerrorを一切チェックしていなかったため、その穴のみ塞ぐ。
    const { error: deleteTimesError } = await this.supabase
      .from("practice_times")
      .delete()
      .eq("practice_log_id", practiceLogId);
    if (deleteTimesError) throw deleteTimesError;

    // 新しいタイムを作成
    if (times.length === 0) return [];

    const targetUserId = userId ?? user.id;
    const { data, error } = await this.supabase
      .from("practice_times")
      .insert(
        times.map((t) => ({
          ...t,
          practice_log_id: practiceLogId,
          user_id: targetUserId,
        })),
      )
      .select();

    if (error) throw error;
    return data;
  }

  /**
   * 練習タイム削除
   */
  async deletePracticeTime(id: string): Promise<void> {
    // PostgRESTはRLSでDELETEが拒否された場合もerrorを返さず0行削除で正常終了する。
    // .select() で削除された行を返させ、件数で成否を判定する（deletePracticeと同型）。
    const { data, error } = await this.supabase
      .from("practice_times")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("練習タイムの削除に失敗しました");
    }
  }

  // =========================================================================
  // リアルタイム購読
  // =========================================================================

  /**
   * 練習記録の変更をリアルタイム購読
   * @param callback - 変更時のコールバック関数
   * @param userId - (オプション) ユーザーIDでフィルタリング。指定した場合、該当ユーザーのみの変更を受信
   */
  subscribeToPractices(callback: (practice: Practice) => void, userId?: string) {
    const config: RealtimeSubscriptionConfig = userId
      ? {
          event: "*",
          schema: "public",
          table: "practices",
          filter: `user_id=eq.${userId}`,
        }
      : {
          event: "*",
          schema: "public",
          table: "practices",
        };

    return this.supabase
      .channel("practices-changes")
      .on("postgres_changes", config, (payload) => {
        if (payload.new) {
          callback(payload.new as Practice);
        }
      })
      .subscribe();
  }

  /**
   * 練習ログの変更をリアルタイム購読
   */
  subscribeToPracticeLogs(practiceId: string, callback: (log: PracticeLog) => void) {
    return this.supabase
      .channel(`practice-logs-${practiceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "practice_logs",
          filter: `practice_id=eq.${practiceId}`,
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as PracticeLog);
          }
        },
      )
      .subscribe();
  }

  // =========================================================================
  // 練習タグの操作
  // =========================================================================

  /**
   * 練習タグ一覧取得
   */
  async getPracticeTags(): Promise<import("../types").PracticeTag[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("practice_tags")
      .select("*")
      .eq("user_id", user.id)
      .order("name");

    if (error) throw error;
    return (data || []) as import("../types").PracticeTag[];
  }

  /**
   * 練習タグ作成
   */
  async createPracticeTag(name: string, color: string): Promise<import("../types").PracticeTag> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("practice_tags")
      .insert({
        user_id: user.id,
        name: name.trim(),
        color,
      })
      .select()
      .single();

    if (error) throw error;
    return data as import("../types").PracticeTag;
  }

  /**
   * 練習タグ更新
   */
  async updatePracticeTag(
    id: string,
    name: string,
    color: string,
  ): Promise<import("../types").PracticeTag> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("practice_tags")
      .update({
        name: name.trim(),
        color,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;
    return data as import("../types").PracticeTag;
  }

  /**
   * 練習タグ削除
   */
  async deletePracticeTag(id: string): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    // PostgRESTはRLSでDELETEが拒否された場合もerrorを返さず0行削除で正常終了する。
    // .select() で削除された行を返させ、件数で成否を判定する（deletePracticeと同型）。
    const { data, error } = await this.supabase
      .from("practice_tags")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("練習タグの削除に失敗しました");
    }
  }

  // =========================================================================
  // 練習画像の操作
  // NOTE: 画像パスはpractices.image_pathsで管理（practice_imagesテーブルは廃止）
  // =========================================================================

  /**
   * 練習画像をアップロード（API Route経由）
   * @param practiceId 練習記録ID
   * @param file 圧縮済み画像ファイル
   * @returns 保存されたパス
   */
  async uploadPracticeImage(practiceId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("practiceId", practiceId);

    const appUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const response = await fetch(`${appUrl}/api/storage/images/practice`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      let errorMessage = "画像のアップロードに失敗しました";
      let bodyText = "";

      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = (await response.json()) as { error?: string };
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } else {
          bodyText = await response.text();
        }
      } catch {
        try {
          bodyText = await response.text();
        } catch {
          // テキスト取得も失敗した場合は無視
        }
      }

      const details = bodyText ? `: ${bodyText}` : "";
      throw new Error(`${errorMessage} (HTTP ${response.status}${details})`);
    }

    const result = (await response.json()) as { path: string };
    return result.path;
  }

  /**
   * 複数の練習画像を一括アップロード
   * エラー発生時は成功済みの画像をすべてロールバック
   */
  async uploadPracticeImages(practiceId: string, files: File[]): Promise<string[]> {
    const results: string[] = [];

    try {
      for (const file of files) {
        const path = await this.uploadPracticeImage(practiceId, file);
        results.push(path);
      }
      return results;
    } catch (error) {
      // ロールバック: 成功済みの画像をすべて削除
      console.error("画像アップロード中にエラーが発生。ロールバックを開始:", error);

      for (const path of results) {
        try {
          await this.deletePracticeImage(path);
        } catch (deleteError) {
          console.error(`画像 ${path} の削除に失敗:`, deleteError);
        }
      }

      throw error;
    }
  }

  /**
   * 練習画像を削除（API Route経由）
   * @param path 画像パス
   */
  async deletePracticeImage(path: string): Promise<void> {
    const appUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const response = await fetch(
      `${appUrl}/api/storage/images/practice?path=${encodeURIComponent(path)}`,
      {
        method: "DELETE",
        credentials: "include",
      },
    );

    if (!response.ok) {
      let errorMessage = "画像の削除に失敗しました";
      let bodyText = "";

      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = (await response.json()) as { error?: string };
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } else {
          bodyText = await response.text();
        }
      } catch {
        try {
          bodyText = await response.text();
        } catch {
          // テキスト取得も失敗した場合は無視
        }
      }

      const details = bodyText ? `: ${bodyText}` : "";
      throw new Error(`${errorMessage} (HTTP ${response.status}${details})`);
    }
  }

  /**
   * 複数の練習画像を一括削除
   */
  async deletePracticeImages(paths: string[]): Promise<void> {
    for (const path of paths) {
      await this.deletePracticeImage(path);
    }
  }

  /**
   * 画像のURL（publicUrl）を取得
   * NOTE: R2使用時はR2_PUBLIC_URLを使用
   */
  getPracticeImageUrl(path: string): string {
    // R2が有効な場合はR2のURLを使用
    const r2PublicUrl =
      typeof window !== "undefined"
        ? (window as unknown as { __NEXT_PUBLIC_R2_PUBLIC_URL__?: string })
            .__NEXT_PUBLIC_R2_PUBLIC_URL__
        : process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

    if (r2PublicUrl) {
      return `${r2PublicUrl}/practice-images/${path}`;
    }

    // フォールバック: Supabase Storage
    const { data } = this.supabase.storage.from("practice-images").getPublicUrl(path);
    return data.publicUrl;
  }

  // =========================================================================
  // 場所候補の取得
  // =========================================================================

  /**
   * 過去の練習で使用した場所一覧を取得（重複排除・最近使われた順）
   */
  async getUniquePlaces(): Promise<string[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("practices")
      .select("place, date")
      .eq("user_id", user.id)
      .not("place", "is", null)
      .not("place", "eq", "")
      .order("date", { ascending: false });

    if (error) throw error;

    // 重複排除しつつ、最近使われた順を維持
    const seen = new Set<string>();
    const uniquePlaces: string[] = [];
    for (const item of data || []) {
      const place = item.place?.trim();
      if (place && !seen.has(place)) {
        seen.add(place);
        uniquePlaces.push(place);
      }
    }

    return uniquePlaces;
  }
}
