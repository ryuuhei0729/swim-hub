import React from 'react'
import { ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthProvider'
import { LoginForm } from '@/components/auth/LoginForm'

export const LoginScreen: React.FC = () => {
  const { isAuthenticated, loading } = useAuth()

  // 認証情報を確認中
  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'left', 'right', 'bottom']}>
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    )
  }

  // 認証済みの場合は何も表示しない（Phase 3でナビゲーションに置き換え）
  if (isAuthenticated) {
    return null
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
    <LoginForm
      onSuccess={() => {
        // Phase 3でナビゲーションを実装予定
        // 現時点ではログイン成功時の処理は後で実装
        console.log('ログイン成功')
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
  },
})
