import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { MainStackParamList } from "./types";
import { TabNavigator } from "./TabNavigator";
import { PracticeDetailScreen } from "@/screens/PracticeDetailScreen";
import { PracticeFormScreen } from "@/screens/PracticeFormScreen";
import { PracticeLogFormScreen } from "@/screens/PracticeLogFormScreen";
import { PracticeTabFormScreen } from "@/screens/PracticeTabFormScreen";
import { PracticeTimeFormScreen } from "@/screens/PracticeTimeFormScreen";
import { RecordDetailScreen } from "@/screens/RecordDetailScreen";
import { RecordFormScreen } from "@/screens/RecordFormScreen";
import { CompetitionBasicFormScreen } from "@/screens/CompetitionBasicFormScreen";
import { CompetitionTabFormScreen } from "@/screens/CompetitionTabFormScreen";
import { EntryLogFormScreen } from "@/screens/EntryLogFormScreen";
import { RecordLogFormScreen } from "@/screens/RecordLogFormScreen";
import { TeamRecordBulkFormScreen } from "@/screens/TeamRecordBulkFormScreen";
import { TeamPracticeLogBulkFormScreen } from "@/screens/TeamPracticeLogBulkFormScreen";
import { TeamDetailScreen } from "@/screens/TeamDetailScreen";
import { TeamBulkRegisterScreen } from "@/screens/TeamBulkRegisterScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { BulkBestTimeScreen } from "@/screens/BulkBestTimeScreen";
import { PaywallScreen } from "@/screens/PaywallScreen";

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
          backgroundColor: "#EFF6FF",
        },
      }}
    >
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen
        name="PracticeDetail"
        component={PracticeDetailScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.practiceDetail"),
        }}
      />
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
        name="RecordDetail"
        component={RecordDetailScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.recordDetail"),
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
        name="RecordLogForm"
        component={RecordLogFormScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.recordInput"),
        }}
      />
      <Stack.Screen
        name="TeamRecordBulkForm"
        component={TeamRecordBulkFormScreen}
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
        name="TeamDetail"
        component={TeamDetailScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.teamDetail"),
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
        name="Settings"
        component={SettingsScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.settings"),
        }}
      />
      <Stack.Screen
        name="BulkBestTime"
        component={BulkBestTimeScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.bulkBestTime"),
        }}
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
