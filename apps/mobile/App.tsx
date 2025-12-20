import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
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
  // isInternetReachableがnullの場合は、isConnectedがfalseの場合のみオフラインと判定
  const isOffline = !isConnected || (isInternetReachable !== null && isInternetReachable === false)

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
    <SafeAreaProvider>
    <ErrorBoundary>
      <QueryProvider>
        <NetworkProvider>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </NetworkProvider>
      </QueryProvider>
    </ErrorBoundary>
    </SafeAreaProvider>
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
