import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { GroupCard } from "./GroupCard";
import type { TeamGroupWithCount } from "./hooks";

interface CategorySectionProps {
  category: string | null;
  groups: TeamGroupWithCount[];
  isAdmin: boolean;
  onGroupPress: (group: TeamGroupWithCount) => void;
  onEditGroup: (group: TeamGroupWithCount) => void;
  onDeleteGroup: (group: TeamGroupWithCount) => void;
  onManageMembers: (group: TeamGroupWithCount) => void;
  onBulkAssign?: (category: string) => void;
}

export const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  groups,
  isAdmin,
  onGroupPress,
  onEditGroup,
  onDeleteGroup,
  onManageMembers,
  onBulkAssign,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <View style={styles.container}>
      {/* カテゴリヘッダー */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerLeft}
          onPress={() => setIsExpanded(!isExpanded)}
          accessibilityRole="button"
          accessibilityLabel={`${category || "未分類"} を${isExpanded ? "折りたたむ" : "展開する"}`}
        >
          <Feather name={isExpanded ? "chevron-down" : "chevron-right"} size={16} color="#6B7280" />
          <Text style={styles.categoryName}>{category || "未分類"}</Text>
          <Text style={styles.groupCount}>({groups.length}グループ)</Text>
        </Pressable>
        {isAdmin && category && onBulkAssign && (
          <Pressable
            style={styles.bulkAssignButton}
            onPress={() => onBulkAssign(category)}
            accessibilityRole="button"
            accessibilityLabel={`${category} の一括振り分け`}
          >
            <Feather name="shuffle" size={14} color="#4B5563" />
            <Text style={styles.bulkAssignText}>一括振り分け</Text>
          </Pressable>
        )}
      </View>

      {/* グループリスト */}
      {isExpanded && (
        <View style={styles.groupList}>
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isAdmin={isAdmin}
              onPress={onGroupPress}
              onEdit={onEditGroup}
              onDelete={onDeleteGroup}
              onManageMembers={onManageMembers}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  groupCount: {
    fontSize: 12,
    color: "#6B7280",
  },
  bulkAssignButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
  },
  bulkAssignText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#4B5563",
  },
  groupList: {
    padding: 8,
    gap: 6,
  },
});
