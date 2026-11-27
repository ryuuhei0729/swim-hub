"use client";

import { useAuth } from "@/contexts";
import { useRecordFeedbackSummariesQuery } from "@apps/shared/hooks/queries/recordFeedbacks";
import type { RecordFeedbackSummary } from "@apps/shared/types/recordFeedback";

const EMPTY_SUMMARIES: Record<string, RecordFeedbackSummary> = {};

/**
 * 表示中の記録 ID 群について、閲覧できるフィードバックの件数集計を返す。
 * 取得に失敗しても画面は壊さず、件数を出さないだけにする。
 */
export function useRecordFeedbackSummaries(
  recordIds: string[],
  options: { enabled?: boolean } = {},
): Record<string, RecordFeedbackSummary> {
  const { supabase, user } = useAuth();
  const query = useRecordFeedbackSummariesQuery(supabase, recordIds, user?.id, options);
  return query.data ?? EMPTY_SUMMARIES;
}
