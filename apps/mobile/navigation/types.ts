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
  }
}

// ルートナビゲーターのパラメータ型（認証状態に応じて切り替え）
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  Main: NavigatorScreenParams<MainStackParamList>
}
