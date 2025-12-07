import React from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useAuth } from '@/contexts/AuthProvider'
import { LoginForm } from '@/components/auth/LoginForm'

export const LoginScreen: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  // 認証情報を確認中
  if (isLoading) {
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
    <LoginForm
      onSuccess={() => {
        // Phase 3でナビゲーションを実装予定
        // 現時点ではログイン成功時の処理は後で実装
        console.log('ログイン成功')
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
