import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

interface AdminControlsProps {
  member: TeamMembershipWithUser;
  isRemoving: boolean;
  onRoleChangeClick: (newRole: "admin" | "user") => void;
  onRemoveMember: () => void;
}

export const AdminControls: React.FC<AdminControlsProps> = ({
  member,
  isRemoving,
  onRoleChangeClick,
  onRemoveMember,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>管理者機能</Text>
      <View style={styles.controlsRow}>
        {/* 権限切り替え */}
        <View style={styles.roleToggle}>
          <Pressable
            style={[styles.roleButton, member.role === "user" && styles.roleButtonActive]}
            onPress={() => onRoleChangeClick("user")}
          >
            <Text
              style={[styles.roleButtonText, member.role === "user" && styles.roleButtonTextActive]}
            >
              ユーザー
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
              管理者
            </Text>
          </Pressable>
        </View>

        {/* 削除ボタン */}
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
          <Text style={styles.removeButtonText}>{isRemoving ? "削除中..." : "チームから削除"}</Text>
        </Pressable>
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
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
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
