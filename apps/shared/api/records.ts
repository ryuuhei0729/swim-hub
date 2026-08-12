// =============================================================================
// 大会記録API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient, RealtimePostgresChangesFilter } from "@supabase/supabase-js";
import {
  Competition,
  CompetitionInsert,
  CompetitionUpdate,
  PoolType,
  Record,
  RecordInsert,
  RecordUpdate,
  RecordWithDetails,
  SplitTime,
  SplitTimeInsert,
} from "../types";
import type { BestTime } from "../types/ui";
import { normalizeRecordDateForBulkComparison } from "../utils/bestTimeBadge";

// Supabaseリアルタイム購読の設定型
type RealtimeSubscriptionConfig = RealtimePostgresChangesFilter<"*">;

/**
 * 一覧ベストバッジ判定用の記録候補（getListBestCandidates の戻り値）。
 * 日付フィルタ・自己除外は呼び出し側がメモリ上で行う。
 */
export interface ListBestCandidates {
  /** 大会記録（competition_id あり）。date は competitions.date */
  competitionRows: Array<{ id: string; time: number; date: string }>;
  /** 一括登録（competition_id なし）。created_at で日付比較する */
  bulkRows: Array<{ id: string; time: number; created_at: string }>;
}

export class RecordAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // 記録の操作
  // =========================================================================

  /**
   * 記録一覧取得（期間指定）
   * @param startDate 開始日（オプション）
   * @param endDate 終了日（オプション）
   * @param styleId 種目ID（オプション）
   * @param limit 取得件数（オプション）
   * @param offset オフセット（オプション）
   */
  async getRecords(
    startDate?: string,
    endDate?: string,
    styleId?: number,
    limit?: number,
    offset?: number,
  ): Promise<RecordWithDetails[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    let query = this.supabase
      .from("records")
      .select(
        `
        *,
        competition:competitions(*),
        style:styles(*),
        split_times(*)
      `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }
    if (styleId) {
      query = query.eq("style_id", styleId);
    }

    if (limit !== undefined) {
      if (offset !== undefined) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.limit(limit);
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as RecordWithDetails[];
  }

  /**
   * 記録の総件数を取得（期間指定）
   */
  async countRecords(startDate?: string, endDate?: string, styleId?: number): Promise<number> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    let query = this.supabase
      .from("records")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }
    if (styleId) {
      query = query.eq("style_id", styleId);
    }

    const { count, error } = await query;

    if (error) throw error;
    return count || 0;
  }

  /**
   * 記録作成
   */
  async createRecord(record: Omit<RecordInsert, "user_id">): Promise<Record> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("records")
      .insert({ ...record, user_id: user.id })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 記録更新
   */
  async updateRecord(id: string, updates: RecordUpdate): Promise<Record> {
    const { data, error } = await this.supabase
      .from("records")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 記録削除
   */
  async deleteRecord(id: string): Promise<void> {
    const { error } = await this.supabase.from("records").delete().eq("id", id);

    if (error) throw error;
  }

  /**
   * 記録1件取得（IDで指定）
   */
  async getRecordById(recordId: string): Promise<RecordWithDetails | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("records")
      .select(
        `
        *,
        competition:competitions(*),
        style:styles(*),
        split_times(*)
      `,
      )
      .eq("id", recordId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    return data as RecordWithDetails | null;
  }

  /**
   * 記録一括作成（ベストタイム一括入力用）
   */
  async createBulkRecords(
    records: Array<{
      style_id: number;
      time: number;
      is_relaying: boolean;
      note: string | null;
      pool_type: number;
      reaction_time?: number | null;
    }>,
  ): Promise<{ created: number; errors: string[] }> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const results = {
      created: 0,
      errors: [] as string[],
    };

    // バッチ処理（1度に100件ずつ）
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map((record) => ({
        user_id: user.id,
        style_id: record.style_id,
        time: record.time,
        is_relaying: record.is_relaying,
        note: record.note,
        pool_type: record.pool_type,
        competition_id: null, // 大会に紐づけない
        team_id: null, // 個人記録
        video_path: null,
        video_thumbnail_path: null,
        reaction_time: record.reaction_time || null,
      }));

      const { data, error } = await this.supabase.from("records").insert(batch).select();

      if (error) {
        results.errors.push(
          `バッチ ${Math.floor(i / batchSize) + 1} の登録に失敗: ${error.message}`,
        );
      } else {
        results.created += data.length;
      }
    }

    return results;
  }

  /**
   * ベストタイム取得
   * 種目・プール種別ごとの最速タイムを計算
   * @param userId ユーザーID（オプション、指定しない場合は現在のユーザー）
   */
  async getBestTimes(userId?: string): Promise<BestTime[]> {
    let targetUserId = userId;
    if (!targetUserId) {
      const {
        data: { user },
      } = await this.supabase.auth.getUser();
      if (!user) throw new Error("認証が必要です");
      targetUserId = user.id;
    }

    // recordsテーブルから記録を取得
    const { data, error } = await this.supabase
      .from("records")
      .select(
        `
        id,
        time,
        created_at,
        pool_type,
        is_relaying,
        note,
        style_id,
        styles!records_style_id_fkey (
          name_jp,
          distance
        ),
        competitions!records_competition_id_fkey (
          title,
          date
        )
      `,
      )
      .eq("user_id", targetUserId)
      .order("time", { ascending: true });

    if (error) {
      console.error("ベストタイム取得エラー:", error);
      throw error;
    }

    if (!data || !Array.isArray(data)) {
      return [];
    }

    // レスポンスの型変換（Supabaseの配列/単一オブジェクトの不整合に対応）
    interface RecordWithRelations {
      id: string;
      time: number;
      created_at: string;
      pool_type: number;
      is_relaying: boolean;
      note?: string | null;
      style_id: number;
      styles?: { name_jp: string; distance: number } | null;
      competitions?: { title: string; date: string } | null;
    }

    type RecordWithRelationsResponse = Omit<RecordWithRelations, "styles" | "competitions"> & {
      styles?: RecordWithRelations["styles"] | RecordWithRelations["styles"][];
      competitions?: RecordWithRelations["competitions"] | RecordWithRelations["competitions"][];
    };

    const records: RecordWithRelations[] = (data as RecordWithRelationsResponse[]).map((record) => {
      const styleData = Array.isArray(record.styles) ? record.styles[0] : record.styles;
      const competitionData = Array.isArray(record.competitions)
        ? record.competitions[0]
        : record.competitions;

      return {
        id: record.id,
        time: record.time,
        created_at: record.created_at,
        pool_type: record.pool_type,
        is_relaying: record.is_relaying,
        note: record.note,
        style_id: record.style_id,
        styles: styleData ? { name_jp: styleData.name_jp, distance: styleData.distance } : null,
        competitions: competitionData
          ? { title: competitionData.title, date: competitionData.date }
          : null,
      };
    });

    // 引き継ぎなしのベストタイム（種目、プール種別ごと）
    const bestTimesByStyleAndPool = new Map<string, BestTime>();
    // 引き継ぎありのベストタイム（種目、プール種別ごと）
    const relayingBestTimesByStyleAndPool = new Map<
      string,
      {
        id: string;
        time: number;
        created_at: string;
        note?: string;
        competition?: {
          title: string;
          date: string;
        };
      }
    >();

    records.forEach((record) => {
      const styleKey = record.styles?.name_jp || "Unknown";
      const poolType = record.pool_type ?? 0;
      const key = `${styleKey}_${poolType}`;

      if (record.is_relaying) {
        // 引き継ぎありのタイム
        if (
          !relayingBestTimesByStyleAndPool.has(key) ||
          record.time < relayingBestTimesByStyleAndPool.get(key)!.time
        ) {
          relayingBestTimesByStyleAndPool.set(key, {
            id: record.id,
            time: record.time,
            created_at: record.created_at,
            note: record.note || undefined,
            competition: record.competitions
              ? {
                  title: record.competitions.title,
                  date: record.competitions.date,
                }
              : undefined,
          });
        }
      } else {
        // 引き継ぎなしのタイム
        if (
          !bestTimesByStyleAndPool.has(key) ||
          record.time < bestTimesByStyleAndPool.get(key)!.time
        ) {
          bestTimesByStyleAndPool.set(key, {
            id: record.id,
            time: record.time,
            created_at: record.created_at,
            pool_type: poolType,
            is_relaying: false,
            note: record.note || undefined,
            style_id: record.style_id,
            style: {
              name_jp: record.styles?.name_jp || "Unknown",
              distance: record.styles?.distance || 0,
            },
            competition: record.competitions
              ? {
                  title: record.competitions.title,
                  date: record.competitions.date,
                }
              : undefined,
          });
        }
      }
    });

    // 引き継ぎなしのタイムに、引き継ぎありのタイムを紐付ける
    const result: BestTime[] = [];
    bestTimesByStyleAndPool.forEach((bestTime, key) => {
      const relayingTime = relayingBestTimesByStyleAndPool.get(key);
      result.push({
        ...bestTime,
        relayingTime: relayingTime,
      });
    });

    // 引き継ぎなしがなく、引き継ぎありのみの場合も追加
    relayingBestTimesByStyleAndPool.forEach((relayingTime, key) => {
      if (!bestTimesByStyleAndPool.has(key)) {
        // キーから種目名とプール種別を取得
        const lastUnderscoreIndex = key.lastIndexOf("_");
        if (lastUnderscoreIndex === -1) {
          return;
        }

        const styleName = key.slice(0, lastUnderscoreIndex);
        const poolTypeStr = key.slice(lastUnderscoreIndex + 1);
        const poolType = Number.isInteger(parseInt(poolTypeStr, 10))
          ? parseInt(poolTypeStr, 10)
          : NaN;
        if (Number.isNaN(poolType)) {
          return;
        }

        // 種目情報を取得（最初のレコードから）
        const record = records.find(
          (r) => (r.styles?.name_jp || "Unknown") === styleName && (r.pool_type ?? 0) === poolType,
        );

        if (record) {
          result.push({
            id: relayingTime.id,
            time: relayingTime.time,
            created_at: relayingTime.created_at,
            pool_type: poolType,
            is_relaying: true,
            note: relayingTime.note,
            style_id: record.style_id,
            style: {
              name_jp: record.styles?.name_jp || "Unknown",
              distance: record.styles?.distance || 0,
            },
            competition: relayingTime.competition,
          });
        }
      }
    });

    return result;
  }

  /**
   * 複数ユーザーの指定プール種別におけるベストタイムを1クエリで取得する。
   *
   * `getBestTimes(userId)` はユーザー1人専用のため、チームメンバー全員分を
   * ループで呼ぶと N+1 クエリになる（ベストバッジ機能で前科あり）。
   * エントリー代理入力画面のプリフィル用途では画面を開いた時点で対象になり得る
   * 全メンバーの userId をまとめて1回だけ呼ぶこと (メンバー選択のたびに発火させない)。
   *
   * 個人種目のみを対象とする (仕様: リレー種目はスコープ外) ため、
   * is_relaying=true の記録は集計から除外する。
   *
   * @param userIds 対象ユーザーIDの配列
   * @param poolType プール種別 (0: 短水路, 1: 長水路)。competitions.pool_type と同じ型
   * @returns userId → 種目ごとのベストタイム配列 の Map (記録が無いユーザーはキー自体が存在しない)
   */
  async getBestTimesForUsers(
    userIds: string[],
    poolType: PoolType,
  ): Promise<Map<string, BestTime[]>> {
    if (userIds.length === 0) return new Map();

    // クラス内の他メソッド (getBestTimes 等) と同じ明示的な認証チェック規約に揃える
    // (機能的には RLS が最終防衛線だが、規約からの逸脱を防ぐ)
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("records")
      .select(
        `
        id,
        user_id,
        time,
        created_at,
        pool_type,
        is_relaying,
        note,
        style_id,
        styles!records_style_id_fkey (
          name_jp,
          distance
        ),
        competitions!records_competition_id_fkey (
          title,
          date
        )
      `,
      )
      .in("user_id", userIds)
      .eq("pool_type", poolType)
      .order("time", { ascending: true });

    if (error) {
      console.error("複数ユーザーのベストタイム取得エラー:", error);
      throw error;
    }

    if (!data || !Array.isArray(data)) {
      return new Map();
    }

    interface UserRecordWithRelations {
      id: string;
      user_id: string;
      time: number;
      created_at: string;
      note?: string | null;
      style_id: number;
      styles?: { name_jp: string; distance: number } | null;
      competitions?: { title: string; date: string } | null;
    }

    type UserRecordWithRelationsResponse = Omit<
      UserRecordWithRelations,
      "styles" | "competitions"
    > & {
      is_relaying: boolean;
      styles?: UserRecordWithRelations["styles"] | UserRecordWithRelations["styles"][];
      competitions?:
        | UserRecordWithRelations["competitions"]
        | UserRecordWithRelations["competitions"][];
    };

    // ユーザーごとに、種目別の最速タイム (非リレー) のみを1件保持する
    const bestByUserAndStyle = new Map<string, Map<number, BestTime>>();

    for (const raw of data as UserRecordWithRelationsResponse[]) {
      if (raw.is_relaying) continue; // 個人種目のプリフィル用途のためリレーは対象外

      const styleData = Array.isArray(raw.styles) ? raw.styles[0] : raw.styles;
      const competitionData = Array.isArray(raw.competitions)
        ? raw.competitions[0]
        : raw.competitions;

      let userMap = bestByUserAndStyle.get(raw.user_id);
      if (!userMap) {
        userMap = new Map<number, BestTime>();
        bestByUserAndStyle.set(raw.user_id, userMap);
      }

      const existingBest = userMap.get(raw.style_id);
      if (existingBest && existingBest.time <= raw.time) continue;

      userMap.set(raw.style_id, {
        id: raw.id,
        time: raw.time,
        created_at: raw.created_at,
        pool_type: poolType,
        is_relaying: false,
        note: raw.note || undefined,
        style_id: raw.style_id,
        style: {
          name_jp: styleData?.name_jp || "Unknown",
          distance: styleData?.distance || 0,
        },
        competition: competitionData
          ? { title: competitionData.title, date: competitionData.date }
          : undefined,
      });
    }

    const result = new Map<string, BestTime[]>();
    for (const [userId, userMap] of bestByUserAndStyle) {
      result.set(userId, Array.from(userMap.values()));
    }
    return result;
  }

  /**
   * 指定記録を除外した、その種目・水路のユーザー自己ベスト(秒)。無ければ null。
   * beforeDate より厳密に前の記録のみ対象（当時の自己ベストとの比較）。
   * 大会記録は competitions.date、一括登録は created_at で日付比較する2クエリ方式。
   * 埋め込みリレーションへの `.lt("competition.date", ...)` フィルタは BestTimeBadge.tsx で
   * 実運用されている PostgREST の `!inner` join + ドット記法フィルタと同一パターン。
   */
  async getPreviousBestTime(
    styleId: number,
    poolType: number,
    excludeRecordId: string,
    isRelaying: boolean,
    beforeDate: string,
  ): Promise<number | null> {
    if (!Number.isFinite(styleId) || !beforeDate) return null;
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    // YYYY-MM-DD 形式の場合は当日 00:00:00.000Z に正規化して created_at 比較に使う
    const normalized = normalizeRecordDateForBulkComparison(beforeDate);

    // 1. 大会記録（competition_id あり）: competitions.date で比較
    const competitionQuery = this.supabase
      .from("records")
      .select("time, competition:competitions!inner(date)")
      .eq("user_id", user.id)
      .eq("style_id", styleId)
      .eq("pool_type", poolType)
      .eq("is_relaying", isRelaying)
      .neq("id", excludeRecordId)
      .gt("time", 0)
      .lt("competition.date", beforeDate)
      .order("time", { ascending: true })
      .limit(1);

    // 2. 一括登録（competition_id = null）: created_at で比較
    const bulkQuery = this.supabase
      .from("records")
      .select("time")
      .eq("user_id", user.id)
      .eq("style_id", styleId)
      .eq("pool_type", poolType)
      .eq("is_relaying", isRelaying)
      .is("competition_id", null)
      .neq("id", excludeRecordId)
      .gt("time", 0)
      .lt("created_at", normalized)
      .order("time", { ascending: true })
      .limit(1);

    const [compRes, bulkRes] = await Promise.all([competitionQuery, bulkQuery]);
    if (compRes.error) {
      console.error("getPreviousBestTime failed:", compRes.error);
      throw compRes.error;
    }
    if (bulkRes.error) {
      console.error("getPreviousBestTime failed:", bulkRes.error);
      throw bulkRes.error;
    }

    const compBest = (compRes.data?.[0] as { time?: number } | undefined)?.time;
    const bulkBest = (bulkRes.data?.[0] as { time?: number } | undefined)?.time;

    if (compBest != null && bulkBest != null) return Math.min(compBest, bulkBest);
    if (compBest != null) return compBest;
    if (bulkBest != null) return bulkBest;
    return null; // その日より前に記録なし = その時点で初記録
  }

  /**
   * 一覧ベストバッジ用: 種目・リレー区分（poolType 指定時は水路も）のグループ単位で、
   * ユーザーの記録候補を軽量フィールドのみ一括取得する。
   * 一覧の行ごとに getPreviousBestTime 相当の2クエリを発行すると N+1 になるため、
   * グループ単位の2クエリに集約し、「記録日時点で自己ベストだったか」の日付フィルタと
   * 自己除外は呼び出し側 (BestTimeBadge computeListPreviousBest) がメモリ上で行う。
   * time 昇順 + 上限 1000 行のため、万一切り詰められても最速側の候補は保持される。
   */
  async getListBestCandidates(
    userId: string,
    styleId: number,
    isRelaying: boolean,
    poolType?: number | null,
  ): Promise<ListBestCandidates> {
    // 1. 大会記録（competition_id あり）: 日付比較用に competitions.date を含める
    let competitionQuery = this.supabase
      .from("records")
      .select("id, time, competition:competitions!inner(date)")
      .eq("user_id", userId)
      .eq("style_id", styleId)
      .eq("is_relaying", isRelaying);

    // 2. 一括登録（competition_id = null）: 日付比較用に created_at を含める
    let bulkQuery = this.supabase
      .from("records")
      .select("id, time, created_at")
      .eq("user_id", userId)
      .eq("style_id", styleId)
      .eq("is_relaying", isRelaying)
      .is("competition_id", null);

    if (poolType !== null && poolType !== undefined) {
      competitionQuery = competitionQuery.eq("pool_type", poolType);
      bulkQuery = bulkQuery.eq("pool_type", poolType);
    }

    const [compRes, bulkRes] = await Promise.all([
      competitionQuery.order("time", { ascending: true }).limit(1000),
      bulkQuery.order("time", { ascending: true }).limit(1000),
    ]);
    if (compRes.error) {
      console.error("getListBestCandidates failed:", compRes.error);
      throw compRes.error;
    }
    if (bulkRes.error) {
      console.error("getListBestCandidates failed:", bulkRes.error);
      throw bulkRes.error;
    }

    // 埋め込みリレーションは型付きクライアントでは配列に推論されるため両形状を吸収する
    const competitionRows = (
      (compRes.data ?? []) as Array<{
        id: string;
        time: number;
        competition: { date: string } | { date: string }[] | null;
      }>
    ).flatMap((row) => {
      const competition = Array.isArray(row.competition) ? row.competition[0] : row.competition;
      return competition?.date ? [{ id: row.id, time: row.time, date: competition.date }] : [];
    });

    const bulkRows = ((bulkRes.data ?? []) as Array<{ id: string; time: number; created_at: string }>).map(
      (row) => ({ id: row.id, time: row.time, created_at: row.created_at }),
    );

    return { competitionRows, bulkRows };
  }

  // =========================================================================
  // 大会の操作
  // =========================================================================

  /**
   * 大会一覧取得
   */
  async getCompetitions(startDate?: string, endDate?: string): Promise<Competition[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    let query = this.supabase
      .from("competitions")
      .select("*")
      .or(`user_id.eq.${user.id},user_id.is.null`) // 個人大会 or 共有大会
      .order("date", { ascending: false });

    if (startDate) {
      query = query.gte("date", startDate);
    }
    if (endDate) {
      query = query.lte("date", endDate);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }

  /**
   * 大会作成
   */
  async createCompetition(competition: Omit<CompetitionInsert, "user_id">): Promise<Competition> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { data, error } = await this.supabase
      .from("competitions")
      .insert({ ...competition, user_id: user.id })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 大会更新
   */
  async updateCompetition(id: string, updates: CompetitionUpdate): Promise<Competition> {
    const { data, error } = await this.supabase
      .from("competitions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 大会削除（個人大会のみ）
   */
  async deleteCompetition(id: string): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("認証が必要です");

    const { error } = await this.supabase
      .from("competitions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id); // 個人大会のみ削除可能

    if (error) throw error;
  }

  // =========================================================================
  // スプリットタイムの操作
  // =========================================================================

  /**
   * スプリットタイム作成
   */
  async createSplitTime(splitTime: SplitTimeInsert): Promise<SplitTime> {
    const { data, error } = await this.supabase
      .from("split_times")
      .insert(splitTime)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * 複数のスプリットタイムを一括作成
   */
  async createSplitTimes(splitTimes: SplitTimeInsert[]): Promise<SplitTime[]> {
    if (splitTimes.length === 0) return [];

    const { data, error } = await this.supabase.from("split_times").insert(splitTimes).select();

    if (error) throw error;
    return data;
  }

  /**
   * 記録のスプリットタイムを全て削除して再作成
   */
  async replaceSplitTimes(
    recordId: string,
    splitTimes: Omit<SplitTimeInsert, "record_id">[],
  ): Promise<SplitTime[]> {
    // 既存のスプリットタイムを削除
    await this.supabase.from("split_times").delete().eq("record_id", recordId);

    // 新しいスプリットタイムを作成
    if (splitTimes.length === 0) return [];

    const { data, error } = await this.supabase
      .from("split_times")
      .insert(splitTimes.map((st) => ({ ...st, record_id: recordId })))
      .select();

    if (error) throw error;
    return data;
  }

  // =========================================================================
  // リアルタイム購読
  // =========================================================================

  /**
   * 記録の変更をリアルタイム購読
   * @param callback - 変更時のコールバック関数
   * @param userId - (オプション) ユーザーIDでフィルタリング。指定した場合、該当ユーザーのみの変更を受信
   */
  subscribeToRecords(callback: (record: Record) => void, userId?: string) {
    const config: RealtimeSubscriptionConfig = userId
      ? {
          event: "*",
          schema: "public",
          table: "records",
          filter: `user_id=eq.${userId}`,
        }
      : {
          event: "*",
          schema: "public",
          table: "records",
        };

    return this.supabase
      .channel("records-changes")
      .on("postgres_changes", config, (payload) => {
        if (payload.new) {
          callback(payload.new as Record);
        }
      })
      .subscribe();
  }

  /**
   * 大会の変更をリアルタイム購読
   * @param callback - 変更時のコールバック関数
   * @param userId - (オプション) ユーザーIDでフィルタリング。指定した場合、該当ユーザーのみの変更を受信
   */
  subscribeToCompetitions(callback: (competition: Competition) => void, userId?: string) {
    const config: RealtimeSubscriptionConfig = userId
      ? {
          event: "*",
          schema: "public",
          table: "competitions",
          filter: `user_id=eq.${userId}`,
        }
      : {
          event: "*",
          schema: "public",
          table: "competitions",
        };

    return this.supabase
      .channel("competitions-changes")
      .on("postgres_changes", config, (payload) => {
        if (payload.new) {
          callback(payload.new as Competition);
        }
      })
      .subscribe();
  }
}
