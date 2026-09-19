import React, { useState, useMemo, useLayoutEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { TeamSettingsTab } from "@/components/teams/TeamSettingsTab";
import { TeamAnnouncementList } from "@/components/teams/TeamAnnouncementList";
import { TeamAnnouncementForm } from "@/components/teams/TeamAnnouncementForm";
import { TeamPracticeList } from "@/components/teams/TeamPracticeList";
import { TeamCompetitionList } from "@/components/teams/TeamCompetitionList";
import { TeamRankings } from "@/components/teams/rankings";
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
  // 管理者ビュー/利用者ビューの状態は、ヘッダー右側の TeamDetailHeaderAdminToggle と
  // 共有購読するためストアで管理する（詳細は teamAdminViewStore.ts のコメント参照）
  const isAdminView = useTeamAdminViewStore((state) => state.isAdminView);
  const resetAdminView = useTeamAdminViewStore((state) => state.reset);
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
  // （詳細は teamAdminViewStore.ts のコメント参照）。
  // ⚠️ タイトル注入とは **effect を分ける**。同じ effect にまとめるとチーム名の
  // 取得時に headerRight が作り直されて再マウントし、スイッチが1回目のタップに
  // 反応しなくなる（TeamDetailHeaderAdminToggle の docstring にある「タップ2回問題」）
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: isCurrentUserAdmin ? () => <TeamDetailHeaderAdminToggle /> : undefined,
    });
  }, [navigation, isCurrentUserAdmin]);

  // ヘッダータイトルにチーム名を出す。未取得・エラー・承認待ちのときは既定の画面名に倒す
  // （name は NOT NULL だが空文字だと無題のヘッダーになるため `||` で弾く）。
  // ⚠️ headerTitle にコンポーネントを渡さないこと。Android で
  // backButtonInCustomView 経路に切り替わり戻るボタンの描画が回帰する。
  // 長いチーム名の省略記号はネイティブヘッダーが既定で描く
  useLayoutEffect(() => {
    navigation.setOptions({
      title: currentTeam?.name || t("navigation.mobile.titles.teamDetail"),
    });
  }, [navigation, currentTeam?.name, t]);

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
            onLeftTeam={() => navigation.navigate("MainTabs", { screen: "Teams" })}
            onTeamUpdated={() => refetch()}
          />
        );
      default:
        return null;
    }
  };

  // Android の Edge-to-Edge 強制下ではシステムナビゲーションバー(3ボタン)の領域まで
  // 描画される。この画面はタブごとに別コンポーネントが独自のスクロールビューを持つため、
  // 個々のスクロール余白ではなく画面ルートで下部インセットを消費する
  // (ネイティブ経路の SafeAreaView。タブが増えても自動的に保護されるようにするため)。
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* タブ（固定） */}
      <TeamTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isAdmin={effectiveIsAdminView}
        pendingCount={isCurrentUserAdmin ? pendingCount : 0}
      />

      {/* タブコンテンツ（スクロール可能） */}
      <View style={styles.tabContent}>{renderTabContent()}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
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
