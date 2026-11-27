"use client";

import React from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { useRecordFeedbacksQuery } from "@apps/shared/hooks/queries/recordFeedbacks";
import { RecordFeedbackCountBadge } from "./RecordFeedbackCountBadge";

interface RecordFeedbackRecordBadgeProps {
  recordId: string;
}

/**
 * 記録1件の「FB n件」表示 (チーム記録の詳細カード用)。
 * 下の RecordFeedbackSection と同じクエリ (キャッシュ) を使う。
 * 呼び出し側はチーム記録のときだけ描画すること。
 */
export const RecordFeedbackRecordBadge: React.FC<RecordFeedbackRecordBadgeProps> = ({ recordId }) => {
  const { supabase, user } = useAuth();
  const { data } = useRecordFeedbacksQuery(supabase, recordId);
  const feedbacks = data ?? [];
  const hasUnread =
    !!user?.id && feedbacks.some((f) => f.read_at === null && f.recipient_id === user.id);
  return <RecordFeedbackCountBadge count={feedbacks.length} hasUnread={hasUnread} />;
};
