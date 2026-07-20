// =============================================================================
// 練習用統合Zustandストア (Form + Filter)
// =============================================================================

import { create } from "zustand";
import type { PracticeTag } from "@apps/shared/types";
import type { EditingData, PracticeTabId } from "../types";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface PracticeFormState {
  // タブモーダル状態
  isOpen: boolean;
  activeTab: PracticeTabId;
  /** 編集時の既存練習ID（新規作成完了後も内部的に保持: 子INSERT失敗時の再送信で親重複INSERT防止）*/
  editingPracticeId: string | null;

  // 後方互換: 旧来のオープン状態（TeamPracticeForm 等の旧経路が参照）
  isBasicFormOpen: boolean;
  isLogFormOpen: boolean;

  // データ
  selectedDate: Date | null;
  editingData: EditingData | null;
  createdPracticeId: string | null;
  availableTags: PracticeTag[];

  // UI状態
  isLoading: boolean;
}

interface PracticeFilterState {
  selectedTagIds: string[];
}

interface PracticeFormActions {
  // タブモーダル操作
  openTabModal: (date?: Date, editData?: EditingData, tab?: PracticeTabId) => void;
  closeTabModal: () => void;
  setActiveTab: (tab: PracticeTabId) => void;
  setEditingPracticeId: (id: string | null) => void;

  // 後方互換: 旧来のモーダル操作（TeamPracticeForm 等の旧経路が参照）
  openBasicForm: (date?: Date, editData?: EditingData) => void;
  openLogForm: (practiceId?: string, editData?: EditingData) => void;
  closeBasicForm: () => void;
  closeLogForm: () => void;
  closeAll: () => void;

  // データ操作
  setSelectedDate: (date: Date | null) => void;
  setEditingData: (data: EditingData | null) => void;
  setCreatedPracticeId: (id: string | null) => void;
  setAvailableTags: (tags: PracticeTag[] | ((prev: PracticeTag[]) => PracticeTag[])) => void;
  setLoading: (loading: boolean) => void;

  // フォームリセット
  resetForm: () => void;
}

interface PracticeFilterActions {
  setSelectedTags: (tagIds: string[]) => void;
  resetFilter: () => void;
}

type PracticeState = PracticeFormState & PracticeFilterState;
type PracticeActions = PracticeFormActions &
  PracticeFilterActions & {
    reset: () => void;
  };

// -----------------------------------------------------------------------------
// Initial State
// -----------------------------------------------------------------------------

const initialFormState: PracticeFormState = {
  isOpen: false,
  activeTab: "practice",
  editingPracticeId: null,
  isBasicFormOpen: false,
  isLogFormOpen: false,
  selectedDate: null,
  editingData: null,
  createdPracticeId: null,
  availableTags: [],
  isLoading: false,
};

const initialFilterState: PracticeFilterState = {
  selectedTagIds: [],
};

const initialState: PracticeState = {
  ...initialFormState,
  ...initialFilterState,
};

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const usePracticeStore = create<PracticeState & PracticeActions>()((set) => ({
  ...initialState,

  // ---------------------------------------------------------------------------
  // タブモーダル操作
  // ---------------------------------------------------------------------------
  openTabModal: (date, editData, tab = "practice") => {
    set({
      isOpen: true,
      activeTab: tab,
      editingPracticeId: editData?.id || null,
      selectedDate: date || null,
      editingData: editData || null,
      createdPracticeId: null,
      // 後方互換フィールドも更新
      isBasicFormOpen: false,
      isLogFormOpen: false,
    });
  },

  closeTabModal: () => {
    set({
      isOpen: false,
      activeTab: "practice",
      editingPracticeId: null,
      selectedDate: null,
      editingData: null,
      createdPracticeId: null,
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setEditingPracticeId: (id) => set({ editingPracticeId: id }),

  // ---------------------------------------------------------------------------
  // 後方互換: 旧来のモーダル操作
  // ---------------------------------------------------------------------------
  openBasicForm: (date, editData) => {
    set({
      isBasicFormOpen: true,
      isLogFormOpen: false,
      selectedDate: date || null,
      editingData: editData || null,
      createdPracticeId: null,
    });
  },

  openLogForm: (practiceId, editData) => {
    set({
      isBasicFormOpen: false,
      isLogFormOpen: true,
      editingData: editData || null,
      createdPracticeId: practiceId || null,
    });
  },

  closeBasicForm: () => {
    set({
      isBasicFormOpen: false,
      selectedDate: null,
      editingData: null,
      createdPracticeId: null,
    });
  },

  closeLogForm: () => {
    set({
      isLogFormOpen: false,
      selectedDate: null,
      editingData: null,
      createdPracticeId: null,
    });
  },

  closeAll: () => {
    set({
      isOpen: false,
      activeTab: "practice",
      editingPracticeId: null,
      isBasicFormOpen: false,
      isLogFormOpen: false,
      selectedDate: null,
      editingData: null,
      createdPracticeId: null,
    });
  },

  // ---------------------------------------------------------------------------
  // データ操作
  // ---------------------------------------------------------------------------
  setSelectedDate: (date) => set({ selectedDate: date }),
  setEditingData: (data) => set({ editingData: data }),
  setCreatedPracticeId: (id) => set({ createdPracticeId: id }),
  setAvailableTags: (tags) =>
    set((state) => ({
      availableTags: typeof tags === "function" ? tags(state.availableTags) : tags,
    })),
  setLoading: (loading) => set({ isLoading: loading }),

  resetForm: () => set(initialFormState),

  // ---------------------------------------------------------------------------
  // Filter: 操作
  // ---------------------------------------------------------------------------
  setSelectedTags: (tagIds) => set({ selectedTagIds: tagIds }),
  resetFilter: () => set(initialFilterState),

  // ---------------------------------------------------------------------------
  // 全体リセット
  // ---------------------------------------------------------------------------
  reset: () => set(initialState),
}));
