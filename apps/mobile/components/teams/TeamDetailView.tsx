import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useListPendingMembersQuery } from "@apps/shared/hooks/queries/teams";
import { TeamTabs, type TeamTabType } from "./TeamTabs";
import { TeamMemberList } from "./TeamMemberList";
import { PendingMembersSection } from "./PendingMembersSection";
import { TeamGroupManagement } from "./group-management";
import { TeamAttendanceTab } from "./attendance/TeamAttendanceTab";
import { TeamHeaderAdminToggle } from "./TeamHeaderAdminToggle";
import { TeamScheduleList } from "./TeamScheduleList";
import { TeamOthersTab } from "./TeamOthersTab";
import { TeamBodySkeleton } from "@/components/ui/ScreenSkeletons";
import { ErrorView } from "@/components/layout/ErrorView";
import { StaleDataBanner } from "@/components/layout/StaleDataBanner";
import { resolveActiveTabOnAdminViewToggle } from "@/utils/teamAdminView";
import { useTeamViewStore } from "@/stores/teamViewStore";
import { useTeamAdminView } from "@/hooks/useTeamAdminView";
import type { MainStackParamList } from "@/navigation/types";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

/** メンバータブ (管理者ビュー) の表示切替 */
type MembersSegment = "members" | "groups";

export interface TeamDetailViewProps {
  teamId: string;
  /** チーム一覧から渡すチーム名。詳細の取得前・取得失敗時もヘッダーに出せるようにする */
  teamName: string;
  /** ヘッダーのチーム名を押したとき (チーム切替シートを開く) */
  onOpenSwitcher: () => void;
}

/**
 * チームタブの中身 (選択中のチーム1つ分)
 * ヘッダー (チーム名 = 切替ボタン・お知らせ・チーム設定・管理者ビュー切替) と、
 * メンバー・予定・出欠・その他 の 4 タブを表示する。
 *
 * タブの数は管理者ビューでも変えない。管理者向けの機能は次の場所に置く:
 *   - 承認待ち・グループ管理 … メンバータブ (「メンバー / グループ」切替)
 *   - 練習・大会の追加・一括登録 … 予定タブ
 *   - 出欠の受付管理 … 出欠タブ (管理者ビューでは管理用の表示に切り替わる)
 *   - メンバーの目標 … その他タブ
 *   - お知らせの作成 … ヘッダー 🔔 から開く画面
 *
 * 最後に開いていたタブと管理者ビューの ON/OFF は、チームごとに useTeamViewStore に保存して復元する。
 * 呼び出し側は teamId を key に渡し、チームを切り替えたら作り直すこと
 * (メンバータブの表示切替などのローカル state を別チームへ持ち越さないため)。
 */
export const TeamDetailView: React.FC<TeamDetailViewProps> = ({
  teamId,
  teamName,
  onOpenSwitcher,
}) => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const storedTab = useTeamViewStore((state) => state.byTeam[teamId]?.tab);
  const setTab = useTeamViewStore((state) => state.setTab);
  const [membersSegment, setMembersSegment] = useState<MembersSegment>("members");

  const {
    currentTeam,
    members,
    isLoading,
    isError,
    error,
    refetch,
    isCurrentUserAdmin,
    effectiveIsAdminView,
  } = useTeamAdminView(teamId);

  const activeTab = resolveActiveTabOnAdminViewToggle(storedTab ?? "members", effectiveIsAdminView);
  const handleTabChange = (tab: TeamTabType) => setTab(teamId, tab);
  // グループ管理は管理者ビューでのみ選べる。利用者ビューに戻したらメンバー表を出す
  const activeMembersSegment: MembersSegment = effectiveIsAdminView ? membersSegment : "members";

  const { data: pendingMembers } = useListPendingMembersQuery(
    supabase,
    isCurrentUserAdmin ? teamId : undefined,
  );
  const pendingCount = pendingMembers?.length ?? 0;

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
      <View style={styles.headerActions}>
        <Pressable
          style={styles.headerIconButton}
          onPress={() => navigation.navigate("TeamAnnouncements", { teamId })}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t("teams.mobile.headerAnnouncements")}
          testID="team-header-announcements"
        >
          <Feather name="bell" size={21} color="#374151" />
        </Pressable>
        <Pressable
          style={styles.headerIconButton}
          onPress={() => navigation.navigate("TeamSettings", { teamId })}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t("teams.mobile.headerSettings")}
          testID="team-header-settings"
        >
          <Feather name="settings" size={21} color="#374151" />
        </Pressable>
        {isCurrentUserAdmin && <TeamHeaderAdminToggle teamId={teamId} />}
      </View>
    </View>
  );

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

  if (isLoading && !currentTeam) {
    return (
      <View style={styles.container}>
        {header}
        <TeamBodySkeleton />
      </View>
    );
  }

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

  const renderMembersTab = () => (
    <View style={styles.membersTabContent}>
      {effectiveIsAdminView && (
        <View style={styles.segment} accessibilityRole="tablist">
          {(
            [
              ["members", "teams.mobile.tabMembers"],
              ["groups", "teams.mobile.tabGroups"],
            ] as const
          ).map(([id, labelKey]) => {
            const isActive = activeMembersSegment === id;
            return (
              <Pressable
                key={id}
                style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
                onPress={() => setMembersSegment(id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                testID={`team-members-segment-${id}`}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {t(labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {activeMembersSegment === "groups" ? (
        <TeamGroupManagement
          teamId={teamId}
          members={members ?? []}
          isCurrentUserAdmin={isCurrentUserAdmin}
        />
      ) : (
        <>
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
        </>
      )}
    </View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "members":
        return renderMembersTab();
      case "schedule":
        return <TeamScheduleList teamId={teamId} isAdmin={effectiveIsAdminView} />;
      case "attendance":
        return <TeamAttendanceTab teamId={teamId} isAdminView={effectiveIsAdminView} />;
      case "others":
        return <TeamOthersTab teamId={teamId} isAdminView={effectiveIsAdminView} />;
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconButton: {
    padding: 2,
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
  membersTabContent: {
    flex: 1,
  },
  // メンバータブ (管理者ビュー) の「メンバー / グループ」切替
  segment: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 9,
    padding: 2,
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 7,
  },
  segmentButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
  },
  segmentTextActive: {
    color: "#111827",
    fontWeight: "700",
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
