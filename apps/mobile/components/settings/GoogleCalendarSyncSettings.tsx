/**
 * Googleカレンダー連携設定コンポーネント
 * Web版のGoogleCalendarSyncSettingsをReact Native向けに移植
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch, ActivityIndicator, Alert } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { syncAllToGoogleCalendar } from "@/lib/google-calendar-api";
import type { UserProfile } from "@swim-hub/shared/types";

interface GoogleCalendarSyncSettingsProps {
  /** ユーザープロフィール */
  profile: UserProfile | null;
  /** 設定更新後のコールバック */
  onUpdate: () => void;
}

/**
 * Googleロゴ
 */
const GoogleLogo: React.FC = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24">
    <Path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <Path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <Path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <Path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </Svg>
);

export const GoogleCalendarSyncSettings: React.FC<GoogleCalendarSyncSettingsProps> = ({
  profile,
  onUpdate,
}) => {
  const { t } = useTranslation();
  const { supabase, user, session } = useAuth();
  const { connectGoogleCalendar, loading: authLoading } = useGoogleAuth();
  const [syncing, setSyncing] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkSyncResult, setBulkSyncResult] = useState<{
    practices: { success: number; error: number };
    competitions: { success: number; error: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEnabled = profile?.google_calendar_enabled || false;
  const syncPractices = profile?.google_calendar_sync_practices ?? true;
  const syncCompetitions = profile?.google_calendar_sync_competitions ?? true;

  // Googleカレンダー連携開始
  const handleConnectGoogle = async () => {
    setError(null);
    const result = await connectGoogleCalendar();
    if (result.success) {
      onUpdate();
    } else if (result.error) {
      setError(result.error.message);
    }
  };

  // 連携解除
  const handleDisconnectGoogle = () => {
    Alert.alert(
      t("settings.googleCalendar.confirmTitle"),
      t("settings.googleCalendar.confirmDisconnect"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.googleCalendar.disconnectChoice"),
          style: "destructive",
          onPress: async () => {
            if (!user || !supabase) return;

            try {
              // RPC関数でトークンを削除（NULLを設定）
              await supabase.rpc("set_google_refresh_token", {
                p_user_id: user.id,
                p_token: null,
              });

              // フラグを更新
              await supabase
                .from("users")
                .update({ google_calendar_enabled: false })
                .eq("id", user.id);

              onUpdate();
            } catch {
              Alert.alert(t("common.alertErrorTitle"), t("settings.googleCalendar.errors.disconnectFailed"));
            }
          },
        },
      ],
    );
  };

  // 同期設定変更
  const handleSyncSettingChange = async (
    field: "google_calendar_sync_practices" | "google_calendar_sync_competitions",
    value: boolean,
  ) => {
    if (!user || !supabase) return;

    setSyncing(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({ [field]: value })
        .eq("id", user.id);

      if (updateError) throw updateError;

      onUpdate();
    } catch {
      setError(t("settings.googleCalendar.errors.syncSettingFailed"));
    } finally {
      setSyncing(false);
    }
  };

  // 既存データ一括同期
  const handleBulkSync = async () => {
    if (!session?.access_token) {
      setError(t("settings.googleCalendar.sessionInvalid"));
      return;
    }

    setBulkSyncing(true);
    setBulkSyncResult(null);
    setError(null);

    try {
      const result = await syncAllToGoogleCalendar(session.access_token);

      if (result.success && result.results) {
        setBulkSyncResult(result.results);
        onUpdate();
      } else {
        setError(result.error || t("settings.googleCalendar.errors.bulkSyncFailed"));
      }
    } catch {
      setError(t("settings.googleCalendar.errors.bulkSyncFailed"));
    } finally {
      setBulkSyncing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("settings.googleCalendar.title")}</Text>
        {isEnabled && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t("settings.googleCalendar.connectedBadge")}</Text>
          </View>
        )}
      </View>

      {/* エラー表示 */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!isEnabled ? (
        // 未連携状態
        <View style={styles.section}>
          <Text style={styles.description}>
            {t("settings.googleCalendar.disconnected.description")}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.connectButton,
              pressed && styles.buttonPressed,
              authLoading && styles.buttonDisabled,
            ]}
            onPress={handleConnectGoogle}
            disabled={authLoading}
            accessibilityRole="button"
            accessibilityLabel={t("settings.googleCalendar.connectAriaLabel")}
          >
            {authLoading ? (
              <ActivityIndicator color="#374151" size="small" />
            ) : (
              <View style={styles.buttonContent}>
                <GoogleLogo />
                <Text style={styles.connectButtonText}>{t("settings.googleCalendar.disconnected.connectButton")}</Text>
              </View>
            )}
          </Pressable>
        </View>
      ) : (
        // 連携済み状態
        <>
          {/* 同期設定 */}
          <View style={styles.section}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t("settings.googleCalendar.connected.syncPracticesLabel")}</Text>
              <Switch
                value={syncPractices}
                onValueChange={(value) =>
                  handleSyncSettingChange("google_calendar_sync_practices", value)
                }
                disabled={syncing}
                trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
                thumbColor={syncPractices ? "#2563EB" : "#F3F4F6"}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t("settings.googleCalendar.connected.syncCompetitionsLabel")}</Text>
              <Switch
                value={syncCompetitions}
                onValueChange={(value) =>
                  handleSyncSettingChange("google_calendar_sync_competitions", value)
                }
                disabled={syncing}
                trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
                thumbColor={syncCompetitions ? "#2563EB" : "#F3F4F6"}
              />
            </View>
          </View>

          {/* 一括同期 */}
          <View style={[styles.section, styles.borderTop]}>
            <Text style={styles.description}>
              {t("settings.googleCalendar.bulkSync.description")}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.syncButton,
                pressed && styles.syncButtonPressed,
                bulkSyncing && styles.buttonDisabled,
              ]}
              onPress={handleBulkSync}
              disabled={bulkSyncing}
              accessibilityRole="button"
              accessibilityLabel={t("settings.googleCalendar.syncExistingAriaLabel")}
            >
              {bulkSyncing ? (
                <ActivityIndicator color="#2563EB" size="small" />
              ) : (
                <Text style={styles.syncButtonText}>{t("settings.googleCalendar.bulkSync.button")}</Text>
              )}
            </Pressable>

            {/* 同期結果表示 */}
            {bulkSyncResult && (
              <View style={styles.resultContainer}>
                <Text style={styles.resultTitle}>{t("settings.googleCalendar.bulkSync.successTitle")}</Text>
                {bulkSyncResult.practices.success > 0 ? (
                  <Text style={styles.resultText}>
                    {t("settings.googleCalendar.bulkSync.practicesSuccess", { count: bulkSyncResult.practices.success })}
                  </Text>
                ) : (
                  <Text style={styles.resultText}>
                    {t("settings.googleCalendar.bulkSync.practicesNoneNeeded")}
                  </Text>
                )}
                {bulkSyncResult.competitions.success > 0 ? (
                  <Text style={styles.resultText}>
                    {t("settings.googleCalendar.bulkSync.competitionsSuccess", { count: bulkSyncResult.competitions.success })}
                  </Text>
                ) : (
                  <Text style={styles.resultText}>
                    {t("settings.googleCalendar.bulkSync.competitionsNoneNeeded")}
                  </Text>
                )}
                {(bulkSyncResult.practices.error > 0 || bulkSyncResult.competitions.error > 0) && (
                  <Text style={styles.resultErrorText}>
                    {t("settings.googleCalendar.bulkSync.errorCount", { practiceErrors: bulkSyncResult.practices.error, competitionErrors: bulkSyncResult.competitions.error })}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* 連携解除 */}
          <View style={[styles.section, styles.borderTop]}>
            <Pressable
              style={({ pressed }) => [
                styles.disconnectButton,
                pressed && styles.disconnectButtonPressed,
              ]}
              onPress={handleDisconnectGoogle}
              accessibilityRole="button"
              accessibilityLabel={t("settings.googleCalendar.disconnectAriaLabel")}
            >
              <Text style={styles.disconnectButtonText}>{t("settings.googleCalendar.disconnectButton")}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  badge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#059669",
  },
  section: {
    gap: 12,
  },
  borderTop: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  description: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  connectButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  buttonPressed: {
    backgroundColor: "#F3F4F6",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 14,
    color: "#374151",
  },
  syncButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  syncButtonPressed: {
    backgroundColor: "#EFF6FF",
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#2563EB",
  },
  resultContainer: {
    backgroundColor: "#D1FAE5",
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#059669",
  },
  resultText: {
    fontSize: 13,
    color: "#047857",
  },
  resultErrorText: {
    fontSize: 13,
    color: "#B45309",
  },
  disconnectButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  disconnectButtonPressed: {
    backgroundColor: "#FEF2F2",
  },
  disconnectButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#DC2626",
  },
});
