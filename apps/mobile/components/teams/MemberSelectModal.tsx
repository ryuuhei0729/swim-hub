import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMembershipWithUser } from "@apps/shared/types";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { TeamMemberGroupFilter } from "./TeamMemberGroupFilter";
import { deriveMemberGroupRanges, type MemberGroupRange } from "./memberSelectGroupRanges";

interface MemberSelectModalProps {
  visible: boolean;
  teamId: string;
  supabase: SupabaseClient;
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
 *
 * TeamMembershipWithUser[] を受け取り、user_id の配列で選択状態を管理する。
 * 選択 UI はラベルチップ (白/青) の折り返しグリッドで、左のグループフィルター
 * (性別・カテゴリ) と、グループ見出しごとのミニ全選択トグル、
 * モーダル右上のグローバル全選択トグルを持つ。
 * 並び順は呼び出し元 (useTeamsQuery → TeamMembersAPI.list()) が
 * compareMembersByBirthday で決定済みなので、ここでは独自に並べ替えない。
 */
export function MemberSelectModal({
  visible,
  teamId,
  supabase,
  members,
  selectedUserIds,
  onConfirm,
  onCancel,
  title,
}: MemberSelectModalProps) {
  const { t } = useTranslation();
  const [tempSelected, setTempSelected] = useState<string[]>(selectedUserIds);
  const [groupedMembers, setGroupedMembers] = useState<TeamMembershipWithUser[]>(members);
  const [groupHeaders, setGroupHeaders] = useState<Map<number, string>>(new Map());

  // モーダルが開かれるたびに親の選択状態へ同期
  useEffect(() => {
    if (visible) {
      setTempSelected(selectedUserIds);
    }
  }, [visible, selectedUserIds]);

  // TeamMemberGroupFilter へ渡すコールバックは安定させ、無限レンダーループと
  // 不要な再マウントを避ける（TeamMemberList.tsx と同じ形）
  const handleGroupedMembersChange = useCallback(
    (sorted: TeamMembershipWithUser[], headers: Map<number, string>) => {
      setGroupedMembers(sorted);
      setGroupHeaders(headers);
    },
    [],
  );

  const toggleMember = (userId: string) => {
    setTempSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  // R1/R7: 全候補が選択済みかどうかの判定元、およびグローバル全選択で選択される順序は
  // groupedMembers (グループ表示用に性別/カテゴリで再配列された配列。同一ユーザーが
  // 複数グループに属す場合は重複もありうる) ではなく members (呼び出し元が
  // compareMembersByBirthday で決定した生年月日順の原配列で、members prop としてこの
  // モーダルに渡ってくる集合) を基準にする。groupedMembers は members を並べ替えた
  // (場合によっては重複させた) ものに過ぎず、集合として同じなので判定結果は変わらない。
  // 何もタップせず「全選択」を押した場合のドラフト行の並び順がユーザーの
  // 「大前提、生年月日順」という要件に一致することが目的 (呼び出し元3画面は
  // selectedUserIds の順序をそのままドラフト行の並びに使っている)。
  const isAllSelected =
    members.length > 0 && members.every((m) => tempSelected.includes(m.user_id));

  const handleGlobalToggle = () => {
    // members 自体は「1メンバー1行」が前提 (team_memberships は team_id+user_id で
    // 一意) なので通常は重複しないが、handleRangeToggle / onConfirm と同じ Set 経由の
    // 一意化を揃えておくことで、このモーダル内のどの選択操作も同じ形の不変条件を守る。
    setTempSelected(isAllSelected ? [] : Array.from(new Set(members.map((m) => m.user_id))));
  };

  const ranges = useMemo(
    () => deriveMemberGroupRanges(groupedMembers, groupHeaders),
    [groupedMembers, groupHeaders],
  );

  // グルーピングが無効 (activeCategory === null) の場合は見出し無しの単一セクション
  const sections: MemberGroupRange[] =
    ranges.length > 0 ? ranges : [{ label: "", start: 0, end: groupedMembers.length }];

  // R2: グループ内のみを対象にし、他グループの選択状態は変えない
  const handleRangeToggle = (range: MemberGroupRange) => {
    const rangeMembers = groupedMembers.slice(range.start, range.end);
    const rangeIds = rangeMembers.map((m) => m.user_id);
    const isRangeAllSelected =
      rangeMembers.length > 0 && rangeMembers.every((m) => tempSelected.includes(m.user_id));
    setTempSelected((prev) => {
      if (isRangeAllSelected) {
        return prev.filter((id) => !rangeIds.includes(id));
      }
      const merged = new Set(prev);
      rangeIds.forEach((id) => merged.add(id));
      return Array.from(merged);
    });
  };

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

      {/* 操作行: 左にグルーピングカテゴリ切替、右端にグローバル全選択トグル */}
      <View style={styles.controlRow}>
        <View style={styles.groupFilterFill}>
          <TeamMemberGroupFilter
            teamId={teamId}
            supabase={supabase}
            members={members}
            onGroupedMembersChange={handleGroupedMembersChange}
          />
        </View>
        <Pressable
          style={[styles.toggleButton, isAllSelected && styles.toggleButtonSelected]}
          onPress={handleGlobalToggle}
          accessibilityRole="button"
          accessibilityState={{ selected: isAllSelected }}
        >
          <Text
            style={[styles.toggleButtonText, isAllSelected && styles.toggleButtonTextSelected]}
          >
            {t("teams.record.selectAllToggle")}
          </Text>
        </Pressable>
      </View>

      {/* メンバーチップグリッド（グループ見出し + 折り返しグリッド） */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {sections.map((range) => {
          const rangeMembers = groupedMembers.slice(range.start, range.end);
          const isRangeAllSelected =
            rangeMembers.length > 0 &&
            rangeMembers.every((m) => tempSelected.includes(m.user_id));
          return (
            <View key={`${range.label}-${range.start}`} style={styles.group}>
              {range.label ? (
                <View style={styles.groupHeaderRow}>
                  <Text style={styles.groupHeaderText}>{range.label}</Text>
                  <Pressable
                    style={[
                      styles.miniToggleButton,
                      isRangeAllSelected && styles.toggleButtonSelected,
                    ]}
                    onPress={() => handleRangeToggle(range)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isRangeAllSelected }}
                    accessibilityLabel={t("teams.record.selectAllToggleGroup", {
                      group: range.label,
                    })}
                  >
                    <Text
                      style={[
                        styles.miniToggleButtonText,
                        isRangeAllSelected && styles.toggleButtonTextSelected,
                      ]}
                    >
                      {t("teams.record.selectAllToggle")}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.chipGrid}>
                {rangeMembers.map((member) => {
                  const isSelected = tempSelected.includes(member.user_id);
                  return (
                    <Pressable
                      key={member.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => toggleMember(member.user_id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        style={[styles.chipText, isSelected && styles.chipTextSelected]}
                        numberOfLines={1}
                      >
                        {member.users?.name || t("teams.mobile.unnamedMember")}
                      </Text>
                      {member.role === "admin" && (
                        <View
                          style={[styles.adminBadge, isSelected && styles.adminBadgeSelected]}
                        >
                          <Text
                            style={[
                              styles.adminBadgeText,
                              isSelected && styles.adminBadgeTextSelected,
                            ]}
                          >
                            {t("teams.record.adminBadge")}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
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
            // モーダルの出力契約: onConfirm はこのモーダルの唯一の出力点であり、
            // ここで Set 経由の一意化を行うため、呼び出し元に重複 user_id を含む
            // 配列が渡ることはない (groupedMembers が同一ユーザーを複数グループに
            // 含む場合や、個別トグルの積み重ねで理論上重複が生じた場合も含めて吸収する)。
            // 呼び出し元3画面側に防御的な重複排除を追加する必要はない。
            onPress={() => onConfirm(Array.from(new Set(tempSelected)))}
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
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  groupFilterFill: {
    flex: 1,
    minWidth: 0,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  toggleButtonSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  toggleButtonTextSelected: {
    color: "#FFFFFF",
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    padding: 12,
    gap: 16,
  },
  group: {
    gap: 8,
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupHeaderText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  miniToggleButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  miniToggleButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    // 1個のチップ自体が行幅を超えないよう、GroupMemberListModal.tsx の memberName
    // (flex: 1 でテキスト側を可変にする) と同じ考え方で、テキスト側 (chipText) を
    // 縮められるようにする。chip 自身も maxWidth: "100%" (chipGrid 基準の割合。
    // マジックナンバーの追加ではなく親幅に対する比率) + flexShrink: 1 で
    // 親行の幅を超えて伸びないようにする
    maxWidth: "100%",
    flexShrink: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    // admin バッジより名前側を優先的に縮める (バッジが潰れないよう flexShrink は
    // 付けない)。numberOfLines={1} の省略が効くのはテキスト側が縮められる場合のみ
    flexShrink: 1,
  },
  chipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  adminBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "#EDE9FE",
  },
  adminBadgeSelected: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6D28D9",
  },
  adminBadgeTextSelected: {
    color: "#FFFFFF",
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
