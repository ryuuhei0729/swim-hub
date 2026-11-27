// =============================================================================
// チーム内フィードバック (大会記録へのフィードバック) の React Query フック
// =============================================================================
// 仕様: docs/specs/record-feedback.md
// =============================================================================

"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { RecordFeedbackAPI, summarizeRecordFeedbacks } from "../../api/recordFeedbacks";
import type {
  RecordFeedback,
  RecordFeedbackSummary,
  UnreadRecordFeedback,
} from "../../types/recordFeedback";

export const recordFeedbackKeys = {
  all: ["recordFeedbacks"] as const,
  byRecord: (recordId: string) => [...recordFeedbackKeys.all, "record", recordId] as const,
  summaries: () => [...recordFeedbackKeys.all, "summaries"] as const,
  summary: (userId: string | undefined, recordIds: string[]) =>
    [...recordFeedbackKeys.summaries(), userId ?? "", ...[...new Set(recordIds)].sort()] as const,
  unread: (userId: string | undefined) => [...recordFeedbackKeys.all, "unread", userId ?? ""] as const,
} as const;

function useRecordFeedbackApi(supabase: SupabaseClient, api?: RecordFeedbackAPI) {
  return useMemo(() => api ?? new RecordFeedbackAPI(supabase), [supabase, api]);
}

/** 記録1件の FB 一覧 (書いた人の名前付き) */
export function useRecordFeedbacksQuery(
  supabase: SupabaseClient,
  recordId: string | undefined | null,
  options: { enabled?: boolean; api?: RecordFeedbackAPI } = {},
) {
  const { enabled = true, api } = options;
  const feedbackApi = useRecordFeedbackApi(supabase, api);
  return useQuery<RecordFeedback[]>({
    queryKey: recordFeedbackKeys.byRecord(recordId ?? ""),
    queryFn: () => {
      if (!recordId) throw new Error("recordId is required");
      return feedbackApi.listByRecord(recordId);
    },
    enabled: !!recordId && enabled,
    staleTime: 30 * 1000,
  });
}

/**
 * 複数記録の FB 件数集計 (記録カードの「FB n件」表示用)。
 * 戻り値は record_id → 集計。FB が無い記録はキー自体が無い。
 */
export function useRecordFeedbackSummariesQuery(
  supabase: SupabaseClient,
  recordIds: string[],
  currentUserId: string | undefined,
  options: { enabled?: boolean; api?: RecordFeedbackAPI } = {},
) {
  const { enabled = true, api } = options;
  const feedbackApi = useRecordFeedbackApi(supabase, api);
  const uniqueSortedIds = useMemo(
    () => [...new Set(recordIds.filter(Boolean))].sort(),
    [recordIds],
  );
  return useQuery<Record<string, RecordFeedbackSummary>>({
    queryKey: recordFeedbackKeys.summary(currentUserId, uniqueSortedIds),
    queryFn: async () => {
      const rows = await feedbackApi.listSummaryRows(uniqueSortedIds);
      return summarizeRecordFeedbacks(rows, currentUserId);
    },
    enabled: enabled && !!currentUserId && uniqueSortedIds.length > 0,
    staleTime: 30 * 1000,
  });
}

/** 自分宛ての未読 FB (ダッシュボードのポップアップ用) */
export function useUnreadRecordFeedbacksQuery(
  supabase: SupabaseClient,
  currentUserId: string | undefined,
  options: { enabled?: boolean; api?: RecordFeedbackAPI } = {},
) {
  const { enabled = true, api } = options;
  const feedbackApi = useRecordFeedbackApi(supabase, api);
  return useQuery<UnreadRecordFeedback[]>({
    queryKey: recordFeedbackKeys.unread(currentUserId),
    queryFn: () => feedbackApi.listUnread(),
    enabled: enabled && !!currentUserId,
    // ダッシュボードを表示するたびに確認する
    staleTime: 0,
    refetchOnMount: "always",
  });
}

function useInvalidateRecordFeedbacks() {
  const queryClient = useQueryClient();
  return (recordId?: string) =>
    Promise.all([
      recordId
        ? queryClient.invalidateQueries({ queryKey: recordFeedbackKeys.byRecord(recordId) })
        : queryClient.invalidateQueries({ queryKey: recordFeedbackKeys.all }),
      queryClient.invalidateQueries({ queryKey: recordFeedbackKeys.summaries() }),
      queryClient.invalidateQueries({ queryKey: [...recordFeedbackKeys.all, "unread"] }),
    ]);
}

/** FB を作成する (管理者) */
export function useCreateRecordFeedbackMutation(supabase: SupabaseClient, api?: RecordFeedbackAPI) {
  const feedbackApi = useRecordFeedbackApi(supabase, api);
  const invalidate = useInvalidateRecordFeedbacks();
  return useMutation({
    mutationFn: ({ recordId, content }: { recordId: string; content: string }) =>
      feedbackApi.create(recordId, content),
    onSuccess: (_data, variables) => invalidate(variables.recordId),
  });
}

/** 自分の FB を編集する (管理者) */
export function useUpdateRecordFeedbackMutation(supabase: SupabaseClient, api?: RecordFeedbackAPI) {
  const feedbackApi = useRecordFeedbackApi(supabase, api);
  const invalidate = useInvalidateRecordFeedbacks();
  return useMutation({
    mutationFn: ({
      feedbackId,
      content,
    }: {
      feedbackId: string;
      recordId: string;
      content: string;
    }) => feedbackApi.update(feedbackId, content),
    onSuccess: (_data, variables) => invalidate(variables.recordId),
  });
}

/** 自分の FB を削除する (管理者) */
export function useDeleteRecordFeedbackMutation(supabase: SupabaseClient, api?: RecordFeedbackAPI) {
  const feedbackApi = useRecordFeedbackApi(supabase, api);
  const invalidate = useInvalidateRecordFeedbacks();
  return useMutation({
    mutationFn: ({ feedbackId }: { feedbackId: string; recordId: string }) =>
      feedbackApi.delete(feedbackId),
    onSuccess: (_data, variables) => invalidate(variables.recordId),
  });
}

/** 記録1件の自分宛ての未読 FB を既読にする (選手本人) */
export function useMarkRecordFeedbacksReadMutation(
  supabase: SupabaseClient,
  api?: RecordFeedbackAPI,
) {
  const feedbackApi = useRecordFeedbackApi(supabase, api);
  const invalidate = useInvalidateRecordFeedbacks();
  return useMutation({
    mutationFn: ({ recordId }: { recordId: string }) => feedbackApi.markRead(recordId),
    onSuccess: (count, variables) => {
      if (count > 0) return invalidate(variables.recordId);
      return undefined;
    },
  });
}
