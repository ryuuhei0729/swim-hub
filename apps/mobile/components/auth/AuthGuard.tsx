import React from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useAuth } from '@/contexts/AuthProvider'
import { LoginScreen } from '@/screens/LoginScreen'

interface AuthGuardProps {
  children: React.ReactNode
}

/**
 * 認証ガードコンポーネント
 * 未認証ユーザーをログイン画面にリダイレクトし、認証済みユーザーのみ保護されたコンテンツを表示
 * 
 * 注意: Phase 3.1でナビゲーションを実装したため、通常はApp.tsxでNavigationContainerを使用して
 * 認証状態に応じたスタックを切り替えます。このコンポーネントは、ナビゲーション外で認証ガードが
 * 必要な場合に使用できます。
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()

  // 認証状態の確認中
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    )
  }

  // 未認証の場合はログイン画面を表示
  if (!isAuthenticated) {
    return <LoginScreen />
  }

  // 認証済みの場合は保護されたコンテンツを表示
  return <>{children}</>
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
  },
})
