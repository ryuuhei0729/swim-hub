/**
 * チーム詳細画面ヘッダーの管理者ビュー/利用者ビュー切替スイッチ
 * スタイルは components/settings/GoogleCalendarSyncSettings.tsx の Switch パターンを踏襲
 */
import React from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

export type AdminViewToggleProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
};

export const AdminViewToggle: React.FC<AdminViewToggleProps> = ({ value, onValueChange }) => {
  const { t } = useTranslation();
  const label = value ? t("teams.mobile.adminToggle.admin") : t("teams.mobile.adminToggle.user");

  return (
    <View style={styles.container}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
        thumbColor={value ? "#2563EB" : "#F3F4F6"}
        accessibilityRole="switch"
        accessibilityLabel={label}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 4,
  },
  label: {
    fontSize: 12,
    color: "#374151",
  },
});
