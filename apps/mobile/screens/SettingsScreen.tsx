import React, { useState, useCallback } from 'react'
import { ScrollView, StyleSheet, RefreshControl } from 'react-native'
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
  const { supabase } = useAuth()
  const [refreshing, setRefreshing] = useState(false)

  const {
    profile,
    isLoading,
    refetch: refetchProfile,
  } = useUserQuery(supabase, {
    enableRealtime: false,
  })

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
  },
})
