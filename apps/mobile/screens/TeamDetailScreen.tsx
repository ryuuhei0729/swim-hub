import React, { useState, useMemo } from 'react'
import { View, Text, StyleSheet, Pressable, Alert, Platform, Linking } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Feather } from '@expo/vector-icons'
import { useRoute, RouteProp } from '@react-navigation/native'
import { useAuth } from '@/contexts/AuthProvider'
import { useTeamsQuery } from '@apps/shared/hooks/queries/teams'
import {
  TeamTabs,
  TeamMemberList,
  MyMonthlyAttendance,
  type TeamTabType,
} from '@/components/teams'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { MainStackParamList } from '@/navigation/types'

type TeamDetailScreenRouteProp = RouteProp<MainStackParamList, 'TeamDetail'>

/**
 * チーム詳細画面
 * チーム情報、メンバー、練習、大会、出欠を表示（閲覧専用）
 */
export const TeamDetailScreen: React.FC = () => {
  const route = useRoute<TeamDetailScreenRouteProp>()
  const { teamId } = route.params
  const { supabase, user } = useAuth()
  const [activeTab, setActiveTab] = useState<TeamTabType>('members')
  const [isCopied, setIsCopied] = useState(false)

  // チームデータ取得
  const {
    currentTeam,
    members,
    isLoading,
    isError,
    error,
    refetch,
  } = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false, // モバイルでは一旦無効化
  })

  // 現在のユーザーが管理者かどうかを判定
  const isCurrentUserAdmin = useMemo(() => {
    if (!user || !members) return false
    return members.some((m) => m.user_id === user.id && m.role === 'admin')
  }, [user, members])

  const WEB_APP_URL = 'https://www.swim-hub.app/dashboard'

  // Web版を開く
  const handleOpenWebApp = () => {
    Linking.openURL(WEB_APP_URL)
  }

  // 招待コードをコピー
  const handleCopyInviteCode = async () => {
    if (!currentTeam || !currentTeam.invite_code) return

    if (Platform.OS === 'web') {
      // Web版ではClipboard APIを使用
      if (navigator.clipboard) {
        navigator.clipboard.writeText(currentTeam.invite_code).then(
          () => {
            setIsCopied(true)
            setTimeout(() => setIsCopied(false), 2000)
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
          setIsCopied(true)
          setTimeout(() => setIsCopied(false), 2000)
        } catch {
          window.alert('コピーに失敗しました')
        }
        document.body.removeChild(textArea)
      }
    } else {
      try {
        await Clipboard.setStringAsync(currentTeam.invite_code)
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
      } catch {
        Alert.alert('エラー', 'コピーに失敗しました', [{ text: 'OK' }])
      }
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
            teamId={teamId}
            isLoading={isLoading}
            isError={isError}
            error={error || null}
            currentUserId={user?.id || ''}
            isCurrentUserAdmin={isCurrentUserAdmin}
            onRetry={() => refetch()}
            onMemberChange={() => refetch()}
          />
        )
      case 'practices':
      case 'competitions':
        return (
          <View style={styles.webGuideContainer}>
            <Feather name="monitor" size={48} color="#9CA3AF" />
            <Text style={styles.webGuideTitle}>
              {activeTab === 'practices' ? '練習管理' : '大会管理'}
            </Text>
            <Text style={styles.webGuideText}>
              チーム管理機能に関してはWEB版をご利用ください。
            </Text>
            <Pressable style={styles.webGuideButton} onPress={handleOpenWebApp}>
              <Feather name="external-link" size={16} color="#FFFFFF" />
              <Text style={styles.webGuideButtonText}>WEB版を開く</Text>
            </Pressable>
            <Text style={styles.webGuideUrl}>{WEB_APP_URL}</Text>
          </View>
        )
      case 'attendance':
        return <MyMonthlyAttendance teamId={teamId} />
      default:
        return null
    }
  }

  return (
    <View style={styles.container}>
      {/* チーム情報（固定） */}
      <View style={styles.teamInfo}>
        <Text style={styles.teamName}>{currentTeam.name}</Text>
        {currentTeam.description && (
          <Text style={styles.teamDescription}>{currentTeam.description}</Text>
        )}
        {currentTeam.invite_code && (
          <View style={styles.inviteCodeContainer}>
            <View style={styles.inviteCodeContent}>
              <Text style={styles.inviteCodeLabel}>招待コード:</Text>
              <Text style={styles.inviteCode}>{currentTeam.invite_code}</Text>
              <Pressable style={styles.copyButton} onPress={handleCopyInviteCode}>
                <Feather
                  name={isCopied ? 'check' : 'clipboard'}
                  size={16}
                  color={isCopied ? '#10B981' : '#374151'}
                />
                <Text style={[styles.copyButtonText, isCopied && styles.copyButtonTextSuccess]}>
                  コピー
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* タブ（固定） */}
      <TeamTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* タブコンテンツ（スクロール可能） */}
      <View style={styles.tabContent}>{renderTabContent()}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
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
  },
  inviteCodeLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  inviteCode: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
    fontFamily: 'monospace',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 4,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  copyButtonTextSuccess: {
    color: '#10B981',
  },
  tabContent: {
    flex: 1,
    minHeight: 400,
  },
  webGuideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 12,
  },
  webGuideTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  webGuideText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  webGuideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  webGuideButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  webGuideUrl: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 12,
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
