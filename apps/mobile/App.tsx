import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { AuthProvider, useAuth } from './contexts/AuthProvider'
import QueryProvider from './providers/QueryProvider'
import { AuthStack } from './navigation/AuthStack'
import { MainStack } from './navigation/MainStack'
import { ErrorBoundary } from './components/ErrorBoundary'

/**
 * 認証状態に応じてナビゲーションスタックを切り替えるコンポーネント
 */
const AppNavigator: React.FC = () => {
  const { isAuthenticated, loading } = useAuth()

  // デバッグ用: 認証状態の確認
  if (__DEV__) {
    console.log('AppNavigator - 認証状態:', { isAuthenticated, loading })
  }

  // 認証状態の確認中
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <StatusBar style="auto" />
      </View>
    )
  }

  // 認証状態に応じてスタックを切り替え
  return (
    <NavigationContainer>
      {isAuthenticated ? <MainStack /> : <AuthStack />}
      <StatusBar style="auto" />
    </NavigationContainer>
  )
}

/**
 * アプリケーションのエントリーポイント
 */
export default function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
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
