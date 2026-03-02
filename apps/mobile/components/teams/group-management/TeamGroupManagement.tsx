import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import type { TeamMembershipWithUser } from '@swim-hub/shared/types'
import { useTeamGroups, useGroupActions, type TeamGroupWithCount } from './hooks'
import { CategorySection } from './CategorySection'
import { GroupFormModal } from './GroupFormModal'
import { GroupMemberModal } from './GroupMemberModal'
import { GroupMemberListModal } from './GroupMemberListModal'
import { BulkAssignModal } from './BulkAssignModal'

interface TeamGroupManagementProps {
  teamId: string
  members: TeamMembershipWithUser[]
  isCurrentUserAdmin: boolean
}

interface TeamMemberForSelection {
  id: string
  user_id: string
  users: {
    id: string
    name: string
    profile_image_path?: string | null
  }
}

export const TeamGroupManagement: React.FC<TeamGroupManagementProps> = ({
  teamId,
  members: _members,
  isCurrentUserAdmin,
}) => {
  const { supabase } = useAuth()

  // グループデータ
  const { groups, categories, groupsByCategory, loading, error, loadGroups } =
    useTeamGroups(teamId, supabase)

  // CRUD操作
  const {
    saving,
    error: actionError,
    createGroup,
    createGroups,
    updateGroup,
    deleteGroup,
    listGroupMembers,
    setGroupMembers,
    clearError,
  } = useGroupActions(teamId, supabase, loadGroups)

  // チームメンバー一覧（メンバー割り当て用）
  const [teamMembers, setTeamMembers] = useState<TeamMemberForSelection[]>([])

  // モーダル状態
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<TeamGroupWithCount | null>(null)
  const [memberModalGroup, setMemberModalGroup] = useState<TeamGroupWithCount | null>(null)
  const [currentGroupMemberIds, setCurrentGroupMemberIds] = useState<string[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [viewMembersGroup, setViewMembersGroup] = useState<TeamGroupWithCount | null>(null)
  const [bulkAssignCategory, setBulkAssignCategory] = useState<string | null>(null)

  // 初期読み込み
  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // チームメンバー一覧を取得
  useEffect(() => {
    const loadTeamMembers = async () => {
      const { data, error: fetchError } = await supabase
        .from('team_memberships')
        .select(`
          id,
          user_id,
          users!team_memberships_user_id_fkey (
            id,
            name,
            profile_image_path
          )
        `)
        .eq('team_id', teamId)
        .eq('status', 'approved')
        .eq('is_active', true)
      if (!fetchError && data) {
        setTeamMembers(data as unknown as TeamMemberForSelection[])
      }
    }
    loadTeamMembers()
  }, [teamId, supabase])

  // グループ作成/編集ハンドラ
  const handleFormSubmit = useCallback(async (
    category: string | null,
    name: string,
  ): Promise<boolean> => {
    if (editingGroup) {
      const result = await updateGroup(editingGroup.id, category, name)
      return result !== null
    } else {
      // カンマ区切りで複数グループ作成に対応
      const names = name.split(',').map((n) => n.trim()).filter((n) => n.length > 0)
      if (names.length === 0) return false
      if (names.length === 1) {
        const result = await createGroup(category, names[0])
        return result !== null
      }
      return await createGroups(category, names)
    }
  }, [editingGroup, createGroup, createGroups, updateGroup])

  // グループ削除ハンドラ
  const handleDeleteGroup = useCallback((group: TeamGroupWithCount) => {
    Alert.alert(
      '確認',
      `「${group.name}」を削除しますか？\nグループに割り当てられたメンバー情報も削除されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => deleteGroup(group.id),
        },
      ],
    )
  }, [deleteGroup])

  // メンバー編集モーダルを開く
  const handleManageMembers = useCallback(async (group: TeamGroupWithCount) => {
    setLoadingMembers(true)
    setMemberModalGroup(group)
    const groupMembers = await listGroupMembers(group.id)
    setCurrentGroupMemberIds(groupMembers.map((m) => m.user_id))
    setLoadingMembers(false)
  }, [listGroupMembers])

  // メンバー保存
  const handleSaveMembers = useCallback(async (groupId: string, userIds: string[]): Promise<boolean> => {
    return await setGroupMembers(groupId, userIds)
  }, [setGroupMembers])

  // 編集モーダルを開く
  const handleEditGroup = useCallback((group: TeamGroupWithCount) => {
    clearError()
    setEditingGroup(group)
    setShowGroupForm(true)
  }, [clearError])

  // 新規作成モーダルを開く
  const handleOpenCreateForm = useCallback(() => {
    clearError()
    setEditingGroup(null)
    setShowGroupForm(true)
  }, [clearError])

  // グループカードタップ → メンバー一覧表示
  const handleGroupPress = useCallback((group: TeamGroupWithCount) => {
    setViewMembersGroup(group)
  }, [])

  // 一括振り分けモーダルを開く
  const handleBulkAssign = useCallback((category: string) => {
    setBulkAssignCategory(category)
  }, [])

  // ローディング
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    )
  }

  // カテゴリの表示順: 名前付きカテゴリ → 未分類
  const sortedCategoryKeys = [...groupsByCategory.keys()].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a.localeCompare(b)
  })

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* ヘッダー */}
        <View style={styles.headerRow}>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>グループ管理</Text>
            <Text style={styles.headerSubtitle}>メンバーをカテゴリ別にグループ分けできます</Text>
          </View>
          {isCurrentUserAdmin && (
            <Pressable
              style={styles.addButton}
              onPress={handleOpenCreateForm}
              accessibilityRole="button"
              accessibilityLabel="グループを追加"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addButtonText}>追加</Text>
            </Pressable>
          )}
        </View>

        {/* エラー */}
        {(error || actionError) && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error || actionError}</Text>
          </View>
        )}

        {/* グループ一覧 */}
        {groups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="layers" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>まだグループがありません</Text>
            {isCurrentUserAdmin && (
              <Text style={styles.emptyHint}>
                「追加」からカテゴリとグループを作成しましょう
              </Text>
            )}
          </View>
        ) : (
          <View style={styles.categoryList}>
            {sortedCategoryKeys.map((categoryKey) => {
              const categoryGroups = groupsByCategory.get(categoryKey) || []
              return (
                <CategorySection
                  key={categoryKey ?? '__null'}
                  category={categoryKey}
                  groups={categoryGroups}
                  isAdmin={isCurrentUserAdmin}
                  onGroupPress={handleGroupPress}
                  onEditGroup={handleEditGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onManageMembers={handleManageMembers}
                  onBulkAssign={handleBulkAssign}
                />
              )
            })}
          </View>
        )}
      </ScrollView>

      {/* グループ作成/編集モーダル */}
      <GroupFormModal
        visible={showGroupForm}
        onClose={() => {
          setShowGroupForm(false)
          setEditingGroup(null)
          clearError()
        }}
        onSubmit={handleFormSubmit}
        existingCategories={categories}
        editingGroup={editingGroup}
        saving={saving}
        error={actionError}
      />

      {/* メンバー割り当てモーダル */}
      <GroupMemberModal
        visible={memberModalGroup !== null}
        onClose={() => {
          setMemberModalGroup(null)
          setCurrentGroupMemberIds([])
        }}
        group={memberModalGroup}
        teamMembers={teamMembers}
        currentMemberUserIds={currentGroupMemberIds}
        onSave={handleSaveMembers}
        saving={saving}
        loading={loadingMembers}
      />

      {/* グループメンバー一覧モーダル */}
      <GroupMemberListModal
        visible={viewMembersGroup !== null}
        onClose={() => setViewMembersGroup(null)}
        group={viewMembersGroup}
        teamId={teamId}
        supabase={supabase}
      />

      {/* 一括振り分けモーダル */}
      {bulkAssignCategory !== null && (
        <BulkAssignModal
          visible={true}
          onClose={() => setBulkAssignCategory(null)}
          category={bulkAssignCategory}
          groups={groupsByCategory.get(bulkAssignCategory) || []}
          teamMembers={teamMembers}
          teamId={teamId}
          supabase={supabase}
          onSaved={loadGroups}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2563EB',
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  emptyHint: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  categoryList: {
    gap: 12,
  },
})
