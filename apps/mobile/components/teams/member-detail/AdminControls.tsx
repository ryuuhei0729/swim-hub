import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import { WaPointsInfoTooltip } from "@/components/ui/WaPointsInfoTooltip";

interface AdminControlsProps {
  member: TeamMembershipWithUser;
  isRemoving: boolean;
  onRoleChangeClick: (newRole: "admin" | "user") => void;
  onRemoveMember: () => void;
  onSwimmerStatusChange: (isSwimmer: boolean) => void;
}

export const AdminControls: React.FC<AdminControlsProps> = ({
  member,
  isRemoving,
  onRoleChangeClick,
  onRemoveMember,
  onSwimmerStatusChange,
}) => {
  const { t } = useTranslation();
  const isSwimmer = member.is_swimmer !== false;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("teams.mobile.adminControlsTitle")}</Text>

      {/* 1行目: 権限セグメント + i アイコン ... チームから削除 (右端に残す・2行目に降ろさない) */}
      <View style={styles.controlsLine}>
        <View style={styles.toggleGroup}>
          <View style={styles.roleToggle}>
            <Pressable
              style={[styles.roleButton, member.role === "user" && styles.roleButtonActive]}
              onPress={() => onRoleChangeClick("user")}
            >
              <Text
                style={[styles.roleButtonText, member.role === "user" && styles.roleButtonTextActive]}
              >
                {t("teams.mobile.roleUser")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.roleButton, member.role === "admin" && styles.roleButtonAdminActive]}
              onPress={() => onRoleChangeClick("admin")}
            >
              <Text
                style={[
                  styles.roleButtonText,
                  member.role === "admin" && styles.roleButtonTextAdminActive,
                ]}
              >
                {t("teams.mobile.roleAdmin")}
              </Text>
            </Pressable>
          </View>
          <WaPointsInfoTooltip
            ariaLabel={t("teams.memberDetail.adminControls.roleInfoAriaLabel")}
            tooltipText={t("teams.memberDetail.adminControls.roleInfoText")}
          />
        </View>

        {/* 削除ボタン (幅が厳しくても潰れない/折り返さない) */}
        <Pressable
          style={[styles.removeButton, isRemoving && styles.removeButtonDisabled]}
          onPress={onRemoveMember}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <Feather name="trash-2" size={14} color="#DC2626" />
          )}
          <Text style={styles.removeButtonText} numberOfLines={1}>
            {isRemoving
              ? t("teams.mobile.memberRemoveLoading")
              : t("teams.mobile.memberRemoveButton")}
          </Text>
        </Pressable>
      </View>

      {/* 2行目: 泳者 / 非泳者 切り替え（権限切り替えと同じ見た目・同じ実装パターン） + i アイコン */}
      <View style={styles.toggleGroup}>
        <View style={styles.roleToggle}>
          <Pressable
            style={[styles.roleButton, isSwimmer && styles.roleButtonActive]}
            onPress={() => onSwimmerStatusChange(true)}
          >
            <Text style={[styles.roleButtonText, isSwimmer && styles.roleButtonTextActive]}>
              {t("teams.nonSwimmer.segmentSwimmer")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.roleButton, !isSwimmer && styles.roleButtonAdminActive]}
            onPress={() => onSwimmerStatusChange(false)}
          >
            <Text style={[styles.roleButtonText, !isSwimmer && styles.roleButtonTextAdminActive]}>
              {t("teams.nonSwimmer.segmentNonSwimmer")}
            </Text>
          </Pressable>
        </View>
        <WaPointsInfoTooltip
          ariaLabel={t("teams.nonSwimmer.infoAriaLabel")}
          tooltipText={t("teams.nonSwimmer.infoText")}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  // セグメント (ユーザー/管理者、泳者/非泳者) + i アイコンの1組。
  // 2つの i アイコンは行ごとに直後へ置くだけで、縦に揃えるための特別な配置はしない
  // (セグメント幅が違うため自然にずれる。ユーザー要望どおり)。
  toggleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  // 1行目: 権限セグメント(+iアイコン) と「チームから削除」を左右に配置する。
  // 折り返して2行目に落とさない (ユーザー要望)。幅が厳しい場合は toggleGroup 側が
  // 先に詰まり、removeButton は flexShrink:0 で文字が切れないようにする。
  controlsLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  roleToggle: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 3,
  },
  roleButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  roleButtonActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  roleButtonAdminActive: {
    backgroundColor: "#FEF9C3",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  roleButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  roleButtonTextActive: {
    color: "#111827",
  },
  roleButtonTextAdminActive: {
    color: "#854D0E",
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  removeButtonDisabled: {
    opacity: 0.5,
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#DC2626",
  },
});
