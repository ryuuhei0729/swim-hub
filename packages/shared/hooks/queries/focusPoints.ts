"use client";

// =============================================================================
// フォーカスポイント React Query Hooks
// =============================================================================

import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FocusPointAPI, isFocusPointLimitError } from "../../api/focusPoints";
import type {
  CreateFocusPointInput,
  FocusPoint,
  FocusPointStatus,
  UpdateFocusPointInput,
} from "../../types/focusPoint";
import { focusPointKeys } from "./keys";

/** 取り組み中と身についたに分けたもの */
export interface SplitFocusPoints {
  /** 取り組み中 (追加した順) */
  active: FocusPoint[];
  /** 身についた (新しく身についた順) */
  mastered: FocusPoint[];
}

export function splitFocusPoints(points: FocusPoint[]): SplitFocusPoints {
  const active = points.filter((p) => p.status === "active");
  const mastered = points
    .filter((p) => p.status === "mastered")
    .sort((a, b) => (b.mastered_at ?? "").localeCompare(a.mastered_at ?? ""));
  return { active, mastered };
}

/**
 * 自分のフォーカスポイント一覧。userId が無い (未ログイン) 間は取得しない
 */
export function useFocusPointsQuery(
  supabase: SupabaseClient,
  userId: string | undefined,
): UseQueryResult<FocusPoint[], Error> {
  const api = useMemo(() => new FocusPointAPI(supabase), [supabase]);

  return useQuery({
    queryKey: focusPointKeys.list(),
    queryFn: () => api.getFocusPoints(),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 上限で止められた = 手元の一覧が古い (別の端末・Web で増えていた) ので、取り直して件数を合わせる
 */
function refetchOnLimitError(queryClient: ReturnType<typeof useQueryClient>) {
  return (error: Error) => {
    if (isFocusPointLimitError(error)) {
      void queryClient.invalidateQueries({ queryKey: focusPointKeys.all });
    }
  };
}

export function useCreateFocusPointMutation(
  supabase: SupabaseClient,
): UseMutationResult<FocusPoint, Error, CreateFocusPointInput> {
  const queryClient = useQueryClient();
  const api = useMemo(() => new FocusPointAPI(supabase), [supabase]);

  return useMutation({
    mutationFn: (input: CreateFocusPointInput) => api.createFocusPoint(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: focusPointKeys.all }),
    onError: refetchOnLimitError(queryClient),
  });
}

export function useUpdateFocusPointMutation(
  supabase: SupabaseClient,
): UseMutationResult<FocusPoint, Error, { id: string; input: UpdateFocusPointInput }> {
  const queryClient = useQueryClient();
  const api = useMemo(() => new FocusPointAPI(supabase), [supabase]);

  return useMutation({
    mutationFn: ({ id, input }) => api.updateFocusPoint(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: focusPointKeys.all }),
  });
}

export function useSetFocusPointStatusMutation(
  supabase: SupabaseClient,
): UseMutationResult<FocusPoint, Error, { id: string; status: FocusPointStatus }> {
  const queryClient = useQueryClient();
  const api = useMemo(() => new FocusPointAPI(supabase), [supabase]);

  return useMutation({
    mutationFn: ({ id, status }) => api.setStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: focusPointKeys.all }),
    onError: refetchOnLimitError(queryClient),
  });
}

export function useDeleteFocusPointMutation(
  supabase: SupabaseClient,
): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const api = useMemo(() => new FocusPointAPI(supabase), [supabase]);

  return useMutation({
    mutationFn: (id: string) => api.deleteFocusPoint(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: focusPointKeys.all }),
  });
}
