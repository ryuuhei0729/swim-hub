// =============================================================================
// 大会記録フィルター用Zustandストア（モバイル版）
// =============================================================================

import { create } from 'zustand'

interface RecordFilterState {
  // フィルター状態
  filterStyleId: number | null // 種目ID（nullの場合は全種目）
  filterFiscalYear: string // 年度フィルター（例: "2024"、空文字の場合は全年度）
  filterPoolType: number | null // プールタイプ（0: 短水路, 1: 長水路、nullの場合は全プールタイプ）
  
  // ソート状態
  sortBy: 'date' | 'time' // ソート基準（日付またはタイム）
  sortOrder: 'asc' | 'desc' // ソート順（昇順または降順）
}

interface RecordFilterActions {
  // フィルター操作
  setFilterStyleId: (styleId: number | null) => void
  setFilterFiscalYear: (year: string) => void
  setFilterPoolType: (poolType: number | null) => void
  
  // ソート操作
  setSortBy: (sortBy: 'date' | 'time') => void
  setSortOrder: (sortOrder: 'asc' | 'desc') => void
  
  // リセット
  reset: () => void
}

const initialState: RecordFilterState = {
  filterStyleId: null,
  filterFiscalYear: '',
  filterPoolType: null,
  sortBy: 'date',
  sortOrder: 'desc',
}

export const useRecordFilterStore = create<RecordFilterState & RecordFilterActions>()((set) => ({
  ...initialState,
  
  // フィルター操作
  setFilterStyleId: (styleId) => set({ filterStyleId: styleId }),
  setFilterFiscalYear: (year) => set({ filterFiscalYear: year }),
  setFilterPoolType: (poolType) => set({ filterPoolType: poolType }),
  
  // ソート操作
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  
  // リセット
  reset: () => set(initialState),
}))
