import React, { useState, useMemo, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '@/contexts/AuthProvider'
import { useTeamsQuery } from '@apps/shared/hooks/queries/teams'
import { TeamItem, TeamCreateModal, TeamJoinModal } from '@/components/teams'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { MainStackParamList } from '@/navigation/types'
import type { TeamMembershipWithUser } from '@swim-hub/shared/types/database'

type TeamsScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * チーム一覧画面
 * 所属チームの一覧を表示し、チーム作成・参加機能を提供
 */
export const TeamsScreen: React.FC = () => {
  const navigation = useNavigation<TeamsScreenNavigationProp>()
  const { supabase } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)

  // チーム一覧取得
  const {
    teams = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useTeamsQuery(supabase, {
    enableRealtime: false, // モバイルでは一旦無効化
  })

  // 承認済みチームと承認待ちチームを分ける
  const { approvedTeams, pendingTeams } = useMemo(() => {
    const approved: TeamMembershipWithUser[] = []
    const pending: TeamMembershipWithUser[] = []

    teams.forEach((membership) => {
      if (membership.status === 'approved' && membership.is_active) {
        approved.push(membership)
      } else if (membership.status === 'pending') {
        pending.push(membership)
      }
    })

    return {
      approvedTeams: approved,
      pendingTeams: pending,
    }
  }, [teams])

  // プルリフレッシュ処理
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  // チームタップ処理
  const handleTeamPress = useCallback(
    (membership: TeamMembershipWithUser) => {
      navigation.navigate('TeamDetail', { teamId: membership.team_id })
    },
    [navigation]
  )

  // アイテムをレンダリング（メモ化）
  const renderItem = useCallback(
    ({ item }: { item: TeamMembershipWithUser }) => {
      return <TeamItem membership={item} onPress={handleTeamPress} />
    },
    [handleTeamPress]
  )

  // チーム作成成功時の処理
  const handleCreateSuccess = useCallback(
    (teamId: string) => {
      setIsCreateModalOpen(false)
      // チーム詳細画面へ遷移
      navigation.navigate('TeamDetail', { teamId })
    },
    [navigation]
  )

  // チーム参加成功時の処理
  const handleJoinSuccess = useCallback(
    (teamId: string) => {
      setIsJoinModalOpen(false)
      // チーム詳細画面へ遷移
      navigation.navigate('TeamDetail', { teamId })
    },
    [navigation]
  )

  // エラー状態
  if (isError && error) {
    const errorMessage = error instanceof Error ? error.message : 'チーム一覧の取得に失敗しました'
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ErrorView
          message={errorMessage}
          onRetry={() => refetch()}
          fullScreen
        />
      </SafeAreaView>
    )
  }

  // ローディング状態
  if (isLoading && teams.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner fullScreen message="チーム一覧を読み込み中..." />
      </SafeAreaView>
    )
  }

  // 表示用データ（承認済み + 承認待ち）
  const displayTeams = [...approvedTeams, ...pendingTeams]

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* アクションボタン */}
      <View style={styles.actionBar}>
        <Pressable
          style={[styles.actionButton, styles.createButton]}
          onPress={() => setIsCreateModalOpen(true)}
        >
          <Text style={styles.createButtonText}>+ チームを作成</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.joinButton]}
          onPress={() => setIsJoinModalOpen(true)}
        >
          <Text style={styles.joinButtonText}>招待コードで参加</Text>
        </Pressable>
      </View>

      {/* チーム一覧 */}
      {displayTeams.length > 0 ? (
        <FlatList
          data={displayTeams}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          // パフォーマンス最適化
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>チームがありません</Text>
            </View>
          }
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>チームがありません</Text>
          <Text style={styles.emptySubtext}>
            チームを作成するか、招待コードで参加してください
          </Text>
        </View>
      )}

      {/* チーム作成モーダル */}
      <TeamCreateModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* チーム参加モーダル */}
      <TeamJoinModal
        visible={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={handleJoinSuccess}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButton: {
    backgroundColor: '#2563EB',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  joinButton: {
    backgroundColor: '#10B981',
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
})
