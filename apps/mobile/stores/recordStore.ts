// =============================================================================
// 大会記録用統合Zustandストア (Form + Filter) - モバイル版
// =============================================================================

import type { RecordWithDetails } from "@swim-hub/shared/types";
import { create } from "zustand";
import type { RecordRelayFilterMode, RecordSortBy, RecordSortOrder } from "@/utils/recordFilter";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SplitTimeForm {
  distance: number | string;
  splitTime: number; // 秒数
  id?: string; // 編集時のみ（既存のSplitTimeのID）
}

interface RecordFormState {
  // フォームデータ
  competitionId: string | null;
  styleId: number | null;
  time: number | null; // 秒数
  reactionTime: number | null; // 反応時間（秒）
  /** リレー区分 (true = 引き継ぎタイム)。記録の is_relaying に対応 */
  isRelaying: boolean;
  note: string | null;
  splitTimes: SplitTimeForm[];

  // UI状態
  isLoading: boolean;
  errors: {
    competitionId?: string;
    styleId?: string;
    time?: string;
    reactionTime?: string;
    splitTimes?: string;
  };
}

interface RecordFilterState {
  // フィルター条件(グループ間 AND・グループ内 OR。ボトムシートでドラフト編集→適用でコミットされる)
  filterDistances: string[];
  filterStyles: string[];
  filterCompetitionNames: string[];
  filterPlaces: string[];
  /** "" = すべて, "short" | "long" */
  filterPoolType: string;
  filterRelayMode: RecordRelayFilterMode;

  // ソート設定
  sortBy: RecordSortBy;
  sortOrder: RecordSortOrder;
}

interface RecordFormActions {
  // データ操作
  setCompetitionId: (competitionId: string | null) => void;
  setStyleId: (styleId: number | null) => void;
  setTime: (time: number | null) => void;
  setReactionTime: (reactionTime: number | null) => void;
  setIsRelaying: (isRelaying: boolean) => void;
  setNote: (note: string | null) => void;
  setSplitTimes: (splitTimes: SplitTimeForm[]) => void;
  addSplitTime: (splitTime: SplitTimeForm) => void;
  removeSplitTime: (index: number) => void;
  updateSplitTime: (index: number, splitTime: Partial<SplitTimeForm>) => void;
  setLoading: (loading: boolean) => void;
  setError: (field: keyof RecordFormState["errors"], message?: string) => void;
  clearErrors: () => void;

  // 初期化
  initialize: (record?: RecordWithDetails) => void;
  resetForm: () => void;
}

interface RecordFilterActions {
  // フィルター操作
  setFilterDistances: (distances: string[]) => void;
  setFilterStyles: (styles: string[]) => void;
  setFilterCompetitionNames: (names: string[]) => void;
  setFilterPlaces: (places: string[]) => void;
  setFilterPoolType: (poolType: string) => void;
  setFilterRelayMode: (mode: RecordRelayFilterMode) => void;

  // ソート操作
  setSortBy: (sortBy: RecordSortBy) => void;
  setSortOrder: (sortOrder: RecordSortOrder) => void;

  resetFilter: () => void;
}

type RecordState = RecordFormState & RecordFilterState;
type RecordActions = RecordFormActions &
  RecordFilterActions & {
    reset: () => void;
  };

// -----------------------------------------------------------------------------
// Initial State
// -----------------------------------------------------------------------------

const initialFormState: RecordFormState = {
  competitionId: null,
  styleId: null,
  time: null,
  reactionTime: null,
  isRelaying: false,
  note: null,
  splitTimes: [],
  isLoading: false,
  errors: {},
};

const initialFilterState: RecordFilterState = {
  filterDistances: [],
  filterStyles: [],
  filterCompetitionNames: [],
  filterPlaces: [],
  filterPoolType: "",
  filterRelayMode: "all",
  sortBy: "date",
  sortOrder: "desc",
};

const initialState: RecordState = {
  ...initialFormState,
  ...initialFilterState,
};

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const useRecordStore = create<RecordState & RecordActions>()((set) => ({
  ...initialState,

  // ---------------------------------------------------------------------------
  // Form: データ操作
  // ---------------------------------------------------------------------------
  setCompetitionId: (competitionId) => set({ competitionId }),
  setStyleId: (styleId) => set({ styleId }),
  setTime: (time) => set({ time }),
  setReactionTime: (reactionTime) => set({ reactionTime }),
  setIsRelaying: (isRelaying) => set({ isRelaying }),
  setNote: (note) => set({ note }),
  setSplitTimes: (splitTimes) => set({ splitTimes }),
  addSplitTime: (splitTime) =>
    set((state) => ({
      splitTimes: [...state.splitTimes, splitTime],
    })),
  removeSplitTime: (index) =>
    set((state) => ({
      splitTimes: state.splitTimes.filter((_, i) => i !== index),
    })),
  updateSplitTime: (index, updates) =>
    set((state) => ({
      splitTimes: state.splitTimes.map((st, i) => (i === index ? { ...st, ...updates } : st)),
    })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (field, message) =>
    set((state) => ({
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
        isRelaying: record.is_relaying ?? false,
        note: record.note || null,
        splitTimes: (record.split_times || []).map((st) => ({
          distance: st.distance,
          splitTime: st.split_time,
          id: st.id,
        })),
        errors: {},
        isLoading: false,
      });
    } else {
      // 作成モード: 空のフォームで初期化（initialFormStateにisLoading: falseが含まれる）
      set({
        ...initialFormState,
      });
    }
  },

  resetForm: () => set(initialFormState),

  // ---------------------------------------------------------------------------
  // Filter: 操作
  // ---------------------------------------------------------------------------
  setFilterDistances: (distances) => set({ filterDistances: distances }),
  setFilterStyles: (styles) => set({ filterStyles: styles }),
  setFilterCompetitionNames: (names) => set({ filterCompetitionNames: names }),
  setFilterPlaces: (places) => set({ filterPlaces: places }),
  setFilterPoolType: (poolType) => set({ filterPoolType: poolType }),
  setFilterRelayMode: (mode) => set({ filterRelayMode: mode }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (sortOrder) => set({ sortOrder }),

  resetFilter: () => set(initialFilterState),

  // ---------------------------------------------------------------------------
  // 全体リセット
  // ---------------------------------------------------------------------------
  reset: () => set(initialState),
}));
