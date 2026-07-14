import type { NavigatorScreenParams } from "@react-navigation/native";

/**
 * ナビゲーションの型定義
 * React Navigationの型安全性を保証するための型定義
 */

// オンボーディングスタックのパラメータ型
export type OnboardingStackParamList = {
  OnboardingWizard: undefined;
};

// 認証スタックのパラメータ型
export type AuthStackParamList = {
  Welcome: undefined;
  GetStarted: undefined;
  LoginMethod: undefined;
  EmailLogin: undefined;
  EmailSignup: undefined;
  ResetPassword: undefined;
};

// タブナビゲーターのパラメータ型
export type TabParamList = {
  Dashboard: undefined;
  Practices: undefined;
  Competitions: undefined;
  Teams: undefined;
  MyPage: undefined;
};

// メインスタックのパラメータ型
export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;
  PracticeDetail: {
    practiceId: string;
  };
  PracticeForm: {
    practiceId?: string;
    date?: string;
    teamId?: string;
  };
  /** 練習タブ統合フォーム(個人フロー) */
  PracticeTabForm: {
    practiceId?: string;
    date?: string;
    teamId?: string;
    /** 初期タブ。省略時は "practice" */
    initialTab?: "practice" | "log";
  };
  PracticeLogForm: {
    practiceId: string;
    practiceLogId?: string;
    returnTo?: "dashboard";
    teamId?: string;
  };
  PracticeTimeForm: {
    practiceLogId?: string;
    setCount: number;
    repCount: number;
    initialTimes?: Array<{
      id: string;
      setNumber: number;
      repNumber: number;
      time: number;
    }>;
  };
  RecordDetail: {
    recordId: string;
  };
  RecordForm: {
    recordId?: string;
    date?: string;
    competitionId?: string;
  };
  CompetitionForm: {
    competitionId?: string;
    date: string;
    teamId?: string;
  };
  /** 大会タブ統合フォーム(個人フロー) */
  CompetitionTabForm: {
    competitionId?: string;
    date: string;
    teamId?: string;
    /** 初期タブ。省略時は "competition" */
    initialTab?: "competition" | "entry" | "record";
  };
  EntryForm: {
    competitionId: string;
    entryId?: string;
    date: string;
    teamId?: string;
  };
  RecordLogForm: {
    competitionId: string;
    recordId?: string;
    entryDataList?: Array<{
      styleId: number;
      styleName: string;
      entryTime?: number;
    }>;
    date: string;
    teamId?: string;
  };
  TeamRecordBulkForm: {
    competitionId: string;
    teamId: string;
  };
  TeamPracticeLogBulkForm: {
    practiceId: string;
    teamId: string;
  };
  TeamDetail: {
    teamId: string;
  };
  /** チーム練習・大会一括登録（管理者専用） */
  TeamBulkRegister: {
    teamId: string;
  };
  Settings: undefined;
  /** 練習ログテンプレート管理 */
  PracticeLogTemplates: undefined;
  BulkBestTime: undefined;
  Paywall: undefined;
};

// ルートナビゲーターのパラメータ型（認証状態に応じて切り替え）
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
};
