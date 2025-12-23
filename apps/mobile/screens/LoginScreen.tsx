import React from 'react'
import { ActivityIndicator, StyleSheet, Text } from 'react-native'
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

  // 認証済みの場合はリダイレクト中のUIを表示
  // App.tsxのAppNavigatorが認証状態に応じてMainStackに自動的に切り替えます
  if (isAuthenticated) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'left', 'right', 'bottom']}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.redirectingText}>リダイレクト中...</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <LoginForm
        onSuccess={() => {
          // ログイン成功時は、App.tsxのAppNavigatorが認証状態を検知して
          // 自動的にMainStackに切り替えます
          // この時点でisAuthenticatedがtrueになるため、上記のリダイレクトUIが表示されます
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
  redirectingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
})
