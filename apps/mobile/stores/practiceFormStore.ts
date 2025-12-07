// =============================================================================
// 練習記録フォーム用Zustandストア（モバイル版）
// =============================================================================

import type { Practice } from '@swim-hub/shared/types/database'
import { create } from 'zustand'

interface PracticeFormState {
  // フォームデータ
  date: string
  title: string | null
  place: string | null
  note: string | null
  
  // UI状態
  isLoading: boolean
  errors: {
    date?: string
    title?: string
    place?: string
    note?: string
  }
}

interface PracticeFormActions {
  // データ操作
  setDate: (date: string) => void
  setTitle: (title: string | null) => void
  setPlace: (place: string | null) => void
  setNote: (note: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (field: keyof PracticeFormState['errors'], message?: string) => void
  clearErrors: () => void
  
  // 初期化
  initialize: (practice?: Practice) => void
  reset: () => void
}

const initialState: PracticeFormState = {
  date: new Date().toISOString().split('T')[0], // 今日の日付
  title: null,
  place: null,
  note: null,
  isLoading: false,
  errors: {},
}

export const usePracticeFormStore = create<PracticeFormState & PracticeFormActions>()((set) => ({
  ...initialState,
  
  // データ操作
  setDate: (date) => set({ date }),
  setTitle: (title) => set({ title }),
  setPlace: (place) => set({ place }),
  setNote: (note) => set({ note }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (field, message) => set((state) => ({
    errors: {
      ...state.errors,
      [field]: message,
    },
  })),
  clearErrors: () => set({ errors: {} }),
  
  // 初期化
  initialize: (practice) => {
    if (practice) {
      // 編集モード: 既存データで初期化
      set({
        date: practice.date,
        title: practice.title || null,
        place: practice.place || null,
        note: practice.note || null,
        errors: {},
      })
    } else {
      // 作成モード: 空のフォームで初期化
      set({
        ...initialState,
        date: new Date().toISOString().split('T')[0],
      })
    }
  },
  
  // リセット
  reset: () => set(initialState),
}))
