// =============================================================================
// 練習用統合Zustandストア (Form + Filter)
// =============================================================================

import { create } from 'zustand'
import type { PracticeTag } from '@apps/shared/types'
import type { EditingData } from '../types'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface PracticeFormState {
  // モーダル状態
  isBasicFormOpen: boolean
  isLogFormOpen: boolean

  // データ
  selectedDate: Date | null
  editingData: EditingData | null
  createdPracticeId: string | null
  availableTags: PracticeTag[]

  // UI状態
  isLoading: boolean
}

interface PracticeFilterState {
  selectedTagIds: string[]
  showTagFilter: boolean
}

interface PracticeFormActions {
  // モーダル操作
  openBasicForm: (date?: Date, editData?: EditingData) => void
  openLogForm: (practiceId?: string, editData?: EditingData) => void
  closeBasicForm: () => void
  closeLogForm: () => void
  closeAll: () => void

  // データ操作
  setSelectedDate: (date: Date | null) => void
  setEditingData: (data: EditingData | null) => void
  setCreatedPracticeId: (id: string | null) => void
  setAvailableTags: (tags: PracticeTag[] | ((prev: PracticeTag[]) => PracticeTag[])) => void
  setLoading: (loading: boolean) => void

  // フォームリセット
  resetForm: () => void
}

interface PracticeFilterActions {
  setSelectedTags: (tagIds: string[]) => void
  toggleTagFilter: () => void
  resetFilter: () => void
}

type PracticeState = PracticeFormState & PracticeFilterState
type PracticeActions = PracticeFormActions & PracticeFilterActions & {
  reset: () => void
}

// -----------------------------------------------------------------------------
// Initial State
// -----------------------------------------------------------------------------

const initialFormState: PracticeFormState = {
  isBasicFormOpen: false,
  isLogFormOpen: false,
  selectedDate: null,
  editingData: null,
  createdPracticeId: null,
  availableTags: [],
  isLoading: false,
}

const initialFilterState: PracticeFilterState = {
  selectedTagIds: [],
  showTagFilter: false,
}

const initialState: PracticeState = {
  ...initialFormState,
  ...initialFilterState,
}

// -----------------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------------

export const usePracticeStore = create<PracticeState & PracticeActions>()((set) => ({
  ...initialState,

  // ---------------------------------------------------------------------------
  // Form: モーダル操作
  // ---------------------------------------------------------------------------
  openBasicForm: (date, editData) => {
    set({
      isBasicFormOpen: true,
      isLogFormOpen: false,
      selectedDate: date || null,
      editingData: editData || null,
      createdPracticeId: null,
    })
  },

  openLogForm: (practiceId, editData) => {
    set({
      isBasicFormOpen: false,
      isLogFormOpen: true,
      editingData: editData || null,
      createdPracticeId: practiceId || null,
    })
  },

  closeBasicForm: () => {
    set({
      isBasicFormOpen: false,
      selectedDate: null,
      editingData: null,
      createdPracticeId: null,
    })
  },

  closeLogForm: () => {
    set({
      isLogFormOpen: false,
      selectedDate: null,
      editingData: null,
      createdPracticeId: null,
    })
  },

  closeAll: () => {
    set({
      isBasicFormOpen: false,
      isLogFormOpen: false,
      selectedDate: null,
      editingData: null,
      createdPracticeId: null,
    })
  },

  // ---------------------------------------------------------------------------
  // Form: データ操作
  // ---------------------------------------------------------------------------
  setSelectedDate: (date) => set({ selectedDate: date }),
  setEditingData: (data) => set({ editingData: data }),
  setCreatedPracticeId: (id) => set({ createdPracticeId: id }),
  setAvailableTags: (tags) =>
    set((state) => ({
      availableTags: typeof tags === 'function' ? tags(state.availableTags) : tags,
    })),
  setLoading: (loading) => set({ isLoading: loading }),

  resetForm: () => set(initialFormState),

  // ---------------------------------------------------------------------------
  // Filter: 操作
  // ---------------------------------------------------------------------------
  setSelectedTags: (tagIds) => set({ selectedTagIds: tagIds }),
  toggleTagFilter: () => set((state) => ({ showTagFilter: !state.showTagFilter })),
  resetFilter: () => set(initialFilterState),

  // ---------------------------------------------------------------------------
  // 全体リセット
  // ---------------------------------------------------------------------------
  reset: () => set(initialState),
}))

// -----------------------------------------------------------------------------
// 後方互換性のためのエイリアス (deprecated, will be removed)
// -----------------------------------------------------------------------------

/** @deprecated usePracticeStore を使用してください */
export const usePracticeFormStore = usePracticeStore

/** @deprecated usePracticeStore を使用してください */
export const usePracticeFilterStore = usePracticeStore
