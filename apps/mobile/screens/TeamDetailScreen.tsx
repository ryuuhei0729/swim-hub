import React, { useState, useMemo } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Platform } from 'react-native'
import { useRoute, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '@/contexts/AuthProvider'
import { useTeamsQuery, useDeleteAnnouncementMutation } from '@apps/shared/hooks/queries/teams'
import {
  TeamTabs,
  TeamMemberList,
  TeamAnnouncementList,
  TeamAnnouncementForm,
  TeamBulkRegisterForm,
  type TeamTabType,
} from '@/components/teams'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { MainStackParamList } from '@/navigation/types'
import type { TeamAnnouncement } from '@swim-hub/shared/types/database'

type TeamDetailScreenRouteProp = RouteProp<MainStackParamList, 'TeamDetail'>
type TeamDetailScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * チーム詳細画面
 * チーム情報、メンバー、お知らせ、練習、大会を表示
 */
export const TeamDetailScreen: React.FC = () => {
  const route = useRoute<TeamDetailScreenRouteProp>()
  const { teamId } = route.params
  const { supabase, user } = useAuth()
  const deleteAnnouncementMutation = useDeleteAnnouncementMutation(supabase)
  const [activeTab, setActiveTab] = useState<TeamTabType>('members')
  const [isAnnouncementFormVisible, setIsAnnouncementFormVisible] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<TeamAnnouncement | undefined>()

  // チームデータ取得
  const {
    currentTeam,
    members,
    announcements,
    isLoading,
    isError,
    error,
    refetch,
  } = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false, // モバイルでは一旦無効化
  })

  // 現在のユーザーのメンバーシップ情報を取得
  const currentUserMembership = useMemo(() => {
    if (!user || !members) return null
    return members.find((m) => m.user_id === user.id) || null
  }, [user, members])

  // 管理者かどうか
  const isAdmin = currentUserMembership?.role === 'admin'

  // 招待コードをコピー
  const handleCopyInviteCode = () => {
    if (!currentTeam.invite_code) return

    if (Platform.OS === 'web') {
      // Web版ではClipboard APIを使用
      if (navigator.clipboard) {
        navigator.clipboard.writeText(currentTeam.invite_code).then(
          () => {
            window.alert('招待コードをコピーしました')
          },
          () => {
            window.alert('コピーに失敗しました')
          }
        )
      } else {
        // フォールバック: テキストエリアを使用
        const textArea = document.createElement('textarea')
        textArea.value = currentTeam.invite_code
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        try {
          document.execCommand('copy')
          window.alert('招待コードをコピーしました')
        } catch {
          window.alert('コピーに失敗しました')
        }
        document.body.removeChild(textArea)
      }
    } else {
      // ネイティブ版ではClipboard APIを使用（react-native-clipboard/clipboardが必要な場合があるが、一旦Alertで表示）
      Alert.alert('招待コード', currentTeam.invite_code, [{ text: 'OK' }])
    }
  }

  // エラー状態
  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || 'チーム情報の取得に失敗しました'}
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    )
  }

  // ローディング状態
  if (isLoading && !currentTeam) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="チーム情報を読み込み中..." />
      </View>
    )
  }

  // チームが見つからない場合
  if (!currentTeam) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>チームが見つかりません</Text>
        </View>
      </View>
    )
  }

  // タブコンテンツのレンダリング
  const renderTabContent = () => {
    switch (activeTab) {
      case 'members':
        return (
          <TeamMemberList
            members={members || []}
            isLoading={isLoading}
            isError={isError}
            error={error || null}
            currentUserId={user?.id || ''}
            isCurrentUserAdmin={isAdmin}
            onRetry={() => refetch()}
            onMemberChange={() => refetch()}
          />
        )
      case 'announcements':
        return (
          <TeamAnnouncementList
            announcements={announcements || []}
            isLoading={isLoading}
            isError={isError}
            error={error || null}
            isAdmin={isAdmin}
            onRetry={() => refetch()}
            onCreateNew={() => {
              setEditingAnnouncement(undefined)
              setIsAnnouncementFormVisible(true)
            }}
            onEdit={(announcement) => {
              setEditingAnnouncement(announcement)
              setIsAnnouncementFormVisible(true)
            }}
            onDelete={async (announcementId) => {
              if (Platform.OS === 'web') {
                const confirmed = window.confirm('このお知らせを削除しますか？\nこの操作は取り消せません。')
                if (!confirmed) return
              } else {
                Alert.alert('削除確認', 'このお知らせを削除しますか？\nこの操作は取り消せません。', [
                  { text: 'キャンセル', style: 'cancel' },
                  {
                    text: '削除',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteAnnouncementMutation.mutateAsync(announcementId)
                        refetch()
                      } catch (err) {
                        const errorMessage = err instanceof Error ? err.message : '削除に失敗しました'
                        Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
                      }
                    },
                  },
                ])
                return
              }

              try {
                await deleteAnnouncementMutation.mutateAsync(announcementId)
                refetch()
              } catch (err) {
                const errorMessage = err instanceof Error ? err.message : '削除に失敗しました'
                if (Platform.OS === 'web') {
                  window.alert(errorMessage)
                } else {
                  Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
                }
              }
            }}
          />
        )
      case 'practices':
        return (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>練習機能は実装予定です</Text>
          </View>
        )
      case 'competitions':
        return (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>大会機能は実装予定です</Text>
          </View>
        )
      case 'bulkRegister':
        if (!isAdmin) {
          return (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderText}>管理者のみ利用可能です</Text>
            </View>
          )
        }
        return (
          <TeamBulkRegisterForm
            teamId={teamId}
            onSuccess={() => {
              refetch()
            }}
          />
        )
      default:
        return null
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* チーム情報 */}
        <View style={styles.teamInfo}>
          <Text style={styles.teamName}>{currentTeam.name}</Text>
          {currentTeam.description && (
            <Text style={styles.teamDescription}>{currentTeam.description}</Text>
          )}
          {currentTeam.invite_code && (
            <Pressable style={styles.inviteCodeContainer} onPress={handleCopyInviteCode}>
              <View style={styles.inviteCodeContent}>
                <Text style={styles.inviteCodeLabel}>招待コード:</Text>
                <Text style={styles.inviteCode}>{currentTeam.invite_code}</Text>
              </View>
              <Text style={styles.copyHint}>タップしてコピー</Text>
            </Pressable>
          )}
        </View>

        {/* タブ */}
        <TeamTabs activeTab={activeTab} onTabChange={setActiveTab} isAdmin={isAdmin} />

        {/* タブコンテンツ */}
        <View style={styles.tabContent}>{renderTabContent()}</View>
      </ScrollView>

      {/* お知らせ作成・編集フォーム */}
      <TeamAnnouncementForm
        visible={isAnnouncementFormVisible}
        onClose={() => {
          setIsAnnouncementFormVisible(false)
          setEditingAnnouncement(undefined)
        }}
        teamId={teamId}
        editData={editingAnnouncement}
        onSuccess={() => {
          refetch()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  teamInfo: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    margin: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  teamName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  teamDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  inviteCodeContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  inviteCodeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  inviteCodeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  inviteCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
    fontFamily: 'monospace',
  },
  copyHint: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  tabContent: {
    flex: 1,
    minHeight: 400,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  placeholderText: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
  },
})
