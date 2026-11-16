import type { NavigatorScreenParams } from "@react-navigation/native";
import type { TeamTabType } from "@/components/teams/TeamTabs";
import type { RelayEventId } from "@apps/shared/utils/relayEvents";

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

/** 記録タブの中の切り替え (練習記録一覧 / 大会記録一覧) */
export type RecordsSegment = "practices" | "competitions";

// タブナビゲーターのパラメータ型
// iOS 標準のタブバーは 5 つまでしか並ばないため、練習と大会は Records (記録) タブの中で切り替える
export type TabParamList = {
  Dashboard: undefined;
  Records: { segment?: RecordsSegment } | undefined;
  /**
   * チームタブは最後に開いたチームを表示する。teamId / initialTab を渡すとそのチーム・タブを開く
   * (ホームの出欠未回答・カレンダーの出欠変更・プロフィールの所属チーム・大会保存後の戻り先)
   */
  Teams:
    | {
        teamId?: string;
        initialTab?: TeamTabType;
        /**
         * 自分の出欠に回答する導線 (ホームの出欠未回答・カレンダーの出欠変更) から開くときに true。
         * そのチームの管理者ビューを OFF にして開く (管理者ビューの出欠タブでは自分の回答ができないため)
         */
        asMember?: boolean;
        /**
         * チーム設定画面 (TeamSettings) で脱退したチーム ID。
         * チームタブはこのチームを一覧から外し、残りのチームへ切り替える
         */
        leftTeamId?: string;
      }
    | undefined;
  Goals: undefined;
  /** アカウントタブ (ルート名は旧称のまま。プロフィール + 設定の入口) */
  MyPage: undefined;
};

// メインスタックのパラメータ型
export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;
  PracticeForm: {
    practiceId?: string;
    date?: string;
    teamId?: string;
    /**
     * チーム管理者ビューの編集導線から来たことを示す。個人画面からは決して渡さない。
     * `teamId` の有無を代わりのシグナルに使ってはならない (Sprint Contract #PM-1)。
     */
    origin?: "teamAdmin";
  };
  /** 練習タブ統合フォーム(個人フロー) */
  PracticeTabForm: {
    practiceId?: string;
    date?: string;
    teamId?: string;
    /** 初期タブ。省略時は "practice" */
    initialTab?: "practice" | "log";
    /**
     * チーム管理者ビューの編集導線から来たことを示す。個人画面からは決して渡さない。
     * `teamId` の有無を代わりのシグナルに使ってはならない (Sprint Contract #PM-1)。
     */
    origin?: "teamAdmin";
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
  RecordForm: {
    recordId?: string;
    date?: string;
    competitionId?: string;
  };
  CompetitionForm: {
    competitionId?: string;
    date: string;
    teamId?: string;
    /**
     * チーム管理者ビューの編集導線から来たことを示す。個人画面からは決して渡さない。
     * `teamId` の有無を代わりのシグナルに使ってはならない。
     */
    origin?: "teamAdmin";
  };
  /** 大会タブ統合フォーム(個人フロー) */
  CompetitionTabForm: {
    competitionId?: string;
    date: string;
    teamId?: string;
    /** 初期タブ。省略時は "competition" */
    initialTab?: "competition" | "entry" | "record";
    /**
     * Sprint Contract D9: エントリータブの「項目」サブタブを、この entries.id を
     * 持つ行がアクティブな状態で開く。省略時・該当行が見つからない場合は先頭タブ
     * (index 0) を開く (既存呼び出し元の非退行のため optional)。
     */
    targetEntryId?: string;
    /**
     * チーム管理者ビューの編集導線から来たことを示す。個人画面からは決して渡さない。
     * `teamId` の有無を代わりのシグナルに使ってはならない。
     */
    origin?: "teamAdmin";
  };
  EntryForm: {
    competitionId: string;
    entryId?: string;
    date: string;
    teamId?: string;
  };
  /** チーム大会記録一覧（種目カードグリッド。管理者専用） */
  TeamRecordBulkForm: {
    competitionId: string;
    teamId: string;
  };
  /** チーム大会記録の種目詳細（代理入力。管理者専用）。styleId / relayEventId は排他 */
  TeamRecordBulkFormDetail: {
    competitionId: string;
    teamId: string;
    styleId?: number;
    relayEventId?: RelayEventId;
  };
  TeamPracticeLogBulkForm: {
    practiceId: string;
    teamId: string;
  };
  /** チーム大会エントリー一括代理入力（管理者専用） */
  TeamEntryBulkForm: {
    competitionId: string;
    teamId: string;
  };
  /** チーム練習・大会一括登録（管理者専用） */
  TeamBulkRegister: {
    teamId: string;
  };
  /** チーム設定 (チーム情報・招待コード・記録色・脱退)。チームタブのヘッダー ⚙ から開く */
  TeamSettings: {
    teamId: string;
  };
  /** チームのお知らせ一覧。チームタブのヘッダー 🔔 から開く (作成・編集は管理者ビューのみ) */
  TeamAnnouncements: {
    teamId: string;
  };
  /** チーム内ランキング。チームタブ「その他」から開く */
  TeamRankings: {
    teamId: string;
  };
  /** メンバーの目標 (管理者ビュー専用)。チームタブ「その他」から開く */
  TeamMemberGoals: {
    teamId: string;
  };
  /** アカウント > プラン */
  AccountPlan: undefined;
  /** アカウント > カレンダー (Google / iOS 連携・記録色) */
  AccountCalendar: undefined;
  /** アカウント > ログインとセキュリティ (メール・パスワード・ログイン連携・アカウント削除) */
  AccountSecurity: undefined;
  /** 練習ログテンプレート管理 */
  PracticeLogTemplates: undefined;
  GoalDetail: { goalId: string };
  /**
   * goalId あり = 編集、なし = 新規作成。
   * 新規作成のとき competitionId / styleId を渡すと、その大会・種目を選んだ状態で開く (ホームの次の大会から)
   */
  GoalForm: { goalId?: string; competitionId?: string; styleId?: number };
  /** milestoneId あり = 編集、なし = 新規作成 */
  MilestoneForm: { goalId: string; milestoneId?: string };
  Paywall: undefined;
};

// ルートナビゲーターのパラメータ型（認証状態に応じて切り替え）
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
};
