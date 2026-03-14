import React, { useState, useEffect, useMemo } from "react";
import { View, Text, Modal, Pressable, TextInput, FlatList, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { TeamGroupWithCount } from "./hooks";

interface TeamMemberForSelection {
  id: string;
  user_id: string;
  users: {
    id: string;
    name: string;
    profile_image_path?: string | null;
  };
}

interface GroupMemberModalProps {
  visible: boolean;
  onClose: () => void;
  group: TeamGroupWithCount | null;
  teamMembers: TeamMemberForSelection[];
  currentMemberUserIds: string[];
  onSave: (groupId: string, userIds: string[]) => Promise<boolean>;
  saving: boolean;
  loading: boolean;
}

export const GroupMemberModal: React.FC<GroupMemberModalProps> = ({
  visible,
  onClose,
  group,
  teamMembers,
  currentMemberUserIds,
  onSave,
  saving,
  loading,
}) => {
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setSelectedUserIds(new Set(currentMemberUserIds));
    setSearchQuery("");
  }, [currentMemberUserIds, visible]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return teamMembers;
    const q = searchQuery.toLowerCase();
    return teamMembers.filter((m) => m.users.name.toLowerCase().includes(q));
  }, [teamMembers, searchQuery]);

  const handleToggle = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedUserIds(new Set(teamMembers.map((m) => m.user_id)));
  };

  const handleDeselectAll = () => {
    setSelectedUserIds(new Set());
  };

  const handleSave = async () => {
    if (!group) return;
    const success = await onSave(group.id, [...selectedUserIds]);
    if (success) {
      onClose();
    }
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  if (!group) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {group.name} のメンバー
            </Text>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.body}>
            {/* 検索 */}
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="メンバーを検索..."
              placeholderTextColor="#9CA3AF"
            />

            {/* 選択状況 */}
            <View style={styles.selectionBar}>
              <Text style={styles.selectionCount}>
                {selectedUserIds.size} / {teamMembers.length} 人選択中
              </Text>
              <View style={styles.selectionActions}>
                <Pressable onPress={handleSelectAll}>
                  <Text style={styles.selectAllText}>全選択</Text>
                </Pressable>
                <Pressable onPress={handleDeselectAll}>
                  <Text style={styles.deselectAllText}>全解除</Text>
                </Pressable>
              </View>
            </View>

            {/* メンバーリスト */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>読み込み中...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredMembers}
                keyExtractor={(item) => item.user_id}
                style={styles.memberList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      {searchQuery ? "該当するメンバーがいません" : "メンバーがいません"}
                    </Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const isSelected = selectedUserIds.has(item.user_id);
                  return (
                    <Pressable
                      style={[styles.memberRow, isSelected && styles.memberRowSelected]}
                      onPress={() => handleToggle(item.user_id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={item.users.name}
                    >
                      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                        {isSelected && <Feather name="check" size={14} color="#FFFFFF" />}
                      </View>
                      <Text style={styles.memberName}>{item.users.name}</Text>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>

          <View style={styles.footer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.submitButton, saving && styles.submitButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.submitButtonText}>{saving ? "保存中..." : "保存"}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    width: "100%",
    maxWidth: 500,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#6B7280",
    lineHeight: 28,
  },
  body: {
    padding: 16,
    flex: 1,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  selectionCount: {
    fontSize: 12,
    color: "#6B7280",
  },
  selectionActions: {
    flexDirection: "row",
    gap: 12,
  },
  selectAllText: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "500",
  },
  deselectAllText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  memberList: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    maxHeight: 300,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  memberRowSelected: {
    backgroundColor: "#EFF6FF",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  memberName: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#374151",
  },
  submitButton: {
    backgroundColor: "#2563EB",
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#FFFFFF",
  },
});
