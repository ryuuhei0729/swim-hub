import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { TeamGroupWithCount } from "./hooks";

interface GroupCardProps {
  group: TeamGroupWithCount;
  isAdmin: boolean;
  onPress: (group: TeamGroupWithCount) => void;
  onEdit: (group: TeamGroupWithCount) => void;
  onDelete: (group: TeamGroupWithCount) => void;
  onManageMembers: (group: TeamGroupWithCount) => void;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  isAdmin,
  onPress,
  onEdit,
  onDelete,
  onManageMembers,
}) => {
  return (
    <Pressable
      style={styles.card}
      onPress={() => onPress(group)}
      accessibilityRole="button"
      accessibilityLabel={`${group.name} のメンバー一覧を表示`}
    >
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {group.name}
        </Text>
        <View style={styles.badge}>
          <Feather name="users" size={12} color="#6B7280" />
          <Text style={styles.badgeText}>{group.member_count}</Text>
        </View>
      </View>
      {isAdmin && (
        <View style={styles.actions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => onManageMembers(group)}
            accessibilityRole="button"
            accessibilityLabel={`${group.name} のメンバーを編集`}
          >
            <Feather name="user-plus" size={16} color="#9CA3AF" />
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => onEdit(group)}
            accessibilityRole="button"
            accessibilityLabel={`${group.name} を編集`}
          >
            <Feather name="edit-2" size={16} color="#9CA3AF" />
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() => onDelete(group)}
            accessibilityRole="button"
            accessibilityLabel={`${group.name} を削除`}
          >
            <Feather name="trash-2" size={16} color="#9CA3AF" />
          </Pressable>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
  },
  info: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    flexShrink: 1,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    color: "#6B7280",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
  },
  actionButton: {
    padding: 6,
    borderRadius: 6,
  },
});
