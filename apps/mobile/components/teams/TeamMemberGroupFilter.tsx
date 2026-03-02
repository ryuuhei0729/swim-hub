import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TeamGroupsAPI } from '@apps/shared/api/teams/groups'
import type { TeamGroup, TeamGroupMembership, TeamMembershipWithUser } from '@swim-hub/shared/types'

interface MemberGroupSorterProps {
  teamId: string
  supabase: SupabaseClient
  members: TeamMembershipWithUser[]
  onGroupedMembersChange: (
    sorted: TeamMembershipWithUser[],
    groupHeaders: Map<number, string>,
  ) => void
}

/**
 * グループ表示コンポーネント（WEB版 MemberGroupSorter 準拠）
 * カテゴリボタンをタップするとメンバーをグループ別に並び替え、
 * グループヘッダーのインデックスを親に通知する
 */
export const TeamMemberGroupFilter: React.FC<MemberGroupSorterProps> = ({
  teamId,
  supabase,
  members,
  onGroupedMembersChange,
}) => {
  const [groups, setGroups] = useState<TeamGroup[]>([])
  const [memberships, setMemberships] = useState<TeamGroupMembership[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // グループとメンバーシップを取得
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const api = new TeamGroupsAPI(supabase)
        const [groupsData, membershipsData] = await Promise.all([
          api.list(teamId),
          api.listAllMemberships(teamId),
        ])
        setGroups(groupsData)
        setMemberships(membershipsData)
      } catch (err) {
        console.error('グループ情報の取得に失敗:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [teamId, supabase])

  // カテゴリ別グループ
  const groupsByCategory = useMemo(() => {
    const map = new Map<string, TeamGroup[]>()
    for (const group of groups) {
      if (!group.category) continue
      if (!map.has(group.category)) {
        map.set(group.category, [])
      }
      map.get(group.category)!.push(group)
    }
    return map
  }, [groups])

  const categories = useMemo(() => [...groupsByCategory.keys()].sort(), [groupsByCategory])

  // user_id → groupId Set のマップ
  const userGroupMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const m of memberships) {
      if (!map.has(m.user_id)) {
        map.set(m.user_id, new Set())
      }
      map.get(m.user_id)!.add(m.team_group_id)
    }
    return map
  }, [memberships])

  // カテゴリトグル
  const toggleCategory = useCallback((category: string) => {
    setActiveCategory((prev) => (prev === category ? null : category))
  }, [])

  // グルーピング結果を親に通知
  useEffect(() => {
    if (!activeCategory) {
      // グルーピングなし → メンバーそのまま、ヘッダーなし
      onGroupedMembersChange(members, new Map())
      return
    }

    const categoryGroups = groupsByCategory.get(activeCategory) || []
    const flat: TeamMembershipWithUser[] = []
    const headers = new Map<number, string>()
    const assigned = new Set<string>()

    for (const group of categoryGroups) {
      const groupMembers = members.filter((m) => {
        const memberGroups = userGroupMap.get(m.user_id)
        return memberGroups?.has(group.id)
      })
      headers.set(flat.length, group.name)
      flat.push(...groupMembers)
      groupMembers.forEach((m) => assigned.add(m.user_id))
    }

    // 未所属メンバー
    const unassigned = members.filter((m) => !assigned.has(m.user_id))
    if (unassigned.length > 0) {
      headers.set(flat.length, '未所属')
      flat.push(...unassigned)
    }

    onGroupedMembersChange(flat, headers)
  }, [members, activeCategory, groupsByCategory, userGroupMap, onGroupedMembersChange])

  if (loading || categories.length === 0) return null

  return (
    <View style={styles.container}>
      <Text style={styles.label}>グループ表示:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsContainer}
      >
        {categories.map((category) => {
          const isActive = activeCategory === category
          return (
            <Pressable
              key={category}
              onPress={() => toggleCategory(category)}
              style={[styles.pill, isActive && styles.pillActive]}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                {category}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  pillsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  pillActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  pillText: {
    fontSize: 12,
    color: '#4B5563',
  },
  pillTextActive: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
})
