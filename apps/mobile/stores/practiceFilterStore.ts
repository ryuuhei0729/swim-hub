// =============================================================================
// 練習フィルター用Zustandストア（モバイル版）
// =============================================================================

import { create } from "zustand";
import type { PracticeSortColumn, PracticeSortOrder } from "@/utils/practiceLogFilter";

interface PracticeFilterState {
  selectedTagIds: string[];
  filterPlaces: string[];
  /** "" = すべて */
  filterStyle: string;
  sortColumn: PracticeSortColumn;
  sortOrder: PracticeSortOrder;
}

interface PracticeFilterActions {
  setSelectedTags: (tagIds: string[]) => void;
  setFilterPlaces: (places: string[]) => void;
  setFilterStyle: (style: string) => void;
  setSortColumn: (column: PracticeSortColumn) => void;
  setSortOrder: (order: PracticeSortOrder) => void;
  reset: () => void;
}

const initialState: PracticeFilterState = {
  selectedTagIds: [],
  filterPlaces: [],
  filterStyle: "",
  sortColumn: null,
  sortOrder: "desc",
};

export const usePracticeFilterStore = create<PracticeFilterState & PracticeFilterActions>()(
  (set) => ({
    ...initialState,

    setSelectedTags: (tagIds) => set({ selectedTagIds: tagIds }),
    setFilterPlaces: (places) => set({ filterPlaces: places }),
    setFilterStyle: (style) => set({ filterStyle: style }),
    setSortColumn: (column) => set({ sortColumn: column }),
    setSortOrder: (order) => set({ sortOrder: order }),
    reset: () => set(initialState),
  }),
);
