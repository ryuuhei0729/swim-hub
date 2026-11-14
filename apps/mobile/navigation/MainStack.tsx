import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { MainStackParamList } from "./types";
import { TabNavigator } from "./TabNavigator";
import { PracticeFormScreen } from "@/screens/PracticeFormScreen";
import { PracticeLogFormScreen } from "@/screens/PracticeLogFormScreen";
import { PracticeTabFormScreen } from "@/screens/PracticeTabFormScreen";
import { PracticeTimeFormScreen } from "@/screens/PracticeTimeFormScreen";
import { RecordFormScreen } from "@/screens/RecordFormScreen";
import { CompetitionBasicFormScreen } from "@/screens/CompetitionBasicFormScreen";
import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";
import { EntryLogFormScreen } from "@/screens/EntryLogFormScreen";
import { TeamRecordStyleListScreen } from "@/screens/TeamRecordStyleListScreen";
import { TeamRecordStyleDetailScreen } from "@/screens/TeamRecordStyleDetailScreen";
import { TeamPracticeLogBulkFormScreen } from "@/screens/TeamPracticeLogBulkFormScreen";
import { TeamEntryBulkFormScreen } from "@/screens/TeamEntryBulkFormScreen";
import { TeamBulkRegisterScreen } from "@/screens/TeamBulkRegisterScreen";
import { TeamSettingsScreen } from "@/screens/TeamSettingsScreen";
import { TeamAnnouncementsScreen } from "@/screens/TeamAnnouncementsScreen";
import { TeamRankingsScreen } from "@/screens/TeamRankingsScreen";
import { TeamMemberGoalsScreen } from "@/screens/TeamMemberGoalsScreen";
import { AccountPlanScreen } from "@/screens/AccountPlanScreen";
import { AccountCalendarScreen } from "@/screens/AccountCalendarScreen";
import { AccountSecurityScreen } from "@/screens/AccountSecurityScreen";
import { PracticeLogTemplatesScreen } from "@/screens/PracticeLogTemplatesScreen";
import { PaywallScreen } from "@/screens/PaywallScreen";
import { GoalDetailScreen } from "@/screens/GoalDetailScreen";
import { GoalFormScreen } from "@/screens/GoalFormScreen";
import { MilestoneFormScreen } from "@/screens/MilestoneFormScreen";

const Stack = createNativeStackNavigator<MainStackParamList>();

/**
 * メインのスタックナビゲーター
 * 認証済みユーザー向けの画面遷移を管理
 * タブナビゲーターを含む
 */
export const MainStack: React.FC = () => {
  const { t } = useTranslation();
  const baseHeaderOptions = {
    headerShown: true,
    headerBackTitle: t("common.back"),
    headerStyle: { backgroundColor: "#FFFFFF" },
    headerTintColor: "#111827",
    headerTitleStyle: { fontWeight: "600" as const },
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "#F1F5F9", // constants/theme.ts の colors.background と同じ
        },
      }}
    >
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen
        name="PracticeForm"
        component={PracticeFormScreen}
        options={({ route }) => ({
          ...baseHeaderOptions,
          title: route.params?.practiceId
            ? t("navigation.mobile.titles.practiceEdit")
            : t("navigation.mobile.titles.practiceCreate"),
        })}
      />
      <Stack.Screen
        name="PracticeTabForm"
        component={PracticeTabFormScreen}
        options={({ route }) => ({
          ...baseHeaderOptions,
          title: route.params?.practiceId
            ? t("navigation.mobile.titles.practiceEdit")
            : t("navigation.mobile.titles.practiceCreate"),
        })}
      />
      <Stack.Screen
        name="PracticeLogForm"
        component={PracticeLogFormScreen}
        options={({ route }) => ({
          ...baseHeaderOptions,
          title:
            route.params?.practiceLogId !== undefined
              ? t("navigation.mobile.titles.practiceLogEdit")
              : t("navigation.mobile.titles.practiceLogCreate"),
        })}
      />
      <Stack.Screen
        name="PracticeTimeForm"
        component={PracticeTimeFormScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.practiceTimeInput"),
        }}
      />
      <Stack.Screen
        name="RecordForm"
        component={RecordFormScreen}
        options={({ route }) => ({
          ...baseHeaderOptions,
          title: route.params?.recordId
            ? t("navigation.mobile.titles.recordEdit")
            : t("navigation.mobile.titles.recordCreate"),
        })}
      />
      <Stack.Screen
        name="CompetitionForm"
        component={CompetitionBasicFormScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.competitionInfo"),
        }}
      />
      <Stack.Screen
        name="CompetitionTabForm"
        component={CompetitionTabFormScreen}
        options={({ route }) => ({
          ...baseHeaderOptions,
          title: route.params?.competitionId
            ? t("navigation.mobile.titles.competitionInfo")
            : t("navigation.mobile.titles.competitionInfo"),
        })}
      />
      <Stack.Screen
        name="EntryForm"
        component={EntryLogFormScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.entryRegister"),
        }}
      />
      <Stack.Screen
        name="TeamRecordBulkForm"
        component={TeamRecordStyleListScreen}
        options={{
          ...baseHeaderOptions,
          title: t("teams.recordList.pageTitle"),
        }}
      />
      <Stack.Screen
        name="TeamRecordBulkFormDetail"
        component={TeamRecordStyleDetailScreen}
        options={{
          ...baseHeaderOptions,
          title: t("teams.record.pageTitle"),
        }}
      />
      <Stack.Screen
        name="TeamPracticeLogBulkForm"
        component={TeamPracticeLogBulkFormScreen}
        options={{
          ...baseHeaderOptions,
          title: t("teamsAdmin.practiceLog.pageTitle"),
        }}
      />
      <Stack.Screen
        name="TeamEntryBulkForm"
        component={TeamEntryBulkFormScreen}
        options={{
          ...baseHeaderOptions,
          title: t("teams.mobile.entryBulk.pageTitle"),
        }}
      />
      <Stack.Screen
        name="TeamBulkRegister"
        component={TeamBulkRegisterScreen}
        options={{
          ...baseHeaderOptions,
          title: t("teamsAdmin.tabs.bulkRegister"),
        }}
      />
      <Stack.Screen
        name="TeamSettings"
        component={TeamSettingsScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.teamSettings"),
        }}
      />
      <Stack.Screen
        name="TeamAnnouncements"
        component={TeamAnnouncementsScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.teamAnnouncements"),
        }}
      />
      <Stack.Screen
        name="TeamRankings"
        component={TeamRankingsScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.teamRankings"),
        }}
      />
      <Stack.Screen
        name="TeamMemberGoals"
        component={TeamMemberGoalsScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.teamMemberGoals"),
        }}
      />
      <Stack.Screen
        name="AccountPlan"
        component={AccountPlanScreen}
        options={{
          ...baseHeaderOptions,
          title: t("account.mobile.rows.plan"),
        }}
      />
      <Stack.Screen
        name="AccountCalendar"
        component={AccountCalendarScreen}
        options={{
          ...baseHeaderOptions,
          title: t("account.mobile.rows.calendar"),
        }}
      />
      <Stack.Screen
        name="AccountSecurity"
        component={AccountSecurityScreen}
        options={{
          ...baseHeaderOptions,
          title: t("account.mobile.rows.security"),
        }}
      />
      <Stack.Screen
        name="PracticeLogTemplates"
        component={PracticeLogTemplatesScreen}
        options={{
          ...baseHeaderOptions,
          title: t("practiceLogTemplates.page.title"),
        }}
      />
      <Stack.Screen
        name="GoalDetail"
        component={GoalDetailScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.goalDetail"),
        }}
      />
      <Stack.Screen
        name="GoalForm"
        component={GoalFormScreen}
        options={({ route }) => ({
          ...baseHeaderOptions,
          title: route.params?.goalId ? t("goals.edit.title") : t("goals.create.title"),
        })}
      />
      <Stack.Screen
        name="MilestoneForm"
        component={MilestoneFormScreen}
        options={({ route }) => ({
          ...baseHeaderOptions,
          title: route.params?.milestoneId
            ? t("goals.milestoneEdit.title")
            : t("goals.milestoneCreate.title"),
        })}
      />
      <Stack.Screen
        name="Paywall"
        component={PaywallScreen}
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
    </Stack.Navigator>
  );
};
