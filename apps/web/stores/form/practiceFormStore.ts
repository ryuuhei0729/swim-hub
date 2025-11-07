// =============================================================================
// 練習記録フォーム用Zustandストア
// =============================================================================

import { create } from 'zustand'
import type { PracticeTag } from '@apps/shared/types/database'
import type { EditingData } from '../types'

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
  setAvailableTags: (tags: PracticeTag[]) => void
  setLoading: (loading: boolean) => void
  
  // リセット
  reset: () => void
}

const initialState: PracticeFormState = {
  isBasicFormOpen: false,
  isLogFormOpen: false,
  selectedDate: null,
  editingData: null,
  createdPracticeId: null,
  availableTags: [],
  isLoading: false,
}

export const usePracticeFormStore = create<PracticeFormState & PracticeFormActions>()((set) => ({
  ...initialState,
  
  // モーダル操作
  openBasicForm: (date, editData) => set({
    isBasicFormOpen: true,
    isLogFormOpen: false,
    selectedDate: date || null,
    editingData: editData || null,
    createdPracticeId: null,
  }),
  
  openLogForm: (practiceId, editData) => set({
    isBasicFormOpen: false,
    isLogFormOpen: true,
    editingData: editData || null,
    createdPracticeId: practiceId || null,
  }),
  
  closeBasicForm: () => set({
    isBasicFormOpen: false,
    selectedDate: null,
    editingData: null,
    createdPracticeId: null,
  }),
  
  closeLogForm: () => set({
    isLogFormOpen: false,
    selectedDate: null,
    editingData: null,
    createdPracticeId: null,
  }),
  
  closeAll: () => set({
    isBasicFormOpen: false,
    isLogFormOpen: false,
    selectedDate: null,
    editingData: null,
    createdPracticeId: null,
  }),
  
  // データ操作
  setSelectedDate: (date) => set({ selectedDate: date }),
  setEditingData: (data) => set({ editingData: data }),
  setCreatedPracticeId: (id) => set({ createdPracticeId: id }),
  setAvailableTags: (tags) => set({ availableTags: tags }),
  setLoading: (loading) => set({ isLoading: loading }),
  
  // リセット
  reset: () => set(initialState),
}))

