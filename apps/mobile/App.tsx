import React from "react";
import { enableScreens } from "react-native-screens";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./contexts/AuthProvider";
import QueryProvider from "./providers/QueryProvider";
import { NetworkProvider, useNetwork } from "./providers/NetworkProvider";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { AuthStack } from "./navigation/AuthStack";
import { MainStack } from "./navigation/MainStack";
import { OnboardingStack } from "./navigation/OnboardingStack";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { supabase } from "./lib/supabase";
import { env } from "./lib/env";

enableScreens();

// グローバル変数でWeb API URLを設定（shared packageから参照される）
declare global {
  var __SWIM_HUB_WEB_API_URL__: string | undefined;
}
globalThis.__SWIM_HUB_WEB_API_URL__ = env.webApiUrl;

/**
 * Supabase未初期化時のエラー画面
 */
const SupabaseErrorScreen: React.FC = () => {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>設定エラー</Text>
      <Text style={styles.errorMessage}>
        Supabaseの設定が正しく行われていません。
        {"\n\n"}
        アプリの設定を確認してください。
      </Text>
    </View>
  );
};

/**
 * 認証状態に応じてナビゲーションスタックを切り替えるコンポーネント
 */
const AppNavigator: React.FC = () => {
  // React Hooksは常に同じ順序で呼ばれる必要があるため、条件分岐の前に呼ぶ
  const { isAuthenticated, loading, onboardingCompleted } = useAuth();
  const { isConnected, isInternetReachable } = useNetwork();

  // デバッグ: レンダリング状態をログ出力
  if (__DEV__) {
    console.log(
      "[AppNavigator] render — loading:", loading,
      "isAuthenticated:", isAuthenticated,
      "onboardingCompleted:", onboardingCompleted,
      "supabase:", !!supabase,
    );
  }

  // Supabaseクライアントが初期化されていない場合はエラー画面を表示
  if (!supabase) {
    return <SupabaseErrorScreen />;
  }

  // 認証状態 or オンボーディング状態の確認中 (loading または null)
  if (loading || (isAuthenticated && onboardingCompleted === null)) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ color: "#6B7280", marginTop: 12, fontSize: 13 }}>読み込み中...</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  // オフライン判定（接続がない、またはインターネットに到達できない）
  // isInternetReachableがnullの場合は、isConnectedがfalseの場合のみオフラインと判定
  const isOffline = !isConnected || (isInternetReachable !== null && isInternetReachable === false);

  // 認証状態 × オンボーディング状態に応じてスタックを切り替え
  const renderStack = () => {
    if (!isAuthenticated) return <AuthStack />;
    if (!onboardingCompleted) return <OnboardingStack />;
    return <MainStack />;
  };

  return (
    <View style={styles.container}>
      <OfflineBanner visible={isOffline} />
      <NavigationContainer>
        {renderStack()}
        <StatusBar style={isAuthenticated && !onboardingCompleted ? "light" : "auto"} />
      </NavigationContainer>
    </View>
  );
};

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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#DC2626",
    marginBottom: 16,
  },
  errorMessage: {
    fontSize: 16,
    color: "#374151",
    textAlign: "center",
    lineHeight: 24,
  },
});
