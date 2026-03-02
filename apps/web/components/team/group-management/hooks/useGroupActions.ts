import { useState, useCallback, useMemo } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TeamGroupsAPI } from '@apps/shared/api/teams/groups'
import type { TeamGroup, TeamGroupMembership } from '@swim-hub/shared/types'

/**
 * グループCRUD操作ラッパー
 */
export const useGroupActions = (teamId: string, supabase: SupabaseClient, onSuccess?: () => void) => {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const api = useMemo(() => new TeamGroupsAPI(supabase), [supabase])

  const createGroup = useCallback(async (category: string | null, name: string): Promise<TeamGroup | null> => {
    try {
      setSaving(true)
      setError(null)
      const result = await api.create({
        team_id: teamId,
        category,
        name,
        created_by: '', // APIが上書きする
      })
      onSuccess?.()
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'グループの作成に失敗しました'
      if (message.includes('23505') || message.includes('duplicate') || message.includes('unique')) {
        setError('同じカテゴリに同名のグループが既に存在します')
      } else {
        setError(message)
      }
      return null
    } finally {
      setSaving(false)
    }
  }, [teamId, api, onSuccess])

  /** カンマ区切りで複数グループを一括作成 */
  const createGroups = useCallback(async (category: string | null, names: string[]): Promise<boolean> => {
    try {
      setSaving(true)
      setError(null)
      const errors: string[] = []
      for (const name of names) {
        try {
          await api.create({
            team_id: teamId,
            category,
            name,
            created_by: '',
          })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : '作成に失敗'
          if (message.includes('23505') || message.includes('duplicate') || message.includes('unique')) {
            errors.push(`「${name}」は既に存在します`)
          } else {
            errors.push(`「${name}」: ${message}`)
          }
        }
      }
      onSuccess?.()
      if (errors.length > 0) {
        setError(errors.join('\n'))
        return false
      }
      return true
    } finally {
      setSaving(false)
    }
  }, [teamId, api, onSuccess])

  const updateGroup = useCallback(async (id: string, category: string | null, name: string): Promise<TeamGroup | null> => {
    try {
      setSaving(true)
      setError(null)
      const result = await api.update(id, { category, name })
      onSuccess?.()
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'グループの更新に失敗しました'
      if (message.includes('23505') || message.includes('duplicate') || message.includes('unique')) {
        setError('同じカテゴリに同名のグループが既に存在します')
      } else {
        setError(message)
      }
      return null
    } finally {
      setSaving(false)
    }
  }, [api, onSuccess])

  const deleteGroup = useCallback(async (id: string): Promise<boolean> => {
    try {
      setSaving(true)
      setError(null)
      await api.remove(id)
      onSuccess?.()
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'グループの削除に失敗しました'
      setError(message)
      return false
    } finally {
      setSaving(false)
    }
  }, [api, onSuccess])

  const listGroupMembers = useCallback(async (groupId: string): Promise<(TeamGroupMembership & { users: { id: string; name: string; profile_image_path: string | null } })[]> => {
    try {
      setError(null)
      return await api.listGroupMembers(groupId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'メンバー情報の取得に失敗しました'
      setError(message)
      return []
    }
  }, [api])

  const setGroupMembers = useCallback(async (groupId: string, userIds: string[]): Promise<boolean> => {
    try {
      setSaving(true)
      setError(null)
      await api.setGroupMembers(groupId, userIds)
      onSuccess?.()
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'メンバーの割り当てに失敗しました'
      setError(message)
      return false
    } finally {
      setSaving(false)
    }
  }, [api, onSuccess])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    saving,
    error,
    createGroup,
    createGroups,
    updateGroup,
    deleteGroup,
    listGroupMembers,
    setGroupMembers,
    clearError,
  }
}
