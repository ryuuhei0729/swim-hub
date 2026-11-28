"use client";

import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";

/**
 * 保護者版のチーム画面のヘッダーに置くログアウトボタン。
 * 保護者版にはアカウントタブが無いため、ここがログアウトの唯一の入口になる。
 * 確認ダイアログ・失敗時の表示はアカウントタブ (MyPageScreen) と同じ文言を使う。
 */
export const GuardianLogoutButton: React.FC = () => {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const executeLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        console.error("ログアウトエラー:", error);
        Alert.alert(t("common.error"), t("settings.mobile.logoutFailed"));
      }
    } catch (err) {
      console.error("ログアウト処理エラー:", err);
      Alert.alert(t("common.error"), t("settings.mobile.logoutFailed"));
    } finally {
      setIsLoggingOut(false);
    }
  }, [signOut, t]);

  const handlePress = useCallback(() => {
    Alert.alert(t("settings.mobile.logoutTitle"), t("settings.mobile.logoutConfirmMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.mobile.logoutButtonText"),
        style: "destructive",
        onPress: executeLogout,
      },
    ]);
  }, [executeLogout, t]);

  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      onPress={handlePress}
      disabled={isLoggingOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t("teams.mobile.guardian.logoutButton")}
      accessibilityState={{ disabled: isLoggingOut, busy: isLoggingOut }}
      testID="guardian-logout-button"
    >
      {isLoggingOut ? (
        <ActivityIndicator size="small" color="#374151" />
      ) : (
        <Feather name="log-out" size={15} color="#374151" />
      )}
      <Text style={styles.text}>{t("teams.mobile.guardian.logoutButton")}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#FFFFFF",
  },
  buttonPressed: {
    backgroundColor: "#F9FAFB",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
});
