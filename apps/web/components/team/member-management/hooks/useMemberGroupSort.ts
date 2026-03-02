import { useState, useCallback, useEffect, useMemo } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TeamGroupsAPI } from '@apps/shared/api/teams/groups'
import type { TeamGroup, TeamGroupMembership } from '@swim-hub/shared/types'
import type { TeamMember } from './useMembers'

export interface MemberGroup {
  groupName: string
  members: TeamMember[]
}

const GENDER_CATEGORY = '性別'

/**
 * メンバー一覧のグループ別表示機能
 *
 * カテゴリを選択すると、そのカテゴリ内のグループごとにメンバーを分類して表示する
 * デフォルトで性別によるグルーピングが有効
 */
export const useMemberGroupSort = (teamId: string, supabase: SupabaseClient) => {
  const [groups, setGroups] = useState<TeamGroup[]>([])
  const [memberships, setMemberships] = useState<TeamGroupMembership[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(GENDER_CATEGORY)

  // グループとメンバーシップを取得
  useEffect(() => {
    const load = async () => {
      try {
        const api = new TeamGroupsAPI(supabase)
        const [groupsData, membershipsData] = await Promise.all([
          api.list(teamId),
          api.listAllMemberships(teamId),
        ])
        setGroups(groupsData)
        setMemberships(membershipsData)
      } catch (err) {
        console.error('グループ情報の取得に失敗:', err)
      }
    }
    load()
  }, [teamId, supabase])

  // カテゴリ一覧（性別は常に先頭に表示）
  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const group of groups) {
      if (group.category) cats.add(group.category)
    }
    return [GENDER_CATEGORY, ...[...cats].sort()].filter((v, i, a) => a.indexOf(v) === i)
  }, [groups])

  // カテゴリ別グループ
  const groupsByCategory = useMemo(() => {
    const map = new Map<string, TeamGroup[]>()
    for (const group of groups) {
      if (!group.category) continue
      if (!map.has(group.category)) map.set(group.category, [])
      map.get(group.category)!.push(group)
    }
    return map
  }, [groups])

  // user_id → groupId set
  const userGroupMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const m of memberships) {
      if (!map.has(m.user_id)) map.set(m.user_id, new Set())
      map.get(m.user_id)!.add(m.team_group_id)
    }
    return map
  }, [memberships])

  // カテゴリ切り替え
  const toggleCategory = useCallback((category: string) => {
    setActiveCategory((prev) => (prev === category ? null : category))
  }, [])

  // メンバーをグループ別に分類
  const groupMembers = useCallback(
    (members: TeamMember[]): MemberGroup[] | null => {
      if (!activeCategory) return null

      // 性別カテゴリの場合はユーザープロファイルのgenderで分類
      if (activeCategory === GENDER_CATEGORY) {
        const result: MemberGroup[] = []
        const maleMembers = members.filter((m) => m.users?.gender === 0)
        const femaleMembers = members.filter((m) => m.users?.gender === 1)

        if (maleMembers.length > 0) result.push({ groupName: '男性', members: maleMembers })
        if (femaleMembers.length > 0) result.push({ groupName: '女性', members: femaleMembers })

        return result
      }

      const categoryGroups = groupsByCategory.get(activeCategory) || []
      const result: MemberGroup[] = []
      const assigned = new Set<string>()

      for (const group of categoryGroups) {
        const groupMemberList = members.filter((m) => {
          const memberGroups = userGroupMap.get(m.user_id)
          return memberGroups?.has(group.id)
        })
        result.push({ groupName: group.name, members: groupMemberList })
        groupMemberList.forEach((m) => assigned.add(m.user_id))
      }

      // 未所属メンバー
      const unassigned = members.filter((m) => !assigned.has(m.user_id))
      if (unassigned.length > 0) {
        result.push({ groupName: '未所属', members: unassigned })
      }

      return result
    },
    [activeCategory, groupsByCategory, userGroupMap]
  )

  return {
    categories,
    activeCategory,
    toggleCategory,
    groupMembers,
  }
}
