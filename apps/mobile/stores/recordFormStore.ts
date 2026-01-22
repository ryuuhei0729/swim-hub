// =============================================================================
// 大会記録フォーム用Zustandストア（モバイル版）
// =============================================================================

import type { RecordWithDetails } from '@swim-hub/shared/types'
import { create } from 'zustand'

interface SplitTimeForm {
  distance: number
  splitTime: number // 秒数
  id?: string // 編集時のみ（既存のSplitTimeのID）
}

interface RecordFormState {
  // フォームデータ
  competitionId: string | null
  styleId: number | null
  time: number | null // 秒数
  reactionTime: number | null // 反応時間（秒）
  note: string | null
  splitTimes: SplitTimeForm[]
  
  // UI状態
  isLoading: boolean
  errors: {
    competitionId?: string
    styleId?: string
    time?: string
    reactionTime?: string
    splitTimes?: string
  }
}

interface RecordFormActions {
  // データ操作
  setCompetitionId: (competitionId: string | null) => void
  setStyleId: (styleId: number | null) => void
  setTime: (time: number | null) => void
  setReactionTime: (reactionTime: number | null) => void
  setNote: (note: string | null) => void
  setSplitTimes: (splitTimes: SplitTimeForm[]) => void
  addSplitTime: (splitTime: SplitTimeForm) => void
  removeSplitTime: (index: number) => void
  updateSplitTime: (index: number, splitTime: Partial<SplitTimeForm>) => void
  setLoading: (loading: boolean) => void
  setError: (field: keyof RecordFormState['errors'], message?: string) => void
  clearErrors: () => void
  
  // 初期化
  initialize: (record?: RecordWithDetails) => void
  reset: () => void
}

const initialState: RecordFormState = {
  competitionId: null,
  styleId: null,
  time: null,
  reactionTime: null,
  note: null,
  splitTimes: [],
  isLoading: false,
  errors: {},
}

export const useRecordFormStore = create<RecordFormState & RecordFormActions>()((set) => ({
  ...initialState,
  
  // データ操作
  setCompetitionId: (competitionId) => set({ competitionId }),
  setStyleId: (styleId) => set({ styleId }),
  setTime: (time) => set({ time }),
  setReactionTime: (reactionTime) => set({ reactionTime }),
  setNote: (note) => set({ note }),
  setSplitTimes: (splitTimes) => set({ splitTimes }),
  addSplitTime: (splitTime) => set((state) => ({
    splitTimes: [...state.splitTimes, splitTime],
  })),
  removeSplitTime: (index) => set((state) => ({
    splitTimes: state.splitTimes.filter((_, i) => i !== index),
  })),
  updateSplitTime: (index, updates) => set((state) => ({
    splitTimes: state.splitTimes.map((st, i) =>
      i === index ? { ...st, ...updates } : st
    ),
  })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (field, message) => set((state) => ({
    errors: {
      ...state.errors,
      [field]: message,
    },
  })),
  clearErrors: () => set({ errors: {} }),
  
  // 初期化
  initialize: (record) => {
    if (record) {
      // 編集モード: 既存データで初期化
      set({
        competitionId: record.competition_id || null,
        styleId: record.style_id,
        time: record.time,
        reactionTime: record.reaction_time || null,
        note: record.note || null,
        splitTimes: (record.split_times || []).map((st) => ({
          distance: st.distance,
          splitTime: st.split_time,
          id: st.id,
        })),
        errors: {},
      })
    } else {
      // 作成モード: 空のフォームで初期化
      set({
        ...initialState,
      })
    }
  },
  
  // リセット
  reset: () => set(initialState),
}))
