// =============================================================================
// チーム内フィードバック API (大会記録へのフィードバック)
// =============================================================================
// 認可は DB 側 (RLS / 列単位 GRANT / SECURITY DEFINER RPC) が担保する。
// ここはクエリを組み立てて結果を整形するだけの薄い境界層。
// 仕様: docs/specs/record-feedback.md
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import {
  RECORD_FEEDBACK_MAX_LENGTH,
  type RecordFeedback,
  type RecordFeedbackErrorCode,
  type RecordFeedbackSummary,
  type RecordFeedbackSummaryRow,
  type UnreadRecordFeedback,
} from "../types/recordFeedback";

/** PostgREST の `in` フィルタに渡す ID の上限 (URL 長対策で分割する) */
const IN_FILTER_CHUNK_SIZE = 100;

/**
 * Supabase / Postgres のエラーを機械可読なコードに変換する。
 * 表示文言への変換は UI 層が i18n で行う。
 */
export function toRecordFeedbackErrorCode(error: unknown): RecordFeedbackErrorCode {
  if (typeof error !== "object" || error === null) return "unknown";
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";

  if (code === "23505") return "duplicate";
  if (code === "23514") return "content_length";
  if (message.includes("not_team_record")) return "not_team_record";
  if (message.includes("record_not_found")) return "record_not_found";
  // 42501 = insufficient_privilege (RLS の WITH CHECK 違反を含む)
  if (code === "42501") return "not_authorized";
  // UPDATE / DELETE が RLS で 0 行になった場合 (API 側で投げる)
  if (message === "not_authorized") return "not_authorized";
  return "unknown";
}

/** 入力本文を正規化 (前後の空白を除去) し、長さを検証する */
export function normalizeRecordFeedbackContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length < 1 || trimmed.length > RECORD_FEEDBACK_MAX_LENGTH) {
    throw Object.assign(new Error("content_length"), { code: "23514" });
  }
  return trimmed;
}

/** record_id ごとの件数集計 */
export function summarizeRecordFeedbacks(
  rows: RecordFeedbackSummaryRow[],
  currentUserId: string | undefined,
): Record<string, RecordFeedbackSummary> {
  const result: Record<string, RecordFeedbackSummary> = {};
  for (const row of rows) {
    const summary = (result[row.record_id] ??= { count: 0, hasMine: false, unreadCount: 0 });
    summary.count += 1;
    if (currentUserId && row.author_id === currentUserId) summary.hasMine = true;
    if (row.read_at === null) summary.unreadCount += 1;
  }
  return result;
}

export class RecordFeedbackAPI {
  constructor(private supabase: SupabaseClient) {}

  /** 記録1件の FB 一覧 (書いた人の名前付き、作成順) */
  async listByRecord(recordId: string): Promise<RecordFeedback[]> {
    const { data, error } = await this.supabase.rpc("get_record_feedbacks", {
      p_record_id: recordId,
    });
    if (error) throw error;
    return (data ?? []) as RecordFeedback[];
  }

  /**
   * 複数記録の FB 件数集計に使う行を取得する (RLS で見える行だけ)。
   * 記録カードの「FB n件」表示と、管理者の「自分が書いたか」表示に使う。
   */
  async listSummaryRows(recordIds: string[]): Promise<RecordFeedbackSummaryRow[]> {
    const uniqueIds = Array.from(new Set(recordIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];

    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += IN_FILTER_CHUNK_SIZE) {
      chunks.push(uniqueIds.slice(i, i + IN_FILTER_CHUNK_SIZE));
    }

    const results = await Promise.all(
      chunks.map(async (ids) => {
        const { data, error } = await this.supabase
          .from("record_feedbacks")
          .select("record_id, author_id, read_at")
          .in("record_id", ids);
        if (error) throw error;
        return (data ?? []) as RecordFeedbackSummaryRow[];
      }),
    );
    return results.flat();
  }

  /** 自分宛ての未読 FB (新しい順) */
  async listUnread(): Promise<UnreadRecordFeedback[]> {
    const { data, error } = await this.supabase.rpc("get_unread_record_feedbacks");
    if (error) throw error;
    return ((data ?? []) as UnreadRecordFeedback[]).map((row) => ({
      ...row,
      time: Number(row.time),
    }));
  }

  /** FB を作成する。team_id / recipient_id は DB のトリガが埋める */
  async create(recordId: string, content: string): Promise<void> {
    const normalized = normalizeRecordFeedbackContent(content);
    const { error } = await this.supabase
      .from("record_feedbacks")
      .insert({ record_id: recordId, content: normalized });
    if (error) throw error;
  }

  /** 自分の FB の本文を更新する。本文が変わると DB 側で未読に戻る */
  async update(feedbackId: string, content: string): Promise<void> {
    const normalized = normalizeRecordFeedbackContent(content);
    const { data, error } = await this.supabase
      .from("record_feedbacks")
      .update({ content: normalized })
      .eq("id", feedbackId)
      .select("id");
    if (error) throw error;
    // RLS で対象外だと 0 行更新になりエラーにならないため、ここで検知する
    if (!data || data.length === 0) throw new Error("not_authorized");
  }

  /** 自分の FB を削除する */
  async delete(feedbackId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from("record_feedbacks")
      .delete()
      .eq("id", feedbackId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("not_authorized");
  }

  /** 記録1件の自分宛ての未読 FB を既読にする。戻り値は既読にした件数 */
  async markRead(recordId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc("mark_record_feedbacks_read", {
      p_record_id: recordId,
    });
    if (error) throw error;
    return typeof data === "number" ? data : 0;
  }
}
