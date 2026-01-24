// =============================================================================
// シェアカード用型定義 - Swim Hub
// Instagram等のSNSシェア用カードの型定義
// =============================================================================

import type { SplitTime } from '@/types'

// 大会記録シェアカード用データ
export interface CompetitionShareData {
  // 基本情報
  competitionName: string
  date: string
  place: string
  poolType: 'short' | 'long' // 短水路 / 長水路

  // 種目・記録情報
  eventName: string // 例: "100m 自由形"
  raceDistance: number // 種目の距離（m）例: 100
  time: number // 秒単位
  rank?: number // 順位（オプション）

  // 詳細タイム
  reactionTime?: number // リアクションタイム
  splitTimes?: SplitTime[] // スプリットタイム

  // 自己ベスト関連
  isBestTime?: boolean
  previousBest?: number

  // ユーザー情報
  userName: string
  teamName?: string
}

// 練習メニューシェアカード用データ
export interface PracticeShareData {
  // 基本情報
  date: string
  title: string
  place?: string

  // メニュー詳細
  menuItems: PracticeMenuItem[]

  // サマリー
  totalDistance: number // 合計距離（m）
  totalSets: number // 合計セット数

  // ユーザー情報
  userName: string
  teamName?: string
}

// 練習メニュー項目
export interface PracticeMenuItem {
  style: string // 種目（Fr, Ba, Br, Fly, IM等）
  category: 'Swim' | 'Pull' | 'Kick'
  distance: number // 1本あたりの距離
  repCount: number // 本数
  setCount: number // セット数
  circle?: number // サークル（秒）
  times?: PracticeTimeItem[] // タイム一覧
  note?: string
}

// 練習タイム項目
export interface PracticeTimeItem {
  setNumber: number
  repNumber: number
  time: number // 秒単位
}

// シェアカードのテーマ
export type ShareCardTheme = 'default' | 'dark' | 'gradient'

// シェアカードのサイズ（Instagram用）
export interface ShareCardSize {
  width: number
  height: number
}

// Instagram Story用サイズ
export const INSTAGRAM_STORY_SIZE: ShareCardSize = {
  width: 1080,
  height: 1920,
}

// Instagram Post用サイズ（正方形）
export const INSTAGRAM_POST_SIZE: ShareCardSize = {
  width: 1080,
  height: 1080,
}
