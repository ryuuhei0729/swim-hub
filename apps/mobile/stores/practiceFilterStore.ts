// =============================================================================
// 練習フィルター用Zustandストア（モバイル版）
// =============================================================================

import { create } from "zustand";

interface PracticeFilterState {
  selectedTagIds: string[];
}

interface PracticeFilterActions {
  setSelectedTags: (tagIds: string[]) => void;
  reset: () => void;
}

const initialState: PracticeFilterState = {
  selectedTagIds: [],
};

export const usePracticeFilterStore = create<PracticeFilterState & PracticeFilterActions>()(
  (set) => ({
    ...initialState,

    setSelectedTags: (tagIds) => set({ selectedTagIds: tagIds }),
    reset: () => set(initialState),
  }),
);
