import React, { useState, useMemo, useLayoutEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useTeamsQuery,
  useDeleteAnnouncementMutation,
  useListPendingMembersQuery,
} from "@apps/shared/hooks/queries/teams";
import {
  TeamTabs,
  TeamMemberList,
  MyMonthlyAttendance,
  PendingMembersSection,
  TeamGroupManagement,
  type TeamTabType,
} from "@/components/teams";
import { AdminMonthlyAttendance } from "@/components/teams/AdminMonthlyAttendance";
import { TeamDetailHeaderAdminToggle } from "@/components/teams/TeamDetailHeaderAdminToggle";
import { TeamSettingsModal } from "@/components/teams/TeamSettingsModal";
import { TeamAnnouncementList } from "@/components/teams/TeamAnnouncementList";
import { TeamAnnouncementForm } from "@/components/teams/TeamAnnouncementForm";
import { TeamPracticeList } from "@/components/teams/TeamPracticeList";
import { TeamCompetitionList } from "@/components/teams/TeamCompetitionList";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { resolveActiveTabOnAdminViewToggle } from "@/utils/teamAdminView";
import { useTeamAdminViewStore } from "@/stores/teamAdminViewStore";
import type { TeamAnnouncement } from "@swim-hub/shared/types";
import type { MainStackParamList } from "@/navigation/types";

type TeamDetailScreenRouteProp = RouteProp<MainStackParamList, "TeamDetail">;
type TeamDetailNavigationProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * チーム詳細画面
 * チーム情報、メンバー、練習、大会、出欠を表示（閲覧専用）
 */
export const TeamDetailScreen: React.FC = () => {
  const route = useRoute<TeamDetailScreenRouteProp>();
  const navigation = useNavigation<TeamDetailNavigationProp>();
  const { teamId, initialTab } = route.params;
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TeamTabType>(initialTab ?? "members");
  const [isCopied, setIsCopied] = useState(false);
  // 管理者ビュー/利用者ビューの状態は、ヘッダー右側の TeamDetailHeaderAdminToggle と
  // 共有購読するためストアで管理する（詳細は teamAdminViewStore.ts のコメント参照）
  const isAdminView = useTeamAdminViewStore((state) => state.isAdminView);
  const resetAdminView = useTeamAdminViewStore((state) => state.reset);
  const [announcementFormVisible, setAnnouncementFormVisible] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<TeamAnnouncement | undefined>(undefined);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  // チームデータ取得
  const { currentTeam, members, announcements, isLoading, isError, error, refetch } = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false, // モバイルでは一旦無効化
  });

  // 現在のユーザーが管理者かどうかを判定
  const isCurrentUserAdmin = useMemo(() => {
    if (!user || !members) return false;
    return members.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, members]);

  // 実効的な管理者ビュー状態。isAdminView はストア（モジュールシングルトン）由来のため、
  // 「別チームでは管理者だった」状態を引き継いだまま新しいチーム画面がマウントされる
  // 瞬間が起こり得る。isCurrentUserAdmin との AND を1箇所で導出し、管理者専用要素の
  // 表示判定は必ずこの値のみを参照する（isAdminView 単独で判定しない）ことで、
  // reset() のタイミングに依存せず非管理者への漏れを構造的に防ぐ
  const effectiveIsAdminView = isCurrentUserAdmin && isAdminView;

  // 承認待ちメンバー数（管理者のみ取得可。web TeamAdminClient の countPending 相当）
  const { data: pendingMembers } = useListPendingMembersQuery(
    supabase,
    isCurrentUserAdmin ? teamId : undefined,
  );
  const pendingCount = pendingMembers?.length ?? 0;

  const deleteAnnouncementMutation = useDeleteAnnouncementMutation(supabase);

  // チーム切替・画面離脱時に管理者ビュー状態をリセットする
  // （ストアはモジュール単位のシングルトンのため、画面スコープを明示的に区切る。
  // ただしこれは補助的な対策であり、非管理者への露出防止は effectiveIsAdminView の
  // 導出そのものが担う。post-paint の useEffect ではなく useLayoutEffect にして
  // リセットが反映されるまでの窓をできる限り縮める）
  useLayoutEffect(() => {
    resetAdminView();
    return () => {
      resetAdminView();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  // 管理者ビュー切替に追随して、管理者専用タブ (announcements/groups) に
  // 滞在していた場合は members タブへリセットする（実効値の変化を見る）
  const prevEffectiveIsAdminViewRef = useRef(effectiveIsAdminView);
  useLayoutEffect(() => {
    if (prevEffectiveIsAdminViewRef.current !== effectiveIsAdminView) {
      setActiveTab((prev) => resolveActiveTabOnAdminViewToggle(prev, effectiveIsAdminView));
      prevEffectiveIsAdminViewRef.current = effectiveIsAdminView;
    }
  }, [effectiveIsAdminView]);

  // ヘッダー右側に管理者ビュー切替スイッチを配置（管理者のみ）。
  // スイッチの値自体は TeamDetailHeaderAdminToggle がストアを直接購読するため、
  // ここでは isCurrentUserAdmin が変わったときのみ setOptions を呼べば良い
  // （詳細は teamAdminViewStore.ts のコメント参照）
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: isCurrentUserAdmin ? () => <TeamDetailHeaderAdminToggle /> : undefined,
    });
  }, [navigation, isCurrentUserAdmin]);

  // 招待コードをコピー
  const handleCopyInviteCode = async () => {
    if (!currentTeam || !currentTeam.invite_code) return;

    if (Platform.OS === "web") {
      // Web版ではClipboard APIを使用
      if (navigator.clipboard) {
        navigator.clipboard.writeText(currentTeam.invite_code).then(
          () => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
          },
          () => {
            window.alert(t("teams.mobile.copyFailed"));
          },
        );
      } else {
        // フォールバック: テキストエリアを使用
        const textArea = document.createElement("textarea");
        textArea.value = currentTeam.invite_code;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } catch {
          window.alert(t("teams.mobile.copyFailed"));
        }
        document.body.removeChild(textArea);
      }
    } else {
      try {
        await Clipboard.setStringAsync(currentTeam.invite_code);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch {
        Alert.alert(t("common.error"), t("teams.mobile.copyFailed"), [{ text: "OK" }]);
      }
    }
  };

  // 承認待ち状態
  if (isError && error?.message === "PENDING_APPROVAL") {
    return (
      <View style={styles.container}>
        <View style={styles.pendingContainer}>
          <Feather name="clock" size={48} color="#F59E0B" />
          <Text style={styles.pendingTitle}>{t("teams.mobile.statusPending")}</Text>
          <Text style={styles.pendingMessage}>{t("teams.mobile.pendingMessage")}</Text>
          <Pressable style={styles.pendingRetryButton} onPress={() => refetch()}>
            <Feather name="refresh-cw" size={16} color="#FFFFFF" />
            <Text style={styles.pendingRetryText}>{t("teams.mobile.pendingRetry")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // エラー状態
  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || t("teams.mobile.fetchTeamFailed")}
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    );
  }

  // ローディング状態
  if (isLoading && !currentTeam) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("teams.mobile.loadingTeam")} />
      </View>
    );
  }

  // チームが見つからない場合
  if (!currentTeam) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t("teams.mobile.teamNotFound")}</Text>
        </View>
      </View>
    );
  }

  const handleAnnouncementDelete = (announcementId: string) => {
    Alert.alert(
      t("teams.mobile.deleteConfirmTitle"),
      t("teams.mobile.deleteConfirmText"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAnnouncementMutation.mutateAsync(announcementId);
            } catch {
              Alert.alert(t("common.error"), t("teams.mobile.announcementDeleteFailed"), [
                { text: "OK" },
              ]);
            }
          },
        },
      ],
    );
  };

  // 一括登録画面への導線（管理者ビューの練習/大会タブ。web admin タブの bulk-register 相当）
  const renderBulkRegisterButton = () => (
    <View style={styles.bulkRegisterRow}>
      <Pressable
        style={styles.bulkRegisterButton}
        onPress={() => navigation.navigate("TeamBulkRegister", { teamId })}
        accessibilityRole="button"
        accessibilityLabel={t("teamsAdmin.tabs.bulkRegister")}
      >
        <Feather name="upload" size={14} color="#2563EB" />
        <Text style={styles.bulkRegisterButtonText}>{t("teamsAdmin.tabs.bulkRegister")}</Text>
      </Pressable>
    </View>
  );

  // タブコンテンツのレンダリング
  const renderTabContent = () => {
    switch (activeTab) {
      case "members":
        return (
          <View style={styles.membersTabContent}>
            {effectiveIsAdminView && <PendingMembersSection teamId={teamId} />}
            <TeamMemberList
              members={members || []}
              teamId={teamId}
              isLoading={isLoading}
              isError={isError}
              error={error || null}
              currentUserId={user?.id || ""}
              isCurrentUserAdmin={isCurrentUserAdmin}
              onRetry={() => refetch()}
              onMemberChange={() => refetch()}
            />
          </View>
        );
      case "groups":
        return (
          <TeamGroupManagement
            teamId={teamId}
            members={members ?? []}
            isCurrentUserAdmin={isCurrentUserAdmin}
          />
        );
      case "practices":
        return (
          <View style={styles.eventTabContent}>
            {effectiveIsAdminView && renderBulkRegisterButton()}
            <TeamPracticeList teamId={teamId} isAdmin={effectiveIsAdminView} />
          </View>
        );
      case "competitions":
        return (
          <View style={styles.eventTabContent}>
            {effectiveIsAdminView && renderBulkRegisterButton()}
            <TeamCompetitionList teamId={teamId} isAdmin={effectiveIsAdminView} />
          </View>
        );
      case "attendance":
        return effectiveIsAdminView ? (
          <AdminMonthlyAttendance teamId={teamId} />
        ) : (
          <MyMonthlyAttendance teamId={teamId} />
        );
      case "announcements":
        return (
          <View style={styles.announcementsTabContent}>
            <TeamAnnouncementList
              announcements={announcements || []}
              isLoading={isLoading}
              isError={isError}
              error={error || null}
              isAdmin={effectiveIsAdminView}
              onRetry={() => refetch()}
              onCreateNew={() => {
                setEditingAnnouncement(undefined);
                setAnnouncementFormVisible(true);
              }}
              onEdit={(announcement) => {
                setEditingAnnouncement(announcement);
                setAnnouncementFormVisible(true);
              }}
              onDelete={handleAnnouncementDelete}
            />
            <TeamAnnouncementForm
              visible={announcementFormVisible}
              onClose={() => {
                setAnnouncementFormVisible(false);
                setEditingAnnouncement(undefined);
              }}
              teamId={teamId}
              editData={editingAnnouncement}
              onSuccess={() => refetch()}
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* チーム情報（固定） */}
      <View style={styles.teamInfo}>
        <View style={styles.teamInfoRow}>
          <Text style={styles.teamName} numberOfLines={1}>
            {currentTeam.name}
          </Text>
          <View style={styles.teamInfoRight}>
            {currentTeam.invite_code && (
              <View style={styles.inviteCodeContent}>
                <Text style={styles.inviteCode}>{currentTeam.invite_code}</Text>
                <Pressable style={styles.copyButton} onPress={handleCopyInviteCode}>
                  <Feather
                    name={isCopied ? "check" : "clipboard"}
                    size={14}
                    color={isCopied ? "#10B981" : "#9CA3AF"}
                  />
                </Pressable>
              </View>
            )}
            {effectiveIsAdminView && (
              <Pressable
                style={styles.settingsButton}
                onPress={() => setSettingsModalVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t("teamsAdmin.settings.title")}
              >
                <Feather name="edit-2" size={13} color="#6B7280" />
              </Pressable>
            )}
          </View>
        </View>
        {currentTeam.description && (
          <Text style={styles.teamDescription}>{currentTeam.description}</Text>
        )}
      </View>

      {/* タブ（固定） */}
      <TeamTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isAdmin={effectiveIsAdminView}
        pendingCount={isCurrentUserAdmin ? pendingCount : 0}
      />

      {/* タブコンテンツ（スクロール可能） */}
      <View style={styles.tabContent}>{renderTabContent()}</View>

      {/* チーム設定モーダル（管理者専用） */}
      <TeamSettingsModal
        visible={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        teamId={teamId}
        teamName={currentTeam.name}
        teamDescription={currentTeam.description}
        onSuccess={() => refetch()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  teamInfo: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  teamInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  teamInfoRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  teamName: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#111827",
    flexShrink: 1,
  },
  teamDescription: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 16,
  },
  inviteCodeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inviteCode: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    fontFamily: "monospace",
  },
  copyButton: {
    padding: 2,
  },
  tabContent: {
    flex: 1,
    minHeight: 400,
  },
  eventTabContent: {
    flex: 1,
  },
  bulkRegisterRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  bulkRegisterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  bulkRegisterButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
  settingsButton: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  membersTabContent: {
    flex: 1,
  },
  announcementsTabContent: {
    flex: 1,
  },
  pendingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  pendingTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#92400E",
    marginTop: 16,
    marginBottom: 8,
  },
  pendingMessage: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  pendingRetryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F59E0B",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  pendingRetryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: "#DC2626",
  },
});
