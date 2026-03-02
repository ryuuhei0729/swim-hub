'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { DndContext, DragOverlay, type DragStartEvent, type DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useAuth } from '@/contexts'
import BaseModal from '@/components/ui/BaseModal'
import Avatar from '@/components/ui/Avatar'
import { TeamGroupsAPI } from '@apps/shared/api/teams/groups'
import { DraggableMemberCard } from './DraggableMemberCard'
import { DroppableGroupZone } from './DroppableGroupZone'
import type { TeamGroupWithCount } from '../hooks/useTeamGroups'

interface TeamMemberForSelection {
  id: string
  user_id: string
  users: {
    id: string
    name: string
    profile_image_path?: string | null
  }
}

interface BulkAssignModalProps {
  isOpen: boolean
  onClose: () => void
  category: string
  groups: TeamGroupWithCount[]
  teamMembers: TeamMemberForSelection[]
  teamId: string
  onSaved: () => void
}

export const BulkAssignModal: React.FC<BulkAssignModalProps> = ({
  isOpen,
  onClose,
  category,
  groups,
  teamMembers,
  teamId,
  onSaved,
}) => {
  const { supabase } = useAuth()

  // userId → groupId | null (null=未割り当て)
  const [assignments, setAssignments] = useState<Map<string, string | null>>(new Map())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  // 現在の割り当てを読み込み
  useEffect(() => {
    if (!isOpen) return
    const load = async () => {
      setLoading(true)
      try {
        const api = new TeamGroupsAPI(supabase)
        const allMemberships = await api.listAllMemberships(teamId)
        const map = new Map<string, string | null>()
        // 全メンバーをまず未割り当てとして初期化
        teamMembers.forEach((m) => map.set(m.user_id, null))
        // このカテゴリのグループに属する割り当てだけ反映
        allMemberships.forEach((m) => {
          if (groupIds.has(m.team_group_id)) {
            map.set(m.user_id, m.team_group_id)
          }
        })
        setAssignments(map)
      } catch (err) {
        console.error('割り当て情報の取得に失敗:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isOpen, teamId, supabase, teamMembers, groupIds])

  // 未割り当てメンバー
  const unassignedMembers = useMemo(() => {
    return teamMembers.filter((m) => !assignments.get(m.user_id))
  }, [teamMembers, assignments])

  // グループごとのメンバー
  const membersByGroup = useMemo(() => {
    const map = new Map<string, TeamMemberForSelection[]>()
    groups.forEach((g) => map.set(g.id, []))
    teamMembers.forEach((m) => {
      const gId = assignments.get(m.user_id)
      if (gId && map.has(gId)) {
        map.get(gId)!.push(m)
      }
    })
    return map
  }, [teamMembers, groups, assignments])

  // ドラッグ中のメンバー情報
  const activeMember = useMemo(() => {
    if (!activeId) return null
    return teamMembers.find((m) => m.user_id === activeId) ?? null
  }, [activeId, teamMembers])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const userId = active.id as string
    const targetId = over.id as string

    setAssignments((prev) => {
      const next = new Map(prev)
      if (targetId === 'unassigned') {
        next.set(userId, null)
      } else if (groupIds.has(targetId)) {
        next.set(userId, targetId)
      }
      return next
    })
  }, [groupIds])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const api = new TeamGroupsAPI(supabase)
      // グループごとに割り当てを保存
      for (const group of groups) {
        const members = membersByGroup.get(group.id) || []
        const userIds = members.map((m) => m.user_id)
        await api.setGroupMembers(group.id, userIds)
      }
      onSaved()
      onClose()
    } catch (err) {
      console.error('保存に失敗:', err)
    } finally {
      setSaving(false)
    }
  }, [supabase, groups, membersByGroup, onSaved, onClose])

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${category} — 一括振り分け`}
      size="xl"
    >
      {loading ? (
        <div className="py-12">
          <div className="animate-pulse space-y-3">
            <div className="h-6 bg-gray-200 rounded w-48 mx-auto" />
            <div className="h-40 bg-gray-200 rounded" />
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex gap-2 sm:gap-4 min-h-[300px] sm:min-h-[400px] overflow-hidden">
            {/* 左: 未割り当て */}
            <div className="w-2/5 sm:w-1/3 shrink-0">
              <DroppableGroupZone
                groupId="unassigned"
                groupName="未割り当て"
                memberCount={unassignedMembers.length}
              >
                {unassignedMembers.map((m) => (
                  <DraggableMemberCard
                    key={m.user_id}
                    userId={m.user_id}
                    userName={m.users.name}
                    avatarUrl={m.users.profile_image_path ?? null}
                  />
                ))}
              </DroppableGroupZone>
            </div>

            {/* 右: グループ一覧 */}
            <div className="flex-1 space-y-2 sm:space-y-3 overflow-y-auto max-h-[50vh] sm:max-h-[60vh]">
              {groups.map((group) => {
                const members = membersByGroup.get(group.id) || []
                return (
                  <DroppableGroupZone
                    key={group.id}
                    groupId={group.id}
                    groupName={group.name}
                    memberCount={members.length}
                  >
                    {members.map((m) => (
                      <DraggableMemberCard
                        key={m.user_id}
                        userId={m.user_id}
                        userName={m.users.name}
                        avatarUrl={m.users.profile_image_path ?? null}
                      />
                    ))}
                  </DroppableGroupZone>
                )
              })}
            </div>
          </div>

          {/* ドラッグ中のオーバーレイ */}
          <DragOverlay>
            {activeMember ? (
              <div className="flex items-center gap-1 sm:gap-2 px-1.5 py-1 sm:px-2.5 sm:py-1.5 bg-white border-2 border-blue-400 rounded-md shadow-lg">
                <div className="hidden sm:block">
                  <Avatar
                    avatarUrl={activeMember.users.profile_image_path ?? null}
                    userName={activeMember.users.name}
                    size="sm"
                  />
                </div>
                <span className="text-[11px] sm:text-xs font-medium text-gray-800">
                  {activeMember.users.name}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ボタン */}
      {!loading && (
        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      )}
    </BaseModal>
  )
}
