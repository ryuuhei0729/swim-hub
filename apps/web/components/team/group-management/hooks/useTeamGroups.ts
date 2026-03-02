import { useState, useCallback, useMemo } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TeamGroupsAPI } from '@apps/shared/api/teams/groups'
import type { TeamGroup } from '@swim-hub/shared/types'

export type TeamGroupWithCount = TeamGroup & { member_count: number }

/**
 * グループ一覧取得 + カテゴリ導出
 */
export const useTeamGroups = (teamId: string, supabase: SupabaseClient) => {
  const [groups, setGroups] = useState<TeamGroupWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const api = new TeamGroupsAPI(supabase)
      const data = await api.listWithMemberCount(teamId)
      setGroups(data)
    } catch (err) {
      console.error('グループ情報の取得に失敗:', err)
      setError('グループ情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase])

  // カテゴリ一覧を導出
  const categories = useMemo(() => {
    const cats = [...new Set(groups.map((g) => g.category).filter(Boolean))] as string[]
    cats.sort()
    return cats
  }, [groups])

  // カテゴリ別グループ
  const groupsByCategory = useMemo(() => {
    const map = new Map<string | null, TeamGroupWithCount[]>()
    for (const group of groups) {
      const key = group.category
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(group)
    }
    return map
  }, [groups])

  return {
    groups,
    categories,
    groupsByCategory,
    loading,
    error,
    loadGroups,
  }
}
