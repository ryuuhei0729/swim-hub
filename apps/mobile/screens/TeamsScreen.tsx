import React, { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { TeamCreateModal } from "@/components/teams/TeamCreateModal";
import { TeamJoinModal } from "@/components/teams/TeamJoinModal";
import { TeamDetailView } from "@/components/teams/TeamDetailView";
import { TeamSwitcherSheet } from "@/components/teams/TeamSwitcherSheet";
import { ErrorView } from "@/components/layout/ErrorView";
import { StaleDataBanner } from "@/components/layout/StaleDataBanner";
import { TeamSkeleton } from "@/components/ui/ScreenSkeletons";
import { PressableScale } from "@/components/ui/PressableScale";
import type { TabParamList } from "@/navigation/types";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useTeamViewHydrated } from "@/hooks/useTeamViewHydrated";
import { useTeamViewStore } from "@/stores/teamViewStore";
import { groupTeamMemberships, resolveSelectedTeam } from "@/utils/teamMembershipGroups";
import { Feather } from "@expo/vector-icons";

type Props = BottomTabScreenProps<TabParamList, "Teams">;

/** 切替シートを閉じ終えてから開くモーダル (iOS はモーダルを同時に2つ提示できない) */
type AfterSwitcherClose = "create" | "join" | null;

/**
 * チームタブ
 *
 * 一覧を挟まず、最後に開いたチームをそのまま表示する (TeamDetailView)。
 * 別のチームへはヘッダーのチーム名から開く切替シートで移り、作成・参加もそこから行う。
 * 所属が無いときだけ、中央に作成・参加の CTA を出す。
 *
 * 他画面から特定のチーム・タブを開くときは
 * `navigate("MainTabs", { screen: "Teams", params: { teamId, initialTab } })`。
 * 受け取った指定は表示状態ストアに書き込んでから params を消す
 * (同じ指定でもう一度来たときにも反応させるため)。
 */
export const TeamsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const afterSwitcherCloseRef = useRef<AfterSwitcherClose>(null);
  // この画面で脱退したチーム。一覧の再取得が失敗して古い一覧が残っていても、脱退したチームへ倒れないよう除く
  const [leftTeamIds, setLeftTeamIds] = useState<ReadonlySet<string>>(() => new Set());

  const hydrated = useTeamViewHydrated();
  const lastTeamId = useTeamViewStore((state) => state.lastTeamId);
  const selectTeam = useTeamViewStore((state) => state.selectTeam);
  const setTab = useTeamViewStore((state) => state.setTab);
  const setAdminView = useTeamViewStore((state) => state.setAdminView);

  // チーム一覧取得
  const {
    teams = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useTeamsQuery(supabase, {
    enableRealtime: false, // モバイルでは一旦無効化
  });

  // 承認済みチームと承認待ちチームを分ける
  const groups = useMemo(
    () => groupTeamMemberships(teams.filter((m) => !leftTeamIds.has(m.team_id))),
    [teams, leftTeamIds],
  );

  // 他画面からの指定を表示状態ストアへ移す。
  // 端末からの読み込み前に書くと、読み込み結果で上書きされて指定が消えるので待つ。
  // 描画前に反映させるため useLayoutEffect (前のチーム・タブが一瞬見えないように)
  const requestedTeamId = route.params?.teamId;
  const requestedTab = route.params?.initialTab;
  const requestedAsMember = route.params?.asMember === true;
  useLayoutEffect(() => {
    if (!hydrated || !requestedTeamId) return;
    selectTeam(requestedTeamId);
    if (requestedTab) setTab(requestedTeamId, requestedTab);
    if (requestedAsMember) setAdminView(requestedTeamId, false);
    navigation.setParams({ teamId: undefined, initialTab: undefined, asMember: undefined });
  }, [
    hydrated,
    requestedTeamId,
    requestedTab,
    requestedAsMember,
    selectTeam,
    setTab,
    setAdminView,
    navigation,
  ]);

  const selectedMembership = resolveSelectedTeam(groups, requestedTeamId ?? lastTeamId);
  const focusedTeamId = selectedMembership?.team_id;

  // タブに戻ってきたら、一覧と表示中のチームの情報 (メンバー・練習・大会・ランキング等、
  // teamKeys.detail 配下) を取り直す。チームはタブの中に出しっぱなしなので、
  // 開き直しによる再取得が起きない (他のメンバーの変更が反映されなくなる) ため
  const queryClient = useQueryClient();
  const refreshOnFocus = useCallback(() => {
    void refetch();
    if (focusedTeamId) {
      void queryClient.invalidateQueries({ queryKey: teamKeys.detail(focusedTeamId) });
    }
  }, [refetch, queryClient, focusedTeamId]);
  useRefreshOnFocus(refreshOnFocus);

  const handleSelectTeam = useCallback(
    (teamId: string) => {
      selectTeam(teamId);
      setIsSwitcherOpen(false);
    },
    [selectTeam],
  );

  const handleSwitcherClosed = useCallback(() => {
    const next = afterSwitcherCloseRef.current;
    afterSwitcherCloseRef.current = null;
    if (next === "create") setIsCreateModalOpen(true);
    if (next === "join") setIsJoinModalOpen(true);
  }, []);

  const openFromSwitcher = useCallback((next: Exclude<AfterSwitcherClose, null>) => {
    afterSwitcherCloseRef.current = next;
    setIsSwitcherOpen(false);
  }, []);

  // 作成・参加したチームを開く。一覧の再取得が終わる前に選ぶと、まだ一覧に無いため
  // 別のチームへ倒れて一瞬表示されるので、再取得の後に選ぶ
  const handleTeamAdded = useCallback(
    (teamId: string) => {
      // 脱退したチームに参加し直したときは、除外を解く
      setLeftTeamIds((prev) => {
        if (!prev.has(teamId)) return prev;
        const next = new Set(prev);
        next.delete(teamId);
        return next;
      });
      void refetch().finally(() => selectTeam(teamId));
    },
    [refetch, selectTeam],
  );

  const handleCreateSuccess = useCallback(
    (teamId: string) => {
      setIsCreateModalOpen(false);
      handleTeamAdded(teamId);
    },
    [handleTeamAdded],
  );

  const handleJoinSuccess = useCallback(
    (teamId: string) => {
      setIsJoinModalOpen(false);
      handleTeamAdded(teamId);
    },
    [handleTeamAdded],
  );

  // 脱退したら、そのチームを一覧から除いて残りのチームへ倒し、一覧を取り直す
  const handleLeftTeam = useCallback(
    (leftTeamId: string) => {
      setLeftTeamIds((prev) => new Set(prev).add(leftTeamId));
      if (useTeamViewStore.getState().lastTeamId === leftTeamId) selectTeam(null);
      void refetch();
    },
    [refetch, selectTeam],
  );

  // チーム設定画面 (TeamSettings) で脱退して戻ってきたとき。設定はチームタブの外の画面なので、
  // 脱退したチーム ID を params で受け取って同じ処理に流す
  const requestedLeftTeamId = route.params?.leftTeamId;
  useEffect(() => {
    if (!requestedLeftTeamId) return;
    handleLeftTeam(requestedLeftTeamId);
    navigation.setParams({ leftTeamId: undefined });
  }, [requestedLeftTeamId, handleLeftTeam, navigation]);

  // 再取得に失敗しても、前回取得したチーム一覧があれば全画面エラーにせず表示を続ける
  const hasCachedTeams = teams.length > 0;

  // エラー状態 (表示できるデータが無いときだけ全画面エラーにする)
  if (isError && error && !hasCachedTeams) {
    const errorMessage = toUserFacingMessage(error, t("teams.mobile.fetchListFailed"));
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ErrorView message={errorMessage} onRetry={() => refetch()} fullScreen />
      </SafeAreaView>
    );
  }

  // ローディング状態 (最後に開いたチームの読み込み前も、別のチームを一瞬出さないよう待つ)
  if ((isLoading && teams.length === 0) || !hydrated) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <TeamSkeleton />
      </SafeAreaView>
    );
  }

  const modals = (
    <>
      <TeamCreateModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
      <TeamJoinModal
        visible={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={handleJoinSuccess}
      />
    </>
  );

  if (!selectedMembership) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <StaleDataBanner visible={isError && hasCachedTeams} onRetry={() => refetch()} />
        <View style={styles.emptyContainer}>
          <Feather name="users" size={56} color="#93C5FD" />
          <Text style={[styles.emptyText, styles.emptyTextLarge]}>
            {t("teams.mobile.noTeams")}
          </Text>
          <Text style={styles.emptySubtext}>{t("teams.mobile.noTeamsSubtext")}</Text>
          <View style={styles.emptyActions}>
            <PressableScale
              style={[styles.actionButton, styles.createButton, styles.emptyActionButton]}
              onPress={() => setIsCreateModalOpen(true)}
              testID="teams-empty-cta-create"
            >
              <Text style={[styles.createButtonText, styles.emptyActionButtonText]}>
                {t("teams.mobile.createTeamAction")}
              </Text>
            </PressableScale>
            <PressableScale
              style={[styles.actionButton, styles.joinButton, styles.emptyActionButton]}
              onPress={() => setIsJoinModalOpen(true)}
              testID="teams-empty-cta-join"
            >
              <Text style={[styles.joinButtonText, styles.emptyActionButtonText]}>
                {t("teams.mobile.joinByInviteCodeAction")}
              </Text>
            </PressableScale>
          </View>
        </View>
        {modals}
      </SafeAreaView>
    );
  }

  const selectedTeamId = selectedMembership.team_id;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <TeamDetailView
        key={selectedTeamId}
        teamId={selectedTeamId}
        teamName={selectedMembership.teams?.name || t("teams.mobile.fallbackTeamName")}
        onOpenSwitcher={() => setIsSwitcherOpen(true)}
      />

      <TeamSwitcherSheet
        visible={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
        onClosed={handleSwitcherClosed}
        approvedTeams={groups.approvedTeams}
        pendingTeams={groups.pendingTeams}
        selectedTeamId={selectedTeamId}
        onSelect={handleSelectTeam}
        onCreate={() => openFromSwitcher("create")}
        onJoin={() => openFromSwitcher("join")}
      />
      {modals}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  createButton: {
    backgroundColor: "#2563EB",
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  joinButton: {
    backgroundColor: "#10B981",
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
  },
  emptyTextLarge: {
    fontSize: 22,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  emptyActions: {
    width: "100%",
    maxWidth: 360,
    gap: 12,
    marginTop: 24,
  },
  emptyActionButton: {
    // flexBasis:0 (flex:1由来) を打ち消し、ラベル折り返し時に高さを伸ばせるようにする
    flex: 0,
    minHeight: 52,
    borderRadius: 12,
    justifyContent: "center",
  },
  emptyActionButtonText: {
    fontSize: 17,
    fontWeight: "600",
  },
});
