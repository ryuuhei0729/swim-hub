import type { NavigatorScreenParams } from '@react-navigation/native'

/**
 * ナビゲーションの型定義
 * React Navigationの型安全性を保証するための型定義
 */

// 認証スタックのパラメータ型
export type AuthStackParamList = {
  Login: undefined
  SignUp: undefined
  ResetPassword: undefined
}

// タブナビゲーターのパラメータ型
export type TabParamList = {
  Dashboard: undefined
  Practices: undefined
  Competitions: undefined
  Teams: undefined
  MyPage: undefined
}

// メインスタックのパラメータ型
export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>
  PracticeDetail: {
    practiceId: string
  }
  PracticeForm: {
    practiceId?: string
    date?: string
  }
  PracticeLogForm: {
    practiceId: string
    practiceLogId?: string
    returnTo?: 'dashboard'
  }
  PracticeTimeForm: {
    practiceLogId?: string
    setCount: number
    repCount: number
    initialTimes?: Array<{
      id: string
      setNumber: number
      repNumber: number
      time: number
    }>
  }
  RecordDetail: {
    recordId: string
  }
  RecordForm: {
    recordId?: string
    date?: string
    competitionId?: string
  }
  CompetitionForm: {
    competitionId?: string
    date: string
  }
  EntryForm: {
    competitionId: string
    entryId?: string
    date: string
  }
  RecordLogForm: {
    competitionId: string
    recordId?: string
    entryDataList?: Array<{
      styleId: number
      styleName: string
      entryTime?: number
    }>
    date: string
  }
  TeamDetail: {
    teamId: string
  }
}

// ルートナビゲーターのパラメータ型（認証状態に応じて切り替え）
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  Main: NavigatorScreenParams<MainStackParamList>
}
