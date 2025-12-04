// =============================================================================
// Practice Page用の練習記録フォームZustandストア
// =============================================================================

import { create } from 'zustand'
import type { Style, PracticeTag, PracticeLog, PracticeTime } from '@apps/shared/types/database'

// Practice Page専用の型定義
export type PracticeLogWithFormattedData = PracticeLog & {
  tags: PracticeTag[]
  practice: {
    id: string
    date: string
    place: string | null
    note: string | null
  }
  practiceId: string
  practice_times?: PracticeTime[]
}

export type PracticePageEditingData = {
  id: string
  practiceId: string
  date: string
  title?: string
  place: string
  note: string
  style: string
  rep_count: number
  set_count: number
  distance: number
  circle: number | null
  times: Array<{
    setNumber: number
    repNumber: number
    time: number
  }>
  tags: PracticeTag[]
}

interface PracticeRecordState {
  // フォーム状態
  isFormOpen: boolean
  selectedDate: Date | null
  editingLog: PracticeLogWithFormattedData | null
  isLoading: boolean
  editingItem: {
    id: string
    item_type: string
    item_date?: string
  } | null
  editingData: PracticePageEditingData | null
  
  // タイムモーダル
  showTimeModal: boolean
  selectedPracticeForTime: {
    id: string
    place?: string | null
  } | null
  
  // マスターデータ
  styles: Style[]
  tags: PracticeTag[]
}

interface PracticeRecordActions {
  // フォーム操作
  openForm: (date?: Date) => void
  closeForm: () => void
  setSelectedDate: (date: Date | null) => void
  setEditingLog: (log: PracticeLogWithFormattedData | null) => void
  setEditingItem: (item: {
    id: string
    item_type: string
    item_date?: string
  } | null) => void
  setEditingData: (data: PracticePageEditingData | null) => void
  
  // タイムモーダル
  openTimeModal: (practice: { id: string; place?: string | null }) => void
  closeTimeModal: () => void
  
  // マスターデータ
  setStyles: (styles: Style[]) => void
  setTags: (tags: PracticeTag[]) => void
  
  // UI状態
  setLoading: (loading: boolean) => void
  
  // リセット
  reset: () => void
}

const initialState: PracticeRecordState = {
  isFormOpen: false,
  selectedDate: null,
  editingLog: null,
  isLoading: false,
  editingItem: null,
  editingData: null,
  showTimeModal: false,
  selectedPracticeForTime: null,
  styles: [],
  tags: [],
}

export const usePracticeRecordStore = create<PracticeRecordState & PracticeRecordActions>()((set) => ({
  ...initialState,
  
  // フォーム操作
  openForm: (date) => set({
    isFormOpen: true,
    selectedDate: date || null,
  }),
  
  closeForm: () => set({
    isFormOpen: false,
    selectedDate: null,
    editingLog: null,
    editingItem: null,
    editingData: null,
  }),
  
  setSelectedDate: (date) => set({ selectedDate: date }),
  setEditingLog: (log) => set({ editingLog: log }),
  setEditingItem: (item) => set({ editingItem: item }),
  setEditingData: (data) => set({ editingData: data }),
  
  // タイムモーダル
  openTimeModal: (practice) => set({
    selectedPracticeForTime: practice,
    showTimeModal: true,
  }),
  
  closeTimeModal: () => set({
    selectedPracticeForTime: null,
    showTimeModal: false,
  }),
  
  // マスターデータ
  setStyles: (styles) => set({ styles }),
  setTags: (tags) => set({ tags }),
  
  // UI状態
  setLoading: (loading) => set({ isLoading: loading }),
  
  // リセット
  reset: () => set(initialState),
}))

