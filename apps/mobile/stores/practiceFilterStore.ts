// =============================================================================
// 練習フィルター用Zustandストア（モバイル版）
// =============================================================================

import { create } from 'zustand'

interface PracticeFilterState {
  selectedTagIds: string[]
  showTagFilter: boolean
}

interface PracticeFilterActions {
  setSelectedTags: (tagIds: string[]) => void
  toggleTagFilter: () => void
  reset: () => void
}

const initialState: PracticeFilterState = {
  selectedTagIds: [],
  showTagFilter: false,
}

export const usePracticeFilterStore = create<PracticeFilterState & PracticeFilterActions>()((set) => ({
  ...initialState,
  
  setSelectedTags: (tagIds) => set({ selectedTagIds: tagIds }),
  toggleTagFilter: () => set((state) => ({ showTagFilter: !state.showTagFilter })),
  reset: () => set(initialState),
}))
