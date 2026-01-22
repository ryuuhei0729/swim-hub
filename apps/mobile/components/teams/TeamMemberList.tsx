import React, { useState } from 'react'
import { View, Text, FlatList, StyleSheet, Pressable, Alert, Platform } from 'react-native'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
} from '@apps/shared/hooks/queries/teams'
import type { TeamMembershipWithUser } from '@swim-hub/shared/types'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'

interface TeamMemberListProps {
  members: TeamMembershipWithUser[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  currentUserId: string
  isCurrentUserAdmin: boolean
  onRetry?: () => void
  onMemberChange?: () => void
}

/**
 * チームメンバー一覧コンポーネント
 */
export const TeamMemberList: React.FC<TeamMemberListProps> = ({
  members,
  isLoading,
  isError,
  error,
  currentUserId,
  isCurrentUserAdmin,
  onRetry,
  onMemberChange,
}) => {
  const { supabase } = useAuth()
  const updateRoleMutation = useUpdateMemberRoleMutation(supabase)
  const removeMemberMutation = useRemoveMemberMutation(supabase)
  const [processingMemberId, setProcessingMemberId] = useState<string | null>(null)

  // ロール変更処理
  const handleRoleChange = async (member: TeamMembershipWithUser, newRole: 'admin' | 'user') => {
    if (member.role === newRole) return

    setProcessingMemberId(member.id)
    try {
      await updateRoleMutation.mutateAsync({
        teamId: member.team_id,
        userId: member.user_id,
        role: newRole,
      })
      if (onMemberChange) {
        onMemberChange()
      }
    } catch (err) {
      console.error('ロール変更エラー:', err)
      const errorMessage = err instanceof Error ? err.message : 'ロールの変更に失敗しました'
      if (Platform.OS === 'web') {
        window.alert(errorMessage)
      } else {
        Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
      }
    } finally {
      setProcessingMemberId(null)
    }
  }

  // メンバー削除処理
  const handleRemoveMember = (member: TeamMembershipWithUser) => {
    const memberName = member.users.name || 'このメンバー'
    const confirmMessage = `${memberName}をチームから削除しますか？\nこの操作は取り消せません。`

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(confirmMessage)
      if (!confirmed) return
      executeRemoveMember(member)
    } else {
      Alert.alert('削除確認', confirmMessage, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => executeRemoveMember(member),
        },
      ])
    }
  }

  const executeRemoveMember = async (member: TeamMembershipWithUser) => {
    setProcessingMemberId(member.id)
    try {
      await removeMemberMutation.mutateAsync({
        teamId: member.team_id,
        userId: member.user_id,
      })
      if (onMemberChange) {
        onMemberChange()
      }
    } catch (err) {
      console.error('メンバー削除エラー:', err)
      const errorMessage = err instanceof Error ? err.message : 'メンバーの削除に失敗しました'
      if (Platform.OS === 'web') {
        window.alert(errorMessage)
      } else {
        Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
      }
    } finally {
      setProcessingMemberId(null)
    }
  }
  // ローディング状態
  if (isLoading && members.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner message="メンバーを読み込み中..." />
      </View>
    )
  }

  // エラー状態
  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || 'メンバー一覧の取得に失敗しました'}
          onRetry={onRetry}
        />
      </View>
    )
  }

  // 空状態
  if (members.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>メンバーがいません</Text>
      </View>
    )
  }

  // メンバータイプの表示テキスト
  const getMemberTypeText = (memberType: string | null): string => {
    switch (memberType) {
      case 'swimmer':
        return '選手'
      case 'coach':
        return 'コーチ'
      case 'director':
        return '監督'
      case 'manager':
        return 'マネージャー'
      default:
        return ''
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const user = item.users
          const isCurrentUser = item.user_id === currentUserId
          const roleText = item.role === 'admin' ? '管理者' : 'メンバー'
          const memberTypeText = getMemberTypeText(item.member_type)
          const joinedDate = format(new Date(item.joined_at), 'yyyy年M月d日', { locale: ja })

          const isProcessing = processingMemberId === item.id
          const canManage = isCurrentUserAdmin && !isCurrentUser

          return (
            <View style={styles.memberItem}>
              <View style={styles.memberHeader}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {user.name || '名前未設定'}
                    {isCurrentUser && <Text style={styles.currentUserMark}> (あなた)</Text>}
                  </Text>
                  <View style={styles.memberBadges}>
                    {canManage ? (
                      <Pressable
                        style={[styles.badge, item.role === 'admin' && styles.adminBadge]}
                        onPress={() =>
                          handleRoleChange(item, item.role === 'admin' ? 'user' : 'admin')
                        }
                        disabled={isProcessing}
                      >
                        <Text style={[styles.badgeText, item.role === 'admin' && styles.adminBadgeText]}>
                          {roleText} (タップで変更)
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.badge, item.role === 'admin' && styles.adminBadge]}>
                        <Text style={[styles.badgeText, item.role === 'admin' && styles.adminBadgeText]}>
                          {roleText}
                        </Text>
                      </View>
                    )}
                    {memberTypeText && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{memberTypeText}</Text>
                      </View>
                    )}
                  </View>
                </View>
                {canManage && (
                  <Pressable
                    style={[styles.deleteButton, isProcessing && styles.deleteButtonDisabled]}
                    onPress={() => handleRemoveMember(item)}
                    disabled={isProcessing}
                  >
                    <Text style={styles.deleteButtonText}>
                      {isProcessing ? '処理中...' : '削除'}
                    </Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.joinedDate}>参加日: {joinedDate}</Text>
            </View>
          )
        }}
        contentContainerStyle={styles.listContent}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  memberItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  memberInfo: {
    gap: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  currentUserMark: {
    fontSize: 14,
    fontWeight: '400',
    color: '#2563EB',
  },
  memberBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminBadge: {
    backgroundColor: '#DBEAFE',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  adminBadgeText: {
    color: '#2563EB',
  },
  joinedDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#DC2626',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
})
