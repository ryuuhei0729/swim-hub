// =============================================================================
// カレンダー関連型定義 - Swim Hub
// カレンダーイベント型の定義
// =============================================================================

import type { Competition } from './competition'
import type { Practice } from './practice'

// =============================================================================
// 1. イベント型定義
// =============================================================================

// 練習イベント
export interface PracticeEvent extends Practice {
  type: 'practice'
}

// 大会イベント
export interface CompetitionEvent extends Competition {
  type: 'competition'
}

// チームイベント（ユニオン型）
export type TeamEvent = PracticeEvent | CompetitionEvent
