import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { AuthProvider, useAuth } from './contexts/AuthProvider'
import QueryProvider from './providers/QueryProvider'
import { NetworkProvider, useNetwork } from './providers/NetworkProvider'
import { OfflineBanner } from './components/layout/OfflineBanner'
import { AuthStack } from './navigation/AuthStack'
import { MainStack } from './navigation/MainStack'
import { ErrorBoundary } from './components/ErrorBoundary'

/**
 * 認証状態に応じてナビゲーションスタックを切り替えるコンポーネント
 */
const AppNavigator: React.FC = () => {
  const { isAuthenticated, loading } = useAuth()
  const { isConnected, isInternetReachable } = useNetwork()

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

  // オフライン判定（接続がない、またはインターネットに到達できない）
  const isOffline = !isConnected || isInternetReachable === false

  // 認証状態に応じてスタックを切り替え
  return (
    <View style={styles.container}>
      <OfflineBanner visible={isOffline} />
      <NavigationContainer>
        {isAuthenticated ? <MainStack /> : <AuthStack />}
        <StatusBar style="auto" />
      </NavigationContainer>
    </View>
  )
}

/**
 * アプリケーションのエントリーポイント
 */
export default function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <NetworkProvider>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </NetworkProvider>
      </QueryProvider>
    </ErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
  },
})
