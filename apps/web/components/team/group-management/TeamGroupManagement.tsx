'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts'
import { PlusIcon } from '@heroicons/react/24/outline'
import { useTeamGroups, type TeamGroupWithCount } from './hooks/useTeamGroups'
import { useGroupActions } from './hooks/useGroupActions'
import { BulkAssignModal, CategorySection, GroupFormModal, GroupMemberListModal, GroupMemberModal } from './components'
import MemberDetailModal from '@/components/team/MemberDetailModal'
import type { MemberDetail } from '@/types/member-detail'

interface TeamGroupManagementProps {
  teamId: string
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

export default function TeamGroupManagement({ teamId }: TeamGroupManagementProps) {
  const { supabase, user } = useAuth()

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

  // メンバー一覧表示モーダル（カードクリック時）
  const [viewMembersGroup, setViewMembersGroup] = useState<TeamGroupWithCount | null>(null)
  // メンバー詳細モーダル
  const [selectedMember, setSelectedMember] = useState<MemberDetail | null>(null)
  // 一括振り分けモーダル
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
  const handleDeleteGroup = useCallback(async (group: TeamGroupWithCount) => {
    if (!window.confirm(`「${group.name}」を削除しますか？\nグループに割り当てられたメンバー情報も削除されます。`)) {
      return
    }
    await deleteGroup(group.id)
  }, [deleteGroup])

  // メンバー編集モーダルを開く
  const handleManageMembers = useCallback(async (group: TeamGroupWithCount) => {
    setLoadingMembers(true)
    setMemberModalGroup(group)
    const members = await listGroupMembers(group.id)
    setCurrentGroupMemberIds(members.map((m) => m.user_id))
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

  // グループカードクリック → メンバー一覧表示
  const handleGroupClick = useCallback((group: TeamGroupWithCount) => {
    setViewMembersGroup(group)
  }, [])

  // メンバー一覧からメンバー詳細を開く
  const handleMemberClick = useCallback((member: MemberDetail) => {
    setSelectedMember(member)
  }, [])

  // 一括振り分けモーダルを開く
  const handleBulkAssign = useCallback((category: string) => {
    setBulkAssignCategory(category)
  }, [])

  // ローディング
  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-32"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  // カテゴリの表示順: 名前付きカテゴリ → 未分類
  const sortedCategoryKeys = [...groupsByCategory.keys()].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a.localeCompare(b)
  })

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">グループ管理</h2>
          <p className="text-xs text-gray-500 mt-1">
            メンバーをカテゴリ別にグループ分けできます
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreateForm}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <PlusIcon className="h-4 w-4" />
          グループを追加
        </button>
      </div>

      {/* エラー */}
      {(error || actionError) && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-700">{error || actionError}</p>
        </div>
      )}

      {/* グループ一覧 */}
      {groups.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-3">
            <PlusIcon className="h-12 w-12 mx-auto" />
          </div>
          <p className="text-gray-500 text-sm">まだグループがありません</p>
          <p className="text-gray-400 text-xs mt-1">
            「グループを追加」からカテゴリとグループを作成しましょう
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedCategoryKeys.map((categoryKey) => {
            const categoryGroups = groupsByCategory.get(categoryKey) || []
            return (
              <CategorySection
                key={categoryKey ?? '__null'}
                category={categoryKey}
                groups={categoryGroups}
                onGroupClick={handleGroupClick}
                onEditGroup={handleEditGroup}
                onDeleteGroup={handleDeleteGroup}
                onManageMembers={handleManageMembers}
                onBulkAssign={handleBulkAssign}
              />
            )
          })}
        </div>
      )}

      {/* グループ作成/編集モーダル */}
      <GroupFormModal
        isOpen={showGroupForm}
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
        isOpen={memberModalGroup !== null}
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

      {/* グループメンバー一覧モーダル（カードクリック時） */}
      <GroupMemberListModal
        isOpen={viewMembersGroup !== null}
        onClose={() => setViewMembersGroup(null)}
        group={viewMembersGroup}
        teamId={teamId}
        onMemberClick={handleMemberClick}
      />

      {/* メンバー詳細モーダル */}
      <MemberDetailModal
        isOpen={selectedMember !== null}
        onClose={() => setSelectedMember(null)}
        member={selectedMember}
        currentUserId={user?.id || ''}
        isCurrentUserAdmin={true}
        onMembershipChange={loadGroups}
      />

      {/* 一括振り分けモーダル */}
      {bulkAssignCategory !== null && (
        <BulkAssignModal
          isOpen={true}
          onClose={() => setBulkAssignCategory(null)}
          category={bulkAssignCategory}
          groups={groupsByCategory.get(bulkAssignCategory) || []}
          teamMembers={teamMembers}
          teamId={teamId}
          onSaved={loadGroups}
        />
      )}
    </div>
  )
}
