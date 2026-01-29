'use client'

// =============================================================================
// 練習ログテンプレート React Query Hooks
// =============================================================================

import { useMemo } from 'react'
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PracticeLogTemplateAPI } from '../../api/practiceLogTemplates'
import type {
  PracticeLogTemplate,
  CreatePracticeLogTemplateInput,
} from '../../types/practiceLogTemplate'
import { practiceLogTemplateKeys } from './keys'

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * テンプレート一覧を取得するhook
 */
export function usePracticeLogTemplatesQuery(
  supabase: SupabaseClient
): UseQueryResult<PracticeLogTemplate[], Error> {
  const api = useMemo(
    () => new PracticeLogTemplateAPI(supabase),
    [supabase]
  )

  return useQuery({
    queryKey: practiceLogTemplateKeys.list(),
    queryFn: () => api.getTemplates(),
    staleTime: 5 * 60 * 1000, // 5分
  })
}

/**
 * テンプレート数を取得するhook
 */
export function usePracticeLogTemplateCountQuery(
  supabase: SupabaseClient
): UseQueryResult<number, Error> {
  const api = useMemo(
    () => new PracticeLogTemplateAPI(supabase),
    [supabase]
  )

  return useQuery({
    queryKey: practiceLogTemplateKeys.count(),
    queryFn: () => api.countTemplates(),
    staleTime: 5 * 60 * 1000,
  })
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * テンプレートを作成するmutation hook
 */
export function useCreatePracticeLogTemplateMutation(
  supabase: SupabaseClient
): UseMutationResult<PracticeLogTemplate, Error, CreatePracticeLogTemplateInput> {
  const queryClient = useQueryClient()
  const api = useMemo(
    () => new PracticeLogTemplateAPI(supabase),
    [supabase]
  )

  return useMutation({
    mutationFn: (input: CreatePracticeLogTemplateInput) =>
      api.createTemplate(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: practiceLogTemplateKeys.all,
      })
    },
  })
}

/**
 * テンプレートを更新するmutation hook
 */
export function useUpdatePracticeLogTemplateMutation(
  supabase: SupabaseClient
): UseMutationResult<
  PracticeLogTemplate,
  Error,
  { templateId: string; input: Partial<CreatePracticeLogTemplateInput> }
> {
  const queryClient = useQueryClient()
  const api = useMemo(
    () => new PracticeLogTemplateAPI(supabase),
    [supabase]
  )

  return useMutation({
    mutationFn: ({ templateId, input }) => api.updateTemplate(templateId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: practiceLogTemplateKeys.all,
      })
    },
  })
}

/**
 * テンプレートを削除するmutation hook
 */
export function useDeletePracticeLogTemplateMutation(
  supabase: SupabaseClient
): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const api = useMemo(
    () => new PracticeLogTemplateAPI(supabase),
    [supabase]
  )

  return useMutation({
    mutationFn: (templateId: string) => api.deleteTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: practiceLogTemplateKeys.all,
      })
    },
  })
}

/**
 * テンプレートを使用するmutation hook（use_countをインクリメント）
 */
export function useUsePracticeLogTemplateMutation(
  supabase: SupabaseClient
): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const api = useMemo(
    () => new PracticeLogTemplateAPI(supabase),
    [supabase]
  )

  return useMutation({
    mutationFn: (templateId: string) => api.useTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: practiceLogTemplateKeys.all,
      })
    },
  })
}

/**
 * お気に入りを切り替えるmutation hook
 */
export function useTogglePracticeLogTemplateFavoriteMutation(
  supabase: SupabaseClient
): UseMutationResult<PracticeLogTemplate, Error, string> {
  const queryClient = useQueryClient()
  const api = useMemo(
    () => new PracticeLogTemplateAPI(supabase),
    [supabase]
  )

  return useMutation({
    mutationFn: (templateId: string) => api.toggleFavorite(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: practiceLogTemplateKeys.all,
      })
    },
  })
}
