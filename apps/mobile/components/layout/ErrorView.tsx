import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PressableScale } from "@/components/ui/PressableScale";
import { colors } from "@/constants/theme";
import { getNetworkErrorMessage } from "@/lib/networkErrorMessage";

interface ErrorViewProps {
  message: string;
  /**
   * 元のエラー。渡すと、通信起因 (圏外・タイムアウト等) のときは message の代わりに
   * 「通信できませんでした」系の文言を表示する。
   */
  error?: unknown;
  onRetry?: () => void;
  showIcon?: boolean;
  fullScreen?: boolean;
}

/**
 * エラー表示コンポーネント
 * エラー状態を表示し、必要に応じてリトライ機能を提供
 */
export const ErrorView: React.FC<ErrorViewProps> = ({
  message,
  error,
  onRetry,
  showIcon = true,
  fullScreen = false,
}) => {
  const { t } = useTranslation();
  // エラーオブジェクトがあればそれで判定する。無い場合も、画面が生の error.message
  // (例: "TypeError: Network request failed") を渡してきたときは文言から判定する
  const displayMessage =
    (error !== undefined ? getNetworkErrorMessage(error) : null) ??
    getNetworkErrorMessage(message, { assumeOfflineCause: false }) ??
    message;
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      {showIcon && (
        <Feather name="alert-triangle" size={48} color="#DC2626" style={styles.icon} />
      )}
      <Text style={styles.message}>{displayMessage}</Text>
      {onRetry && (
        <PressableScale style={styles.retryButton} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
        </PressableScale>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 16,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  icon: {
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: "#DC2626",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 300,
  },
  retryButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
