import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, Modal, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TeamGroupWithCount } from './hooks'

interface MemberInfo {
  id: string
  user_id: string
  role: string
  users: {
    id: string
    name: string
    profile_image_path: string | null
  }
}

interface GroupMemberListModalProps {
  visible: boolean
  onClose: () => void
  group: TeamGroupWithCount | null
  teamId: string
  supabase: SupabaseClient
}

export const GroupMemberListModal: React.FC<GroupMemberListModalProps> = ({
  visible,
  onClose,
  group,
  teamId,
  supabase,
}) => {
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [loading, setLoading] = useState(false)

  const loadMembers = useCallback(async () => {
    if (!group) return
    setLoading(true)
    try {
      const { data: groupMemberships, error: gmError } = await supabase
        .from('team_group_memberships')
        .select('user_id')
        .eq('team_group_id', group.id)
      if (gmError) throw gmError

      const userIds = (groupMemberships ?? []).map((m: { user_id: string }) => m.user_id)
      if (userIds.length === 0) {
        setMembers([])
        return
      }

      const { data, error: tmError } = await supabase
        .from('team_memberships')
        .select(`
          id,
          user_id,
          role,
          users!team_memberships_user_id_fkey (
            id,
            name,
            profile_image_path
          )
        `)
        .eq('team_id', teamId)
        .eq('status', 'approved')
        .eq('is_active', true)
        .in('user_id', userIds)
        .order('role', { ascending: true })

      if (tmError) throw tmError
      setMembers((data ?? []) as unknown as MemberInfo[])
    } catch (err) {
      console.error('グループメンバー取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }, [group, teamId, supabase])

  useEffect(() => {
    if (visible && group) {
      loadMembers()
    }
  }, [visible, group, loadMembers])

  if (!group) return null

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{group.name}</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.body}>
            {/* メンバー数 */}
            <View style={styles.countRow}>
              <Feather name="users" size={14} color="#6B7280" />
              <Text style={styles.countText}>{members.length}人のメンバー</Text>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
              </View>
            ) : members.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="users" size={40} color="#D1D5DB" />
                <Text style={styles.emptyText}>メンバーが登録されていません</Text>
              </View>
            ) : (
              <FlatList
                data={members}
                keyExtractor={(item) => item.id}
                style={styles.memberList}
                renderItem={({ item }) => (
                  <View style={styles.memberRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {item.users?.name || '名前未設定'}
                    </Text>
                    {item.role === 'admin' && (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>管理者</Text>
                      </View>
                    )}
                  </View>
                )}
              />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
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
    fontSize: 24,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 28,
  },
  body: {
    padding: 16,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  countText: {
    fontSize: 13,
    color: '#6B7280',
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  memberList: {
    maxHeight: 350,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
  },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    marginLeft: 8,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
})
