import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TeamGroupsAPI } from '@apps/shared/api/teams/groups'
import type { TeamGroup, TeamGroupMembership, TeamMembershipWithUser } from '@swim-hub/shared/types'

interface TeamMemberGroupFilterProps {
  teamId: string
  supabase: SupabaseClient
  members: TeamMembershipWithUser[]
  onFilteredMembersChange: (filtered: TeamMembershipWithUser[]) => void
}

/**
 * モバイル用グループフィルターコンポーネント
 * 横スクロール可能なピルボタンでカテゴリ別にフィルタリング
 */
export const TeamMemberGroupFilter: React.FC<TeamMemberGroupFilterProps> = ({
  teamId,
  supabase,
  members,
  onFilteredMembersChange,
}) => {
  const [groups, setGroups] = useState<TeamGroup[]>([])
  const [memberships, setMemberships] = useState<TeamGroupMembership[]>([])
  const [selectedFilters, setSelectedFilters] = useState<Map<string, Set<string>>>(new Map())
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
        console.error('グループフィルター情報の取得に失敗:', err)
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

  // user_id → groupId[] のマップ
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

  const hasActiveFilters = selectedFilters.size > 0

  // フィルター切り替え
  const toggleFilter = useCallback((category: string, groupId: string) => {
    setSelectedFilters((prev) => {
      const next = new Map(prev)
      const catSet = new Set(next.get(category) || [])
      if (catSet.has(groupId)) {
        catSet.delete(groupId)
      } else {
        catSet.add(groupId)
      }
      if (catSet.size === 0) {
        next.delete(category)
      } else {
        next.set(category, catSet)
      }
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setSelectedFilters(new Map())
  }, [])

  // フィルタリング結果を親に通知
  useEffect(() => {
    if (!hasActiveFilters) {
      onFilteredMembersChange(members)
      return
    }
    const filtered = members.filter((member) => {
      const memberGroupIds = userGroupMap.get(member.user_id) || new Set()
      for (const [, selectedGroupIds] of selectedFilters) {
        let matchesCategory = false
        for (const groupId of selectedGroupIds) {
          if (memberGroupIds.has(groupId)) {
            matchesCategory = true
            break
          }
        }
        if (!matchesCategory) return false
      }
      return true
    })
    onFilteredMembersChange(filtered)
  }, [members, selectedFilters, hasActiveFilters, userGroupMap, onFilteredMembersChange])

  if (loading || categories.length === 0) return null

  return (
    <View style={styles.container}>
      {categories.map((category) => {
        const catGroups = groupsByCategory.get(category) || []
        const selectedIds = selectedFilters.get(category) || new Set()

        return (
          <View key={category} style={styles.categoryRow}>
            <Text style={styles.categoryLabel}>{category}:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsContainer}
            >
              {catGroups.map((group) => {
                const isSelected = selectedIds.has(group.id)
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => toggleFilter(category, group.id)}
                    style={[styles.pill, isSelected && styles.pillSelected]}
                  >
                    <Text style={[styles.pillText, isSelected && styles.pillTextSelected]}>
                      {group.name}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        )
      })}
      {hasActiveFilters && (
        <Pressable onPress={clearFilters} style={styles.clearButton}>
          <Text style={styles.clearText}>フィルターをクリア</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    minWidth: 40,
  },
  pillsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  pillSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  pillText: {
    fontSize: 12,
    color: '#4B5563',
  },
  pillTextSelected: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  clearButton: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  clearText: {
    fontSize: 11,
    color: '#6B7280',
  },
})
