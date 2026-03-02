import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, StyleSheet, type LayoutRectangle } from 'react-native'
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TeamGroupsAPI } from '@apps/shared/api/teams/groups'
import type { TeamGroupWithCount } from './hooks'

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
  visible: boolean
  onClose: () => void
  category: string
  groups: TeamGroupWithCount[]
  teamMembers: TeamMemberForSelection[]
  teamId: string
  supabase: SupabaseClient
  onSaved: () => void
}

const UNASSIGNED_ZONE = 'unassigned'

export const BulkAssignModal: React.FC<BulkAssignModalProps> = ({
  visible,
  onClose,
  category,
  groups,
  teamMembers,
  teamId,
  supabase,
  onSaved,
}) => {
  const [assignments, setAssignments] = useState<Map<string, string | null>>(new Map())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draggedUserId, setDraggedUserId] = useState<string | null>(null)
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)

  const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups])

  // ドロップゾーンの絶対座標を保持
  const zoneRects = useRef<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())

  // ドラッグ位置
  const dragX = useSharedValue(0)
  const dragY = useSharedValue(0)
  const isDragging = useSharedValue(false)

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value - 60 },
      { translateY: dragY.value - 18 },
    ],
    opacity: isDragging.value ? 1 : 0,
  }))

  // 割り当て読み込み
  useEffect(() => {
    if (!visible) return
    const load = async () => {
      setLoading(true)
      try {
        const api = new TeamGroupsAPI(supabase)
        const allMemberships = await api.listAllMemberships(teamId)
        const map = new Map<string, string | null>()
        teamMembers.forEach((m) => map.set(m.user_id, null))
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
  }, [visible, teamId, supabase, teamMembers, groupIds])

  // ゾーン位置を登録（measureInWindow で絶対座標取得）
  const registerZoneRef = useCallback((zoneId: string, ref: View | null) => {
    if (!ref) return
    // measureInWindow は画面上の絶対座標を返す
    ref.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) {
        zoneRects.current.set(zoneId, { x, y, width, height })
      }
    })
  }, [])

  // 座標からゾーンを特定
  const findZoneAtPosition = useCallback((absX: number, absY: number): string | null => {
    for (const [zoneId, rect] of zoneRects.current) {
      if (
        absX >= rect.x && absX <= rect.x + rect.width &&
        absY >= rect.y && absY <= rect.y + rect.height
      ) {
        return zoneId
      }
    }
    return null
  }, [])

  const handleDrop = useCallback((userId: string, targetZone: string | null) => {
    setDraggedUserId(null)
    setHoveredZone(null)
    if (!targetZone) return
    setAssignments((prev) => {
      const next = new Map(prev)
      next.set(userId, targetZone === UNASSIGNED_ZONE ? null : targetZone)
      return next
    })
  }, [])

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

  // ドラッグ中のメンバー名
  const draggedMemberName = useMemo(() => {
    if (!draggedUserId) return ''
    return teamMembers.find((m) => m.user_id === draggedUserId)?.users.name || ''
  }, [draggedUserId, teamMembers])

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const api = new TeamGroupsAPI(supabase)
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

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  // ゾーン位置を再計測（スクロール後など）
  const remeasureAllZones = useCallback(() => {
    // 少し遅延させて layout 確定後に計測
    setTimeout(() => {
      zoneRefs.current.forEach((ref, zoneId) => {
        if (ref) {
          ref.measureInWindow((x, y, width, height) => {
            if (width > 0 && height > 0) {
              zoneRects.current.set(zoneId, { x, y, width, height })
            }
          })
        }
      })
    }, 50)
  }, [])

  // ゾーンのView refを保持
  const zoneRefs = useRef<Map<string, View>>(new Map())

  const setZoneRef = useCallback((zoneId: string) => (ref: View | null) => {
    if (ref) {
      zoneRefs.current.set(zoneId, ref)
      registerZoneRef(zoneId, ref)
    }
  }, [registerZoneRef])

  // UIスレッドから呼ばれるハンドラ（JS側で実行）
  const handleDragUpdate = useCallback((absX: number, absY: number) => {
    const zone = findZoneAtPosition(absX, absY)
    setHoveredZone(zone)
  }, [findZoneAtPosition])

  const handleDragEnd = useCallback((userId: string, absX: number, absY: number) => {
    const zone = findZoneAtPosition(absX, absY)
    handleDrop(userId, zone)
  }, [findZoneAtPosition, handleDrop])

  // ドラッグ可能なメンバーチップ
  const DraggableMemberChip = useCallback(({ member }: { member: TeamMemberForSelection }) => {
    const gesture = Gesture.Pan()
      .activateAfterLongPress(200)
      .onStart((e) => {
        isDragging.value = true
        dragX.value = e.absoluteX
        dragY.value = e.absoluteY
        runOnJS(setDraggedUserId)(member.user_id)
      })
      .onUpdate((e) => {
        dragX.value = e.absoluteX
        dragY.value = e.absoluteY
        runOnJS(handleDragUpdate)(e.absoluteX, e.absoluteY)
      })
      .onEnd((e) => {
        isDragging.value = false
        runOnJS(handleDragEnd)(member.user_id, e.absoluteX, e.absoluteY)
      })
      .onFinalize(() => {
        isDragging.value = false
        runOnJS(setDraggedUserId)(null)
        runOnJS(setHoveredZone)(null)
      })

    const beingDragged = draggedUserId === member.user_id

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.chip, beingDragged && styles.chipDragging]}>
          <Text style={styles.chipText} numberOfLines={1}>{member.users.name}</Text>
        </Animated.View>
      </GestureDetector>
    )
  }, [draggedUserId, handleDragUpdate, handleDragEnd, isDragging, dragX, dragY])

  // ドロップゾーン
  const DropZone = useCallback(({
    zoneId, label, members: zoneMembers, variant,
  }: {
    zoneId: string; label: string; members: TeamMemberForSelection[]; variant: 'unassigned' | 'group'
  }) => {
    const isHovered = hoveredZone === zoneId
    return (
      <View
        ref={setZoneRef(zoneId)}
        style={[
          styles.zone,
          variant === 'unassigned' && styles.zoneUnassigned,
          isHovered && styles.zoneHovered,
        ]}
        collapsable={false}
      >
        <View style={styles.zoneHeader}>
          <Text style={[styles.zoneLabel, variant === 'unassigned' && styles.zoneLabelUnassigned]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.zoneCount}>{zoneMembers.length}</Text>
        </View>
        <View style={styles.chips}>
          {zoneMembers.map((m) => (
            <DraggableMemberChip key={m.user_id} member={m} />
          ))}
          {zoneMembers.length === 0 && (
            <Text style={styles.zoneEmpty}>
              {isHovered ? 'ここにドロップ' : ''}
            </Text>
          )}
        </View>
      </View>
    )
  }, [hoveredZone, setZoneRef, DraggableMemberChip])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.fullScreen}>
          {/* ヘッダー */}
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{category} — 一括振り分け</Text>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>長押し + ドラッグでメンバーを移動</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          ) : (
            /* 左右2カラム: 未割り当て | グループ一覧 */
            <View
              style={styles.columns}
              onLayout={remeasureAllZones}
            >
              {/* 左カラム: 未割り当て */}
              <ScrollView
                style={styles.leftColumn}
                contentContainerStyle={styles.columnContent}
                onScrollEndDrag={remeasureAllZones}
                onMomentumScrollEnd={remeasureAllZones}
              >
                <DropZone
                  zoneId={UNASSIGNED_ZONE}
                  label="未割り当て"
                  members={unassignedMembers}
                  variant="unassigned"
                />
              </ScrollView>

              {/* 右カラム: グループ一覧 */}
              <ScrollView
                style={styles.rightColumn}
                contentContainerStyle={styles.columnContent}
                onScrollEndDrag={remeasureAllZones}
                onMomentumScrollEnd={remeasureAllZones}
              >
                {groups.map((group) => (
                  <DropZone
                    key={group.id}
                    zoneId={group.id}
                    label={group.name}
                    members={membersByGroup.get(group.id) || []}
                    variant="group"
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* フッター */}
          {!loading && (
            <View style={styles.footer}>
              <Pressable
                style={[styles.btn, styles.btnCancel]}
                onPress={handleClose}
                disabled={saving}
              >
                <Text style={styles.btnCancelText}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnSave, saving && styles.btnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.btnSaveText}>
                  {saving ? '保存中...' : '保存'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ドラッグオーバーレイ */}
        <Animated.View style={[styles.dragOverlay, overlayStyle]} pointerEvents="none">
          <Text style={styles.dragOverlayText} numberOfLines={1}>{draggedMemberName}</Text>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 26,
  },
  hint: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* 左右2カラム */
  columns: {
    flex: 1,
    flexDirection: 'row',
  },
  leftColumn: {
    width: '40%',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
  },
  rightColumn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  columnContent: {
    padding: 8,
    gap: 8,
  },

  /* ドロップゾーン */
  zone: {
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 8,
    minHeight: 50,
    backgroundColor: '#FFFFFF',
  },
  zoneUnassigned: {
    backgroundColor: '#F9FAFB',
    borderColor: '#9CA3AF',
  },
  zoneHovered: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  zoneLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  zoneLabelUnassigned: {
    color: '#6B7280',
  },
  zoneCount: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  zoneEmpty: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    paddingVertical: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },

  /* メンバーチップ */
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    maxWidth: 110,
  },
  chipDragging: {
    opacity: 0.25,
  },
  chipText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '500',
  },

  /* ドラッグオーバーレイ */
  dragOverlay: {
    position: 'absolute',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 9999,
  },
  dragOverlayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },

  /* フッター */
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  btn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: '#F3F4F6',
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  btnSave: {
    backgroundColor: '#2563EB',
  },
  btnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  btnSaveText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
})
