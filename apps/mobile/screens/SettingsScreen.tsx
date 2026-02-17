import React, { useState, useCallback } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthProvider'
import { useUserQuery } from '@apps/shared/hooks/queries/user'
import { GoogleCalendarSyncSettings } from '@/components/settings/GoogleCalendarSyncSettings'
import { IOSCalendarSyncSettings } from '@/components/settings/IOSCalendarSyncSettings'
import { EmailChangeSettings } from '@/components/settings/EmailChangeSettings'
import { IdentityLinkSettings } from '@/components/settings/IdentityLinkSettings'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'

/**
 * 設定画面
 * メールアドレス・ログイン連携・カレンダー連携の設定を管理
 */
export const SettingsScreen: React.FC = () => {
  const { supabase, signOut } = useAuth()
  const [refreshing, setRefreshing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const {
    profile,
    isLoading,
    refetch: refetchProfile,
  } = useUserQuery(supabase, {
    enableRealtime: false,
  })

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true)
    try {
      const { error } = await signOut()
      if (error) {
        console.error('ログアウトエラー:', error)
        alert('ログアウトに失敗しました。もう一度お試しください。')
      }
    } catch (err) {
      console.error('ログアウト処理エラー:', err)
      alert('ログアウトに失敗しました。もう一度お試しください。')
    } finally {
      setIsLoggingOut(false)
    }
  }, [signOut])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetchProfile()
    } finally {
      setRefreshing(false)
    }
  }, [refetchProfile])

  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <LoadingSpinner fullScreen message="設定を読み込み中..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
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
        {/* Googleカレンダー連携セクション */}
        <GoogleCalendarSyncSettings
          profile={profile}
          onUpdate={refetchProfile}
        />

        {/* iOSカレンダー連携セクション */}
        <IOSCalendarSyncSettings
          profile={profile}
          onUpdate={refetchProfile}
        />

        {/* メールアドレス変更セクション */}
        <EmailChangeSettings />

        {/* ログイン連携セクション */}
        <IdentityLinkSettings />

        {/* ログアウトセクション */}
        <View style={styles.logoutSection}>
          <Pressable
            style={[styles.logoutButton, isLoggingOut && styles.logoutButtonDisabled]}
            onPress={handleLogout}
            disabled={isLoggingOut}
            accessibilityRole="button"
            accessibilityLabel="ログアウト"
            accessibilityHint="アカウントからログアウトします"
          >
            <Text style={styles.logoutButtonText}>
              {isLoggingOut ? 'ログアウト中...' : 'ログアウト'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
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
    paddingBottom: 32,
  },
  logoutSection: {
    marginTop: 8,
  },
  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  logoutButtonDisabled: {
    backgroundColor: '#F87171',
    opacity: 0.6,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
