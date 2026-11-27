// =============================================================================
// チーム内フィードバック (大会記録へのフィードバック) 型定義
// =============================================================================
// DB: supabase/migrations/20261128000000_add_record_feedbacks.sql
// 仕様: docs/specs/record-feedback.md
// =============================================================================

/** FB 本文の最大文字数 (前後の空白を除いた文字数。DB の CHECK 制約と同じ値) */
export const RECORD_FEEDBACK_MAX_LENGTH = 1000;

/** get_record_feedbacks RPC の1行 */
export interface RecordFeedback {
  id: string;
  record_id: string;
  team_id: string;
  recipient_id: string;
  /** アカウント削除済みの場合 null */
  author_id: string | null;
  /** アカウント削除済みの場合 null */
  author_name: string | null;
  author_profile_image_path: string | null;
  content: string;
  /** null = 未読 */
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

/** record_feedbacks テーブルを直接 SELECT した件数集計用の1行 (RLS で見える行だけ) */
export interface RecordFeedbackSummaryRow {
  record_id: string;
  author_id: string | null;
  read_at: string | null;
}

/** 記録ごとの FB 件数集計 */
export interface RecordFeedbackSummary {
  /** 閲覧できる FB の件数 */
  count: number;
  /** 自分が書いた FB があるか */
  hasMine: boolean;
  /** 未読の FB の件数 (自分宛てのもののみ意味を持つ) */
  unreadCount: number;
}

/** get_unread_record_feedbacks RPC の1行 (ダッシュボードのポップアップ用) */
export interface UnreadRecordFeedback {
  id: string;
  record_id: string;
  team_id: string;
  author_id: string | null;
  author_name: string | null;
  updated_at: string;
  competition_id: string | null;
  competition_title: string | null;
  competition_date: string | null;
  style_id: number;
  time: number;
  pool_type: number;
  is_relaying: boolean;
  record_created_at: string;
}

/** DB / トリガが返す機械可読なエラーコード */
export type RecordFeedbackErrorCode =
  | "duplicate"
  | "not_team_record"
  | "record_not_found"
  | "not_authorized"
  | "content_length"
  | "unknown";
