import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TeamMembershipWithUser } from "@apps/shared/types";
import { SlideUpModal } from "@/components/ui/SlideUpModal";

interface MemberSelectModalProps {
  visible: boolean;
  members: TeamMembershipWithUser[];
  /** 初期選択中の user_id 配列 */
  selectedUserIds: string[];
  /** 決定時に選択された user_id 配列を返す */
  onConfirm: (userIds: string[]) => void;
  onCancel: () => void;
  /** モーダルタイトル（省略時は teams.record.memberSelectTitle） */
  title?: string;
}

/**
 * チームメンバー複数選択モーダル（汎用基盤）
 * 大会・練習の代理入力フローで共通利用する。
 * Web RecordClient の userSelectModal 相当（全員選択/解除、admin バッジ）。
 *
 * TeamMembershipWithUser[] を受け取り、user_id の配列で選択状態を管理する。
 */
export function MemberSelectModal({
  visible,
  members,
  selectedUserIds,
  onConfirm,
  onCancel,
  title,
}: MemberSelectModalProps) {
  const { t } = useTranslation();
  const [tempSelected, setTempSelected] = useState<string[]>(selectedUserIds);

  // モーダルが開かれるたびに親の選択状態へ同期
  useEffect(() => {
    if (visible) {
      setTempSelected(selectedUserIds);
    }
  }, [visible, selectedUserIds]);

  const toggle = (userId: string) => {
    setTempSelected((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const selectAll = () => setTempSelected(members.map((m) => m.user_id));
  const clearAll = () => setTempSelected([]);

  return (
    <SlideUpModal
      visible={visible}
      backdropAccessibilityLabel={t("common.close")}
      onClose={onCancel}
      overlayColor="rgba(0,0,0,0.4)"
      sheetStyle={styles.sheet}
    >
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {title ?? t("teams.record.memberSelectTitle")}
        </Text>
        <Pressable
          onPress={onCancel}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>

      {/* 一括選択 */}
      <View style={styles.bulkRow}>
        <Pressable style={styles.bulkSelectButton} onPress={selectAll}>
          <Text style={styles.bulkSelectText}>
            {t("teams.record.selectAll")}
          </Text>
        </Pressable>
        <Pressable style={styles.bulkClearButton} onPress={clearAll}>
          <Text style={styles.bulkClearText}>
            {t("teams.record.clearSelection")}
          </Text>
        </Pressable>
      </View>

      {/* メンバーリスト */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {members.map((member) => {
          const isSelected = tempSelected.includes(member.user_id);
          return (
            <Pressable
              key={member.id}
              style={[styles.memberRow, isSelected && styles.memberRowSelected]}
              onPress={() => toggle(member.user_id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
            >
              <Switch
                value={isSelected}
                onValueChange={() => toggle(member.user_id)}
              />
              <Text style={styles.memberName} numberOfLines={1}>
                {member.users?.name || t("teams.mobile.unnamedMember")}
              </Text>
              {member.role === "admin" && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>
                    {t("teams.record.adminBadge")}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* フッター */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Text style={styles.countText}>
          {t("teams.record.selectedMemberCount", { n: tempSelected.length })}
        </Text>
        <View style={styles.footerButtons}>
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable
            style={styles.confirmButton}
            onPress={() => onConfirm(tempSelected)}
          >
            <Text style={styles.confirmButtonText}>
              {t("teams.record.confirmSelection")}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SlideUpModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "80%",
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  bulkRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  bulkSelectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#DBEAFE",
  },
  bulkSelectText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1D4ED8",
  },
  bulkClearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
  bulkClearText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  memberRowSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#EDE9FE",
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6D28D9",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  countText: {
    fontSize: 13,
    color: "#6B7280",
  },
  footerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  confirmButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#2563EB",
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
