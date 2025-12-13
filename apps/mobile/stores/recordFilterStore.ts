// =============================================================================
// 大会記録フィルター用Zustandストア（モバイル版）
// =============================================================================

import { create } from 'zustand'

interface RecordFilterState {
  // フィルター条件
  filterStyleId: number | null
  filterFiscalYear: string
  filterPoolType: number | null // 0: 短水路, 1: 長水路
  
  // ソート設定
  sortBy: 'date' | 'time'
  sortOrder: 'asc' | 'desc'
}

interface RecordFilterActions {
  // フィルター操作
  setFilterStyleId: (styleId: number | null) => void
  setFilterFiscalYear: (fiscalYear: string) => void
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
  setFilterFiscalYear: (fiscalYear) => set({ filterFiscalYear: fiscalYear }),
  setFilterPoolType: (poolType) => set({ filterPoolType: poolType }),
  
  // ソート操作
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
  
  // リセット
  reset: () => set(initialState),
}))
