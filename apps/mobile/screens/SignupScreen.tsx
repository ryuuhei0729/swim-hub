import React from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useAuth } from '@/contexts/AuthProvider'
import { SignupForm } from '@/components/auth/SignupForm'

export const SignupScreen: React.FC = () => {
  const { isAuthenticated, loading } = useAuth()

  // 認証情報を確認中
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    )
  }

  // 認証済みの場合は何も表示しない（Phase 3でナビゲーションに置き換え）
  if (isAuthenticated) {
    return null
  }

  return (
    <SignupForm
      onSuccess={() => {
        // Phase 3でナビゲーションを実装予定
        // AuthProviderが状態変更を検知してMainStackに自動切り替え
      }}
    />
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
  },
})
