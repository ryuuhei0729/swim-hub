import React, { useState, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthProvider'
import { useUserQuery } from '@apps/shared/hooks/queries/user'
import { useBestTimesQuery } from '@/hooks/useBestTimesQuery'
import {
  ProfileDisplay,
  ProfileEditModal,
  BestTimesTable,
  PasswordChangeModal,
} from '@/components/profile'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { UserProfile } from '@swim-hub/shared/types/database'

/**
 * マイページ画面
 * プロフィール表示・編集、ベストタイム表、パスワード変更
 */
export const MyPageScreen: React.FC = () => {
  const { supabase, user } = useAuth()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // プロフィールとチーム情報取得
  const {
    profile,
    teams,
    isLoading: profileLoading,
    isError: profileError,
    error: profileErrorObj,
    refetch: refetchProfile,
  } = useUserQuery(supabase, {
    enableRealtime: false, // モバイルでは一旦無効化
  })

  // ベストタイム取得
  const {
    data: bestTimes = [],
    isLoading: bestTimesLoading,
    isError: bestTimesError,
    error: bestTimesErrorObj,
    refetch: refetchBestTimes,
  } = useBestTimesQuery(supabase, {
    userId: user?.id,
  })

  const isLoading = profileLoading || bestTimesLoading
  const isError = profileError
  const error = profileErrorObj
  const bestTimesErrorMessage =
    bestTimesErrorObj instanceof Error ? bestTimesErrorObj.message : undefined

  // プルリフレッシュ処理
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([refetchProfile(), refetchBestTimes()])
    } finally {
      setRefreshing(false)
    }
  }, [refetchProfile, refetchBestTimes])

  // プロフィール更新処理
  const handleProfileUpdate = useCallback(
    async (updatedProfile: Partial<UserProfile>) => {
      if (!user) return

      try {
        const dbUpdate: Partial<UserProfile> = {}
        if (updatedProfile.name !== undefined) dbUpdate.name = updatedProfile.name
        if (updatedProfile.birthday !== undefined) dbUpdate.birthday = updatedProfile.birthday
        if (updatedProfile.bio !== undefined) dbUpdate.bio = updatedProfile.bio
        if (updatedProfile.profile_image_path !== undefined)
          dbUpdate.profile_image_path = updatedProfile.profile_image_path

        const { error: updateError } = await supabase
          .from('users')
          .update(dbUpdate)
          .eq('id', user.id)

        if (updateError) throw updateError
        await refetchProfile()
      } catch (err) {
        console.error('プロフィール更新エラー:', err)
        throw err
      }
    },
    [user, supabase, refetchProfile]
  )

  // アバター変更処理
  const handleAvatarChange = useCallback(
    async (newAvatarUrl: string | null) => {
      if (!user) return

      try {
        const { error: updateError } = await supabase
          .from('users')
          .update({ profile_image_path: newAvatarUrl })
          .eq('id', user.id)

        if (updateError) throw updateError
        await refetchProfile()
      } catch (err) {
        console.error('アバター更新エラー:', err)
        throw err
      }
    },
    [user, supabase, refetchProfile]
  )

  // エラー状態
  if (isError && error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ErrorView
          message={error.message || 'データの取得に失敗しました'}
          onRetry={() => {
            refetchProfile()
            refetchBestTimes()
          }}
          fullScreen
        />
      </SafeAreaView>
    )
  }

  // ローディング状態
  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner fullScreen message="データを読み込み中..." />
      </SafeAreaView>
    )
  }

  // プロフィールがない場合
  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>プロフィールが見つかりません</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#2563EB']}
            tintColor="#2563EB"
          />
        }
      >
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>マイページ</Text>
          <Text style={styles.headerSubtitle}>プロフィールとベストタイムを管理します</Text>
        </View>

        {/* プロフィールセクション */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>プロフィール</Text>
            <Pressable
              style={styles.editButton}
              onPress={() => setIsEditModalOpen(true)}
            >
              <Text style={styles.editButtonText}>編集</Text>
            </Pressable>
          </View>
          <ProfileDisplay profile={profile} teams={teams} />
        </View>

        {/* ベストタイムセクション */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Best Time</Text>
          </View>
          {bestTimesError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                {bestTimesErrorMessage || 'ベストタイムの取得に失敗しました'}
              </Text>
            </View>
          ) : (
            <BestTimesTable bestTimes={bestTimes} />
          )}
        </View>

        {/* パスワード変更ボタン */}
        <View style={styles.section}>
          <Pressable
            style={styles.passwordButton}
            onPress={() => setIsPasswordModalOpen(true)}
          >
            <Text style={styles.passwordButtonText}>パスワードを変更</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* プロフィール編集モーダル */}
      <ProfileEditModal
        visible={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        profile={profile}
        onUpdate={handleProfileUpdate}
        onAvatarChange={handleAvatarChange}
      />

      {/* パスワード変更モーダル */}
      <PasswordChangeModal
        visible={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={() => {
          setIsPasswordModalOpen(false)
        }}
      />
    </SafeAreaView>
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
    padding: 16,
    gap: 16,
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 8,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  passwordButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  passwordButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
  },
})
