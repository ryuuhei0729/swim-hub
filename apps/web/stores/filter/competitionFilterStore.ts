// =============================================================================
// 大会フィルター用Zustandストア
// =============================================================================

import { create } from 'zustand'

interface CompetitionFilterState {
  filterStyle: string
  includeRelay: boolean
  filterPoolType: string
}

interface CompetitionFilterActions {
  setFilterStyle: (style: string) => void
  setIncludeRelay: (include: boolean) => void
  setFilterPoolType: (poolType: string) => void
  reset: () => void
}

const initialState: CompetitionFilterState = {
  filterStyle: '',
  includeRelay: true,
  filterPoolType: '',
}

export const useCompetitionFilterStore = create<CompetitionFilterState & CompetitionFilterActions>()((set) => ({
  ...initialState,
  
  setFilterStyle: (style) => set({ filterStyle: style }),
  setIncludeRelay: (include) => set({ includeRelay: include }),
  setFilterPoolType: (poolType) => set({ filterPoolType: poolType }),
  reset: () => set(initialState),
}))

