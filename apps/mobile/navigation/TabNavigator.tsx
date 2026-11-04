import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { RecordsHubScreen } from "@/screens/RecordsHubScreen";
import { TeamsScreen } from "@/screens/TeamsScreen";
import { GoalsScreen } from "@/screens/GoalsScreen";
import { MyPageScreen } from "@/screens/MyPageScreen";
import {
  createTabNavigator,
  TabBarShell,
  tabNavigatorScreenLayout,
  tabNavigatorScreenOptions,
  tabScreenOptions,
} from "./tabBar";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery, usePendingMembersCountQuery } from "@apps/shared/hooks/queries/teams";
import { useUnansweredAttendancesQuery } from "@apps/shared/hooks/queries/notifications";
import { groupTeamMemberships } from "@/utils/teamMembershipGroups";
import { formatBadgeCount } from "@/utils/formatBadgeCount";

// 実機では tabBar.native.tsx (OS 標準のタブバー)、web とテストでは tabBar.tsx (JS 描画)
const Tab = createTabNavigator();

/**
 * タブナビゲーター
 * 認証済みユーザー向けのメイン画面遷移を管理
 * ホーム、記録 (練習/大会)、チーム、目標、マイページの5つのタブ
 * (iOS 標準のタブバーは 5 つまでしか並ばず、6 つ目以降は「その他」にまとめられてしまう)
 */
export const TabNavigator: React.FC = () => {
  const { t } = useTranslation();
  const { supabase, user } = useAuth();

  // DashboardScreen も同じ queryKey (teamKeys.list()) を購読済みのため dedupe され追加フェッチは発生しない
  const { teams } = useTeamsQuery(supabase, {
    enableRealtime: false,
  });

  // チームタブのバッジ = 出欠未回答の件数 + 自分が管理者のチームの承認待ちメンバー数。
  // 出欠未回答はホームの TeamAnnouncementsSection と同じ引数 (承認済みチームを一覧の順で) にして
  // queryKey を揃え、同じキャッシュを使う
  const { approvedTeams } = useMemo(() => groupTeamMemberships(teams), [teams]);
  const teamsForNotifications = useMemo(
    () =>
      approvedTeams.map((m) => ({
        team_id: m.team_id,
        team: m.teams ? { name: m.teams.name } : undefined,
      })),
    [approvedTeams],
  );
  const adminTeamIds = useMemo(
    () => approvedTeams.filter((m) => m.role === "admin").map((m) => m.team_id),
    [approvedTeams],
  );
  const { data: unansweredAttendances = [] } = useUnansweredAttendancesQuery(
    supabase,
    user?.id,
    teamsForNotifications,
  );
  const pendingMembersCount = usePendingMembersCountQuery(supabase, adminTeamIds);
  const teamsBadge = formatBadgeCount(unansweredAttendances.length + pendingMembersCount);

  return (
    <TabBarShell>
      <Tab.Navigator
        screenOptions={tabNavigatorScreenOptions}
        screenLayout={tabNavigatorScreenLayout}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.home"),
            testID: "tab-dashboard",
            feather: "home",
          })}
        />
        <Tab.Screen
          name="Records"
          component={RecordsHubScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.records"),
            testID: "tab-records",
            feather: "clipboard",
          })}
        />
        <Tab.Screen
          name="Teams"
          component={TeamsScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.teams"),
            testID: "tab-teams",
            feather: "users",
            badge: teamsBadge,
          })}
        />
        <Tab.Screen
          name="Goals"
          component={GoalsScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.goals"),
            testID: "tab-goals",
            feather: "target",
          })}
        />
        <Tab.Screen
          name="MyPage"
          component={MyPageScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.myPage"),
            testID: "tab-mypage",
            feather: "user",
          })}
        />
      </Tab.Navigator>
    </TabBarShell>
  );
};
