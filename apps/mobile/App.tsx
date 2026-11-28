import React from "react";
import { enableScreens } from "react-native-screens";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useTranslation } from "react-i18next";
import * as Font from "expo-font";
import { ChakraPetch_700Bold } from "@expo-google-fonts/chakra-petch";
import { AuthProvider, useAuth } from "./contexts/AuthProvider";
import QueryProvider from "./providers/QueryProvider";
import { NetworkProvider, useNetwork } from "./providers/NetworkProvider";
import { isNetInfoOnline } from "./hooks/useNetworkStatus";
import { I18nProvider } from "./providers/I18nProvider";
import { ToastProvider } from "./providers/ToastProvider";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { AuthStack } from "./navigation/AuthStack";
import { MainStack } from "./navigation/MainStack";
import { GuardianStack } from "./navigation/GuardianStack";
import { OnboardingStack } from "./navigation/OnboardingStack";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MilestoneAchievementPrompter } from "./components/goals/MilestoneAchievementPrompter";
import { supabase } from "./lib/supabase";
import { env } from "./lib/env";
import { configureMilestoneJudgment } from "@apps/shared/api/goals";
import { configureNetworkErrorMessage } from "@apps/shared/utils/userFacingError";
import { getNetworkErrorMessage } from "./lib/networkErrorMessage";

// ChakraPetch_700Bold is used for the brand wordmark on the welcome/onboarding screens.
// Best-effort: failures fall back to the system font.
Font.loadAsync({ ChakraPetch_700Bold }).catch(() => {});

enableScreens();

// グローバル変数でWeb API URLを設定（shared packageから参照される）
declare global {
  var __SWIM_HUB_WEB_API_URL__: string | undefined;
}
globalThis.__SWIM_HUB_WEB_API_URL__ = env.webApiUrl;

// マイルストーンは記録から自動で達成にせず、達成候補として「もしかしてマイルストーンを
// 達成しましたか？」と確認する (MilestoneAchievementPrompter)。web は従来どおり自動達成
configureMilestoneJudgment({ autoAchieve: false });

// 保存失敗などのエラー表示 (toUserFacingMessage) で、圏外・タイムアウトが原因のときは
// 「保存に失敗しました」ではなく「通信できませんでした」系の文言を出す
configureNetworkErrorMessage((error) => getNetworkErrorMessage(error));

/**
 * Supabase未初期化時のエラー画面
 */
const SupabaseErrorScreen: React.FC = () => {
  const { t } = useTranslation();
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>{t("common.app.setupErrorTitle")}</Text>
      <Text style={styles.errorMessage}>{t("common.app.supabaseConfigError")}</Text>
    </View>
  );
};

/**
 * 認証状態に応じてナビゲーションスタックを切り替えるコンポーネント
 */
const AppNavigator: React.FC = () => {
  // React Hooksは常に同じ順序で呼ばれる必要があるため、条件分岐の前に呼ぶ
  const { isAuthenticated, loading, onboardingCompleted, isGuardian } = useAuth();
  const { isConnected, isInternetReachable } = useNetwork();
  const { t } = useTranslation();

  // デバッグ: レンダリング状態をログ出力
  if (__DEV__) {
    console.log(
      "[AppNavigator] render — loading:", loading,
      "isAuthenticated:", isAuthenticated,
      "onboardingCompleted:", onboardingCompleted,
      "isGuardian:", isGuardian,
      "supabase:", !!supabase,
    );
  }

  // Supabaseクライアントが初期化されていない場合はエラー画面を表示
  if (!supabase) {
    return <SupabaseErrorScreen />;
  }

  // 認証状態 or オンボーディング状態 or 保護者かどうかの確認中 (loading または null)。
  // 保護者かどうかが決まる前に通常の画面を出すと、保護者に一瞬ボトムタブが見えるため待つ
  if (loading || (isAuthenticated && (onboardingCompleted === null || isGuardian === null))) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ color: "#6B7280", marginTop: 12, fontSize: 13 }}>{t("common.loading")}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  // オフライン判定（接続がない、またはインターネットに到達できない）
  // React Query の onlineManager と同じ基準 (isNetInfoOnline) で判定する
  const isOffline = !isNetInfoOnline({ isConnected, isInternetReachable });

  // 保護者アカウント (閲覧専用) はチーム画面だけの専用スタックにする。
  // オンボーディング (プロフィールの保存) も書き込みなので、保護者には出さない
  const showGuardian = isAuthenticated && isGuardian === true;

  // 認証状態 × オンボーディング状態に応じてスタックを切り替え
  const renderStack = () => {
    if (!isAuthenticated) return <AuthStack />;
    if (showGuardian) return <GuardianStack />;
    if (!onboardingCompleted) return <OnboardingStack />;
    return <MainStack />;
  };

  return (
    <View style={styles.container}>
      <OfflineBanner visible={isOffline} />
      <NavigationContainer>
        {renderStack()}
        {isAuthenticated && onboardingCompleted && !showGuardian && <MilestoneAchievementPrompter />}
        <StatusBar
          style={isAuthenticated && !onboardingCompleted && !showGuardian ? "light" : "auto"}
        />
      </NavigationContainer>
    </View>
  );
};

/**
 * アプリケーションのエントリーポイント
 */
export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* Android のキーボードの高さを表示中もずっと追いかける (FormKeyboardAvoidingView・ホームの入力モード)。
          RN 標準は表示/非表示の切り替わりで 1 回だけ高さを通知するため、タイミングで低い値のまま固まっていた。
          アプリは edge-to-edge (Expo) だが keyboard-controller の自動判定 (react-native-is-edge-to-edge) では
          検出されず、ナビゲーションバーを差し引いた高さになって画面下がその分隠れていたため明示する。
          preserveEdgeToEdge: keyboard-controller にウィンドウの設定を変えさせない */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
        <I18nProvider>
          <ErrorBoundary>
            <QueryProvider>
              <NetworkProvider>
                <AuthProvider>
                  {/* トーストは画面全体の上に出すため、ナビゲーターの外側で 1 つだけ持つ */}
                  <ToastProvider>
                    <AppNavigator />
                  </ToastProvider>
                </AuthProvider>
              </NetworkProvider>
            </QueryProvider>
          </ErrorBoundary>
        </I18nProvider>
      </KeyboardProvider>
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
