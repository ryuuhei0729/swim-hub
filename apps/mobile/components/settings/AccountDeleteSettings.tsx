import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { env } from "@/lib/env";

const WEB_API_URL = env.webApiUrl;

/**
 * アカウント削除設定コンポーネント
 * 設定画面でアカウントの完全削除を行う
 */
export const AccountDeleteSettings: React.FC = () => {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!session?.access_token) {
      Alert.alert(t("common.alertErrorTitle"), t("settings.accountDelete.authNotFound"));
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`${WEB_API_URL}/api/account/delete`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("settings.accountDelete.errors.deleteFailed"));
      }

      // ローカルセッション・キャッシュ・ストアをクリア
      // signOut後、AppNavigatorがAuthStackに自動遷移する
      await signOut();
    } catch (err) {
      setIsDeleting(false);
      Alert.alert(
        t("common.error"),
        err instanceof Error ? err.message : t("settings.accountDelete.errors.deleteFailed"),
      );
    }
  }, [session, signOut, t]);

  const handlePress = useCallback(() => {
    Alert.alert(
      t("settings.accountDelete.mobileConfirmTitle"),
      t("settings.accountDelete.mobileConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.accountDelete.confirmDialog.confirmLabel"),
          style: "destructive",
          onPress: handleDelete,
        },
      ],
    );
  }, [handleDelete, t]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("settings.accountDelete.title")}</Text>
      <Text style={styles.description}>{t("settings.accountDelete.description")}</Text>
      <Pressable
        style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
        onPress={handlePress}
        disabled={isDeleting}
        accessibilityRole="button"
        accessibilityLabel={t("settings.accountDelete.deleteButtonAriaLabel")}
        accessibilityHint={t("settings.accountDelete.deleteButtonAriaHint")}
      >
        {isDeleting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.deleteButtonText}>{t("settings.accountDelete.deleteButton")}</Text>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
    lineHeight: 20,
  },
  deleteButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#DC2626",
    alignItems: "center",
  },
  deleteButtonDisabled: {
    backgroundColor: "#F87171",
    opacity: 0.6,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
