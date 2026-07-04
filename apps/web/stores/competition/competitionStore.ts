// =============================================================================
// 大会用統合Zustandストア (Form + Filter)
// =============================================================================

import { create } from "zustand";
import type { Style } from "@apps/shared/types";
import type { EditingData, EntryWithStyle, CompetitionTabId } from "../types";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface CompetitionFormState {
  // タブモーダル状態
  isOpen: boolean;
  activeTab: CompetitionTabId;
  /** エントリー編集をロックする（チーム大会で entry_status が open でない場合など） */
  entryLocked: boolean;
  /** 編集時の既存大会ID（新規作成完了後も内部的に保持: 子INSERT失敗時の再送信で親重複INSERT防止）*/
  editingCompetitionId: string | null;

  // 後方互換: 旧来のオープン状態（TeamCompetitionForm 等の旧経路が参照）
  isBasicFormOpen: boolean;
  isEntryFormOpen: boolean;
  isRecordFormOpen: boolean;

  // データ
  selectedDate: Date | null;
  editingData: EditingData | null;
  createdCompetitionId: string | null;
  createdEntries: EntryWithStyle[];
  styles: Style[];

  // UI状態
  isLoading: boolean;
}

interface CompetitionFilterState {
  filterStyle: string;
  includeRelay: boolean;
  filterPoolType: string;
  filterFiscalYear: string;
}

interface CompetitionFormActions {
  // タブモーダル操作
  openTabModal: (
    date?: Date,
    editData?: EditingData,
    tab?: CompetitionTabId,
    entryLocked?: boolean,
  ) => void;
  closeTabModal: () => void;
  setActiveTab: (tab: CompetitionTabId) => void;
  setEditingCompetitionId: (id: string | null) => void;

  // 後方互換: 旧来のモーダル操作
  openBasicForm: (date?: Date, editData?: EditingData) => void;
  openEntryForm: (competitionId?: string, editData?: EditingData) => void;
  openRecordForm: (
    competitionId?: string,
    entryData?: EntryWithStyle[],
    editData?: EditingData,
  ) => void;
  closeBasicForm: () => void;
  closeEntryForm: () => void;
  closeRecordForm: () => void;
  closeAll: () => void;

  // データ操作
  setSelectedDate: (date: Date | null) => void;
  setEditingData: (data: EditingData | null) => void;
  setCreatedCompetitionId: (id: string | null) => void;
  setCreatedEntries: (entries: EntryWithStyle[]) => void;
  setStyles: (styles: Style[]) => void;
  setLoading: (loading: boolean) => void;

  // フォームリセット
  resetForm: () => void;
}

interface CompetitionFilterActions {
  setFilterStyle: (style: string) => void;
  setIncludeRelay: (include: boolean) => void;
  setFilterPoolType: (poolType: string) => void;
  setFilterFiscalYear: (year: string) => void;
  resetFilter: () => void;
}

type CompetitionState = CompetitionFormState & CompetitionFilterState;
type CompetitionActions = CompetitionFormActions &
  CompetitionFilterActions & {
    reset: () => void;
  };

// -----------------------------------------------------------------------------
// Initial State
// -----------------------------------------------------------------------------

const initialFormState: CompetitionFormState = {
  isOpen: false,
  activeTab: "competition",
  entryLocked: false,
  editingCompetitionId: null,
  isBasicFormOpen: false,
  isEntryFormOpen: false,
  isRecordFormOpen: false,
  selectedDate: null,
  editingData: null,
  createdCompetitionId: null,
  createdEntries: [],
  styles: [],
  isLoading: false,
};

const initialFilterState: CompetitionFilterState = {
  filterStyle: "",
  includeRelay: true,
  filterPoolType: "",
  filterFiscalYear: "",
};

const initialState: CompetitionState = {
  ...initialFormState,
  ...initialFilterState,
};

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const useCompetitionStore = create<CompetitionState & CompetitionActions>()((set) => ({
  ...initialState,

  // ---------------------------------------------------------------------------
  // タブモーダル操作
  // ---------------------------------------------------------------------------
  openTabModal: (date, editData, tab = "competition", entryLocked = false) => {
    set({
      isOpen: true,
      activeTab: tab,
      entryLocked,
      editingCompetitionId: editData?.id || null,
      selectedDate: date || null,
      editingData: editData || null,
      createdCompetitionId: null,
      createdEntries: [],
      // 後方互換フィールドも更新
      isBasicFormOpen: false,
      isEntryFormOpen: false,
      isRecordFormOpen: false,
    });
  },

  closeTabModal: () => {
    set({
      isOpen: false,
      activeTab: "competition",
      entryLocked: false,
      editingCompetitionId: null,
      selectedDate: null,
      editingData: null,
      createdCompetitionId: null,
      createdEntries: [],
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setEditingCompetitionId: (id) => set({ editingCompetitionId: id }),

  // ---------------------------------------------------------------------------
  // 後方互換: 旧来のモーダル操作
  // ---------------------------------------------------------------------------
  openBasicForm: (date, editData) =>
    set({
      isBasicFormOpen: true,
      isEntryFormOpen: false,
      isRecordFormOpen: false,
      selectedDate: date || null,
      editingData: editData || null,
      createdCompetitionId: null,
      createdEntries: [],
    }),

  openEntryForm: (competitionId, editData) =>
    set({
      isBasicFormOpen: false,
      isEntryFormOpen: true,
      isRecordFormOpen: false,
      createdCompetitionId: competitionId || null,
      editingData: editData || null,
    }),

  openRecordForm: (competitionId, entryData, editData) =>
    set((state) => ({
      isBasicFormOpen: false,
      isEntryFormOpen: false,
      isRecordFormOpen: true,
      createdCompetitionId: competitionId || null,
      createdEntries: entryData || state.createdEntries,
      editingData: editData || null,
    })),

  closeBasicForm: () =>
    set({
      isBasicFormOpen: false,
      selectedDate: null,
      editingData: null,
      createdCompetitionId: null,
    }),

  closeEntryForm: () =>
    set({
      isEntryFormOpen: false,
      selectedDate: null,
      createdCompetitionId: null,
      createdEntries: [],
      editingData: null,
    }),

  closeRecordForm: () =>
    set({
      isRecordFormOpen: false,
      selectedDate: null,
      editingData: null,
      createdCompetitionId: null,
      createdEntries: [],
    }),

  closeAll: () =>
    set({
      isOpen: false,
      activeTab: "competition",
      editingCompetitionId: null,
      isBasicFormOpen: false,
      isEntryFormOpen: false,
      isRecordFormOpen: false,
      selectedDate: null,
      editingData: null,
      createdCompetitionId: null,
      createdEntries: [],
    }),

  // ---------------------------------------------------------------------------
  // データ操作
  // ---------------------------------------------------------------------------
  setSelectedDate: (date) => set({ selectedDate: date }),
  setEditingData: (data) => set({ editingData: data }),
  setCreatedCompetitionId: (id) => set({ createdCompetitionId: id }),
  setCreatedEntries: (entries) => set({ createdEntries: entries }),
  setStyles: (styles) => set({ styles }),
  setLoading: (loading) => set({ isLoading: loading }),

  resetForm: () => set(initialFormState),

  // ---------------------------------------------------------------------------
  // Filter: 操作
  // ---------------------------------------------------------------------------
  setFilterStyle: (style) => set({ filterStyle: style }),
  setIncludeRelay: (include) => set({ includeRelay: include }),
  setFilterPoolType: (poolType) => set({ filterPoolType: poolType }),
  setFilterFiscalYear: (year) => set({ filterFiscalYear: year }),
  resetFilter: () => set(initialFilterState),

  // ---------------------------------------------------------------------------
  // 全体リセット
  // ---------------------------------------------------------------------------
  reset: () => set(initialState),
}));
