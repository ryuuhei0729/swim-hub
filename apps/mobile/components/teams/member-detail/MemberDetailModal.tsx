import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
} from '@apps/shared/hooks/queries/teams'
import { useBestTimesQuery } from '@apps/shared/hooks/queries/records'
import type { TeamMembershipWithUser } from '@swim-hub/shared/types'
import { ProfileSection } from './ProfileSection'
import { AdminControls } from './AdminControls'
import { BestTimesTable } from './BestTimesTable'

interface MemberDetailModalProps {
  isOpen: boolean
  onClose: () => void
  member: TeamMembershipWithUser | null
  currentUserId: string
  isCurrentUserAdmin: boolean
  onMembershipChange?: () => void
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({
  isOpen,
  onClose,
  member,
  currentUserId,
  isCurrentUserAdmin,
  onMembershipChange,
}) => {
  const { supabase } = useAuth()
  const updateRoleMutation = useUpdateMemberRoleMutation(supabase)
  const removeMemberMutation = useRemoveMemberMutation(supabase)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ベストタイム取得
  const {
    data: bestTimes = [],
    isLoading: loadingBestTimes,
    error: bestTimesError,
  } = useBestTimesQuery(supabase, {
    userId: member?.user_id,
  })

  const isCurrentUser = member?.user_id === currentUserId
  const canManage = isCurrentUserAdmin && !isCurrentUser

  // ロール変更
  const handleRoleChangeClick = useCallback((newRole: 'admin' | 'user') => {
    if (!member || member.role === newRole) return

    const memberName = member.users?.name || 'このメンバー'
    const roleName = newRole === 'admin' ? '管理者' : 'ユーザー'
    const message = `${memberName}さんの権限を「${roleName}」に変更しますか？`

    const execute = async () => {
      try {
        setError(null)
        await updateRoleMutation.mutateAsync({
          teamId: member.team_id,
          userId: member.user_id,
          role: newRole,
        })
        onMembershipChange?.()
      } catch (err) {
        console.error('権限変更エラー:', err)
        const errorMsg = err instanceof Error ? err.message : '権限の変更に失敗しました'
        setError(errorMsg)
      }
    }

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        execute()
      }
    } else {
      Alert.alert('権限変更の確認', message, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '変更する', onPress: execute },
      ])
    }
  }, [member, updateRoleMutation, onMembershipChange])

  // メンバー削除
  const handleRemoveMember = useCallback(() => {
    if (!member) return

    const memberName = member.users?.name || 'このメンバー'
    const message = `${memberName}をチームから削除しますか？\nこの操作は取り消せません。`

    const execute = async () => {
      setIsRemoving(true)
      try {
        setError(null)
        await removeMemberMutation.mutateAsync({
          teamId: member.team_id,
          userId: member.user_id,
        })
        onMembershipChange?.()
        onClose()
      } catch (err) {
        console.error('メンバー削除エラー:', err)
        const errorMsg = err instanceof Error ? err.message : 'メンバーの削除に失敗しました'
        setError(errorMsg)
      } finally {
        setIsRemoving(false)
      }
    }

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        execute()
      }
    } else {
      Alert.alert('削除確認', message, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: execute },
      ])
    }
  }, [member, removeMemberMutation, onMembershipChange, onClose])

  if (!member) return null

  const displayError = error || (bestTimesError ? bestTimesError.message : null)

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>メンバー詳細</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Feather name="x" size={22} color="#374151" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* エラー表示 */}
          {displayError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{displayError}</Text>
            </View>
          )}

          {/* プロフィール */}
          <ProfileSection member={member} currentUserId={currentUserId} />

          {/* 区切り線 */}
          <View style={styles.divider} />

          {/* 管理者機能 */}
          {canManage && (
            <>
              <AdminControls
                member={member}
                isRemoving={isRemoving}
                onRoleChangeClick={handleRoleChangeClick}
                onRemoveMember={handleRemoveMember}
              />
              <View style={styles.divider} />
            </>
          )}

          {/* ベストタイム */}
          <View style={styles.bestTimesSection}>
            <View style={styles.bestTimesHeader}>
              <Feather name="award" size={18} color="#EAB308" />
              <Text style={styles.bestTimesTitle}>Best Time</Text>
            </View>

            {loadingBestTimes ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>ベストタイム読込中...</Text>
              </View>
            ) : (
              <BestTimesTable bestTimes={bestTimes} />
            )}
          </View>

          {/* 閉じるボタン */}
          <Pressable style={styles.closeFooterButton} onPress={onClose}>
            <Text style={styles.closeFooterButtonText}>閉じる</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  bestTimesSection: {
    gap: 12,
  },
  bestTimesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bestTimesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  closeFooterButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'flex-end',
    marginTop: 20,
  },
  closeFooterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
