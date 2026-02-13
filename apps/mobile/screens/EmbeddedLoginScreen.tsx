import React from 'react'
import { ActivityIndicator, Linking, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthProvider'
import { LoginForm } from '@/components/auth/LoginForm'

const WEB_APP_RESET_PASSWORD_URL = 'https://swim-hub.app/reset-password'

/**
 * ナビゲーション外で使用するログイン画面（AuthGuard用）
 * useNavigationを使用しないため、NavigationContainer外でも安全にレンダリング可能
 */
export const EmbeddedLoginScreen: React.FC = () => {
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
  if (isAuthenticated) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'left', 'right', 'bottom']}>
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <LoginForm
        onSuccess={() => {
          // AppNavigatorが認証状態を検知してMainStackに自動切り替え
        }}
        onResetPassword={() => Linking.openURL(WEB_APP_RESET_PASSWORD_URL)}
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
