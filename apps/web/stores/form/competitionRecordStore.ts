// =============================================================================
// Competition Page用の大会記録フォームZustandストア
// =============================================================================

import { create } from 'zustand'
import type { Record, Style } from '@apps/shared/types/database'

// Competition Page専用の型定義
export type RecordFormEdit = {
  id?: string
  recordDate: string
  location: string
  competitionName: string
  poolType: number
  styleId: string
  time: number
  isRelaying: boolean
  splitTimes: Array<{ distance: number; splitTime: number }>
  videoUrl?: string
  note?: string
}

interface CompetitionRecordState {
  // フォーム状態
  isFormOpen: boolean
  isLoading: boolean
  editingData: Record | RecordFormEdit | null
  selectedRecord: Record | null
  showDetailModal: boolean
  styles: Style[]
}

interface CompetitionRecordActions {
  // フォーム操作
  openForm: (data?: Record | RecordFormEdit) => void
  closeForm: () => void
  setEditingData: (data: Record | RecordFormEdit | null) => void
  
  // 詳細モーダル
  openDetailModal: (record: Record) => void
  closeDetailModal: () => void
  
  // マスターデータ
  setStyles: (styles: Style[]) => void
  
  // UI状態
  setLoading: (loading: boolean) => void
  
  // リセット
  reset: () => void
}

const initialState: CompetitionRecordState = {
  isFormOpen: false,
  isLoading: false,
  editingData: null,
  selectedRecord: null,
  showDetailModal: false,
  styles: [],
}

export const useCompetitionRecordStore = create<CompetitionRecordState & CompetitionRecordActions>()((set) => ({
  ...initialState,
  
  // フォーム操作
  openForm: (data) => set({
    isFormOpen: true,
    editingData: data || null,
  }),
  
  closeForm: () => set({
    isFormOpen: false,
    editingData: null,
  }),
  
  setEditingData: (data) => set({ editingData: data }),
  
  // 詳細モーダル
  openDetailModal: (record) => set({
    selectedRecord: record,
    showDetailModal: true,
  }),
  
  closeDetailModal: () => set({
    selectedRecord: null,
    showDetailModal: false,
  }),
  
  // マスターデータ
  setStyles: (styles) => set({ styles }),
  
  // UI状態
  setLoading: (loading) => set({ isLoading: loading }),
  
  // リセット
  reset: () => set(initialState),
}))

