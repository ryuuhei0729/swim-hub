// =============================================================================
// I18nProvider - i18n 初期化とローディング制御
// =============================================================================

import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { I18nextProvider } from "react-i18next";

import i18n from "@/i18n";
import { initializeLocale } from "@/i18n/bootstrap";
import { useLocaleStore } from "@/stores/localeStore";

interface I18nProviderProps {
  children: React.ReactNode;
}

/**
 * i18n 初期化 (AsyncStorage 読み込み + 端末ロケール検出) が完了するまで
 * ローディングスピナーを表示し、完了後に children を描画する。
 * App.tsx 全体の loadingContainer と同じスタイルで切替時に違和感を出さない。
 */
export function I18nProvider({ children }: I18nProviderProps) {
  const ready = useLocaleStore((state) => state.ready);
  const markReady = useLocaleStore((state) => state.markReady);

  useEffect(() => {
    let cancelled = false;
    void initializeLocale().then((locale) => {
      if (!cancelled) markReady(locale);
    });
    return () => {
      cancelled = true;
    };
  }, [markReady]);

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
  },
});
