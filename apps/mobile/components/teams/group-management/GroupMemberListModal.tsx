import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useSignedImageUrl } from "@/hooks/useSignedImageUrl";
import { CenterModal } from "@/components/ui/CenterModal";
import type { TeamGroupWithCount } from "./hooks";

interface MemberInfo {
  id: string;
  user_id: string;
  role: string;
  users: {
    id: string;
    name: string;
    profile_image_path: string | null;
  };
}

interface GroupMemberRowProps {
  item: MemberInfo;
  memberName: string;
  onPress?: () => void;
}

/**
 * グループメンバー1行分の表示
 * profile-images は private バケットのため、行単位で署名付きURLを解決する（Issue #36）
 */
const GroupMemberRow: React.FC<GroupMemberRowProps> = ({
  item,
  memberName,
  onPress,
}) => {
  const { t } = useTranslation();
  const { url: resolvedAvatarUrl } = useSignedImageUrl(
    "profile-images",
    item.users?.profile_image_path,
  );

  return (
    <Pressable
      style={({ pressed }) => [
        styles.memberRow,
        pressed && styles.memberRowPressed,
      ]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={t("teamsAdmin.groupMemberList.viewDetailAriaLabel", {
        name: memberName,
      })}
    >
      {resolvedAvatarUrl ? (
        <Image
          source={{ uri: resolvedAvatarUrl }}
          style={styles.avatarImage}
          contentFit="cover"
        />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {memberName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.memberName} numberOfLines={1}>
        {memberName}
      </Text>
      {item.role === "admin" && (
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>
            {t("teams.mobile.roleAdmin")}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

interface GroupMemberListModalProps {
  visible: boolean;
  onClose: () => void;
  group: TeamGroupWithCount | null;
  teamId: string;
  supabase: SupabaseClient;
  /** メンバー行タップでメンバー詳細を開く（web GroupMemberListModal の onMemberClick 相当） */
  onMemberClick?: (userId: string) => void;
}

export const GroupMemberListModal: React.FC<GroupMemberListModalProps> = ({
  visible,
  onClose,
  group,
  teamId,
  supabase,
  onMemberClick,
}) => {
  const { t } = useTranslation();
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!group) return;
    setLoading(true);
    try {
      const { data: groupMemberships, error: gmError } = await supabase
        .from("team_group_memberships")
        .select("user_id")
        .eq("team_group_id", group.id);
      if (gmError) throw gmError;

      const userIds = (groupMemberships ?? []).map(
        (m: { user_id: string }) => m.user_id,
      );
      if (userIds.length === 0) {
        setMembers([]);
        return;
      }

      const { data, error: tmError } = await supabase
        .from("team_memberships")
        .select(
          `
          id,
          user_id,
          role,
          users!team_memberships_user_id_fkey (
            id,
            name,
            profile_image_path
          )
        `,
        )
        .eq("team_id", teamId)
        .eq("status", "approved")
        .eq("is_active", true)
        .in("user_id", userIds)
        .order("role", { ascending: true });

      if (tmError) throw tmError;
      setMembers((data ?? []) as unknown as MemberInfo[]);
    } catch (err) {
      console.error("グループメンバー取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [group, teamId, supabase]);

  useEffect(() => {
    if (visible && group) {
      loadMembers();
    }
  }, [visible, group, loadMembers]);

  // 呼び出し元 (TeamGroupManagement.tsx) は group と visible を同一 state で同時に
  // null/false にするため、生の group だけで中身を判定すると CenterModal の閉じ
  // アニメーション(160msのフェード+スケールアウト)より先に中身が消えてしまう
  // (空の白いカードが一瞬見える)。そこで直近の非 null な group をキャッシュし、
  // レンダーにはこちら (displayGroup) を使う (GroupMemberModal.tsx と同じ方式。
  // レンダー中に ref.current を読むと react-hooks/refs に抵触するため
  // useState + useEffect で同期する)。
  // データ取得 (loadMembers/useEffect) は生の group を使い続ける (キャッシュ値を使うと
  // 別グループを開いたときに古いグループのメンバーを再取得してしまう)。
  // 「group を一度も受け取っていない (= 初回マウントから null のまま)」場合だけ、
  // 何もレンダーしない (GroupMemberModal.tsx の [V-B1-14] と同じ契約)。
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
      onClose={onClose}
      closeAccessibilityLabel={t("common.close")}
      showCloseButton={false}
      contentStyle={styles.modalContent}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {displayGroup.name}
        </Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* メンバー数 */}
        <View style={styles.countRow}>
          <Feather name="users" size={14} color="#6B7280" />
          <Text style={styles.countText}>
            {t("teams.mobile.groupManagement.memberCount", {
              count: members.length,
            })}
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : members.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Feather name="users" size={40} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {t("teams.mobile.groupManagement.membersEmpty")}
            </Text>
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            style={styles.memberList}
            renderItem={({ item }) => {
              const memberName =
                item.users?.name || t("teams.mobile.unnamedMember");
              return (
                <GroupMemberRow
                  item={item}
                  memberName={memberName}
                  onPress={
                    onMemberClick
                      ? () => onMemberClick(item.user_id)
                      : undefined
                  }
                />
              );
            }}
          />
        )}
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
    maxHeight: "70%",
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
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  countText: {
    fontSize: 13,
    color: "#6B7280",
  },
  loadingContainer: {
    padding: 48,
    alignItems: "center",
  },
  emptyContainer: {
    padding: 48,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
  },
  memberList: {
    maxHeight: 350,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  memberRowPressed: {
    backgroundColor: "#F9FAFB",
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  memberName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    flex: 1,
  },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    marginLeft: 8,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2563EB",
  },
});
