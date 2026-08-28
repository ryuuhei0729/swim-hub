import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { CenterModal } from "@/components/ui/CenterModal";
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
  const { t } = useTranslation();
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(),
  );
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

  // 呼び出し元 (TeamGroupManagement.tsx) は group と visible を同一 state で同時に
  // null/false にするため、生の group だけで中身を判定すると CenterModal の閉じ
  // アニメーション(160msのフェード+スケールアウト)より先に中身が消えてしまう
  // (空の白いカードが一瞬見える)。そこで直近の非 null な group をキャッシュし、
  // レンダーにはこちら (displayGroup) を使う (レンダー中に ref.current を読むと
  // react-hooks/refs に抵触するため useState + useEffect で同期する)。
  // 「group を一度も受け取っていない (= 初回マウントから null のまま)」場合だけ、
  // 既存テスト [V-B1-14] の契約 (group が null なら何もレンダーしない) を守るために
  // early return する。一度でも非 null を受け取ったあとは、閉じる際もこのキャッシュを
  // 使い続けるため、以後 group が null に戻っても early return されない。
  const [displayGroup, setDisplayGroup] = useState<TeamGroupWithCount | null>(
    group,
  );
  useEffect(() => {
    if (group !== null) {
      setDisplayGroup(group);
    }
  }, [group]);

  if (!displayGroup) return null;

  return (
    <CenterModal
      visible={visible}
      onClose={handleClose}
      closeAccessibilityLabel={t("common.close")}
      showCloseButton={false}
      contentStyle={styles.modalContent}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {t("teams.mobile.groupMembersTitle", { name: displayGroup.name })}
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
          placeholder={t("teams.mobile.memberSearchPlaceholder")}
          placeholderTextColor="#9CA3AF"
        />

        {/* 選択状況 */}
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>
            {t("teams.mobile.selectionCount", {
              selected: selectedUserIds.size,
              total: teamMembers.length,
            })}
          </Text>
          <View style={styles.selectionActions}>
            <Pressable onPress={handleSelectAll}>
              <Text style={styles.selectAllText}>
                {t("teams.mobile.selectAll")}
              </Text>
            </Pressable>
            <Pressable onPress={handleDeselectAll}>
              <Text style={styles.deselectAllText}>
                {t("teams.mobile.deselectAll")}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* メンバーリスト */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>
              {t("teams.mobile.loadingShort")}
            </Text>
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
                  {searchQuery
                    ? t("teams.mobile.noMatchingMembers")
                    : t("teams.mobile.noMembers")}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = selectedUserIds.has(item.user_id);
              return (
                <Pressable
                  style={[
                    styles.memberRow,
                    isSelected && styles.memberRowSelected,
                  ]}
                  onPress={() => handleToggle(item.user_id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={item.users.name}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxChecked,
                    ]}
                  >
                    {isSelected && (
                      <Feather name="check" size={14} color="#FFFFFF" />
                    )}
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
          <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.button,
            styles.submitButton,
            saving && styles.submitButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.submitButtonText}>
            {saving
              ? t("teams.mobile.saveLoading")
              : t("teams.mobile.saveButton")}
          </Text>
        </Pressable>
      </View>
    </CenterModal>
  );
};

const styles = StyleSheet.create({
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
