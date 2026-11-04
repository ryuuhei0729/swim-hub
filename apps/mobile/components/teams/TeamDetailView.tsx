import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useTeamsQuery,
  useDeleteAnnouncementMutation,
  useListPendingMembersQuery,
} from "@apps/shared/hooks/queries/teams";
import { TeamTabs, type TeamTabType } from "./TeamTabs";
import { TeamMemberList } from "./TeamMemberList";
import { MyMonthlyAttendance } from "./MyMonthlyAttendance";
import { PendingMembersSection } from "./PendingMembersSection";
import { TeamGroupManagement } from "./group-management";
import { AdminMonthlyAttendance } from "./AdminMonthlyAttendance";
import { TeamHeaderAdminToggle } from "./TeamHeaderAdminToggle";
import { TeamSettingsTab } from "./TeamSettingsTab";
import { TeamAnnouncementList } from "./TeamAnnouncementList";
import { TeamAnnouncementForm } from "./TeamAnnouncementForm";
import { TeamPracticeList } from "./TeamPracticeList";
import { TeamCompetitionList } from "./TeamCompetitionList";
import { TeamRankings } from "./rankings";
import { TeamMemberGoalsTab } from "./member-goals/TeamMemberGoalsTab";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { StaleDataBanner } from "@/components/layout/StaleDataBanner";
import { resolveActiveTabOnAdminViewToggle } from "@/utils/teamAdminView";
import { useTeamViewStore } from "@/stores/teamViewStore";
import type { TeamAnnouncement } from "@swim-hub/shared/types";
import { usePendingAction } from "@/hooks/usePendingAction";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";

export interface TeamDetailViewProps {
  teamId: string;
  /** チーム一覧から渡すチーム名。詳細の取得前・取得失敗時もヘッダーに出せるようにする */
  teamName: string;
  /** ヘッダーのチーム名を押したとき (チーム切替シートを開く) */
  onOpenSwitcher: () => void;
  /** 脱退に成功してこのチームを離れたとき */
  onLeftTeam: () => void;
}

/**
 * チームタブの中身 (選択中のチーム1つ分)
 * ヘッダー (チーム名 = 切替ボタン・管理者ビュー切替) と、メンバー・練習・大会・出欠などのタブを表示する。
 *
 * 最後に開いていたタブと管理者ビューの ON/OFF は、チームごとに useTeamViewStore に保存して復元する。
 * 呼び出し側は teamId を key に渡し、チームを切り替えたら作り直すこと
 * (お知らせフォームなどのローカル state を別チームへ持ち越さないため)。
 */
export const TeamDetailView: React.FC<TeamDetailViewProps> = ({
  teamId,
  teamName,
  onOpenSwitcher,
  onLeftTeam,
}) => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const storedTab = useTeamViewStore((state) => state.byTeam[teamId]?.tab);
  const isAdminView = useTeamViewStore((state) => state.byTeam[teamId]?.adminView === true);
  const setTab = useTeamViewStore((state) => state.setTab);
  const [announcementFormVisible, setAnnouncementFormVisible] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<TeamAnnouncement | undefined>(undefined);

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

  // 実効的な管理者ビュー状態。保存された adminView は「表示の好み」で、端末に残った値が
  // 管理者でなくなったチームや別アカウントで true のままのことがある。isCurrentUserAdmin との
  // AND を1箇所で導出し、管理者専用要素の表示判定は必ずこの値のみを参照する
  // (isAdminView 単独で判定しない) ことで、非管理者への漏れを構造的に防ぐ
  const effectiveIsAdminView = isCurrentUserAdmin && isAdminView;

  // 保存されたタブが管理者専用で、いまは管理者ビューでないなら members を表示する。
  // 保存値そのものは書き換えない (メンバー情報の取得前は isCurrentUserAdmin が false のため、
  // ここで書き換えると管理者が前回開いていたタブを取得待ちの間に失ってしまう)
  const activeTab = resolveActiveTabOnAdminViewToggle(storedTab ?? "members", effectiveIsAdminView);
  const handleTabChange = (tab: TeamTabType) => setTab(teamId, tab);

  // 承認待ちメンバー数（管理者のみ取得可。web TeamAdminClient の countPending 相当）
  const { data: pendingMembers } = useListPendingMembersQuery(
    supabase,
    isCurrentUserAdmin ? teamId : undefined,
  );
  const pendingCount = pendingMembers?.length ?? 0;

  const deleteAnnouncementMutation = useDeleteAnnouncementMutation(supabase);
  // 低速回線で削除中に再度押されないよう、お知らせの削除は同時に1件だけにする
  const {
    pendingKey: deletingAnnouncementId,
    run: runAnnouncementDelete,
    isBusy: isAnnouncementDeleteBusy,
  } = usePendingAction();

  // ヘッダー。読み込み中・エラー・承認待ちでも出し、別のチームへ切り替えられるようにする
  // (name は NOT NULL だが空文字だと無題になるため `||` で弾く)
  const header = (
    <View style={styles.header}>
      <Pressable
        style={styles.switcherButton}
        onPress={onOpenSwitcher}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("teams.mobile.switcher.openAria")}
        testID="team-switcher-open"
      >
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentTeam?.name || teamName}
        </Text>
        <Feather name="chevron-down" size={20} color="#6B7280" />
      </Pressable>
      {isCurrentUserAdmin && <TeamHeaderAdminToggle teamId={teamId} />}
    </View>
  );

  // 承認待ち状態
  if (isError && error?.message === "PENDING_APPROVAL") {
    return (
      <View style={styles.container}>
        {header}
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

  // エラー状態 (前回取得したチーム情報が無いときだけ全画面エラーにする)
  if (isError && error && !currentTeam) {
    return (
      <View style={styles.container}>
        {header}
        <ErrorView
          message={error.message || t("teams.mobile.fetchTeamFailed")}
          error={error}
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
        {header}
        <LoadingSpinner fullScreen message={t("teams.mobile.loadingTeam")} />
      </View>
    );
  }

  // チームが見つからない場合
  if (!currentTeam) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t("teams.mobile.teamNotFound")}</Text>
        </View>
      </View>
    );
  }

  const handleAnnouncementDelete = (announcementId: string) => {
    if (isAnnouncementDeleteBusy()) return;
    Alert.alert(
      t("teams.mobile.deleteConfirmTitle"),
      t("teams.mobile.deleteConfirmText"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            void runAnnouncementDelete(announcementId, async () => {
              try {
                await deleteAnnouncementMutation.mutateAsync(announcementId);
              } catch (deleteError) {
                Alert.alert(
                  t("common.error"),
                  toUserFacingMessage(deleteError, t("teams.mobile.announcementDeleteFailed")),
                  [{ text: "OK" }],
                );
              }
            });
          },
        },
      ],
    );
  };

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
            <TeamPracticeList teamId={teamId} isAdmin={effectiveIsAdminView} />
          </View>
        );
      case "competitions":
        return (
          <View style={styles.eventTabContent}>
            <TeamCompetitionList teamId={teamId} isAdmin={effectiveIsAdminView} />
          </View>
        );
      case "rankings":
        // 管理者専用ではない (一般メンバーも閲覧する)。
        // members は「WAポイントで比較」用。ここで詰め替えないこと
        return <TeamRankings teamId={teamId} members={members || []} />;
      case "goals":
        // 管理者ビュー時のみ描画 (RPC 側も管理者以外を拒否する)
        return effectiveIsAdminView ? (
          <TeamMemberGoalsTab teamId={teamId} members={members ?? []} />
        ) : null;
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
              deletingId={deletingAnnouncementId}
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
      case "settings":
        // 設定は全メンバー向けタブ。中身の出し分けは「管理者ビュー/利用者ビュー」トグルに
        // 連動させる (ユーザー指示。以前は永続的な権限 isCurrentUserAdmin 基準だった)
        return (
          <TeamSettingsTab
            teamId={teamId}
            teamName={currentTeam.name}
            teamDescription={currentTeam.description}
            inviteCode={currentTeam.invite_code}
            isAdminView={effectiveIsAdminView}
            members={members || []}
            onLeftTeam={onLeftTeam}
            onTeamUpdated={() => refetch()}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {header}
      {/* タブ（固定） */}
      <TeamTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isAdmin={effectiveIsAdminView}
        pendingCount={isCurrentUserAdmin ? pendingCount : 0}
      />
      {/* 再取得に失敗しても、前回取得した内容をそのまま表示する */}
      <StaleDataBanner visible={isError} onRetry={() => refetch()} />

      {/* タブコンテンツ（スクロール可能） */}
      <View style={styles.tabContent}>{renderTabContent()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  switcherButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
    flexShrink: 1,
  },
  tabContent: {
    flex: 1,
    minHeight: 400,
  },
  eventTabContent: {
    flex: 1,
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
