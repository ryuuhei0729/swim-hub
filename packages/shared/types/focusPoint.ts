// =============================================================================
// フォーカスポイントの型定義
// =============================================================================

/** active = 取り組み中 (同時に FOCUS_POINT_MAX_ACTIVE 個まで) / mastered = 身についた */
export type FocusPointStatus = "active" | "mastered";

/** focus_points テーブルの1行 */
export interface FocusPoint {
  id: string;
  user_id: string;
  title: string;
  note: string | null;
  status: FocusPointStatus;
  mastered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFocusPointInput {
  title: string;
  note?: string | null;
}

export interface UpdateFocusPointInput {
  title?: string;
  note?: string | null;
}

/**
 * チーム管理者がメンバーのフォーカスポイントを見るときの1行
 * (RPC get_team_member_focus_points の戻り値。user_id は返さない)
 */
export type TeamMemberFocusPoint = Pick<
  FocusPoint,
  "id" | "title" | "note" | "status" | "mastered_at" | "created_at"
>;
