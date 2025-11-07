// =============================================================================
// 大会記録フォーム用Zustandストア
// =============================================================================

import { create } from 'zustand'
import type { Style } from '@apps/shared/types/database'
import type { EditingData, EntryWithStyle } from '../types'

interface CompetitionFormState {
  // モーダル状態（3段階）
  isBasicFormOpen: boolean
  isEntryFormOpen: boolean
  isRecordFormOpen: boolean
  
  // データ
  selectedDate: Date | null
  editingData: EditingData | null
  createdCompetitionId: string | null
  createdEntries: EntryWithStyle[]
  styles: Style[]
  
  // UI状態
  isLoading: boolean
}

interface CompetitionFormActions {
  // モーダル操作
  openBasicForm: (date?: Date, editData?: EditingData) => void
  openEntryForm: (competitionId?: string, editData?: EditingData) => void
  openRecordForm: (competitionId?: string, entryData?: EntryWithStyle[], editData?: EditingData) => void
  closeBasicForm: () => void
  closeEntryForm: () => void
  closeRecordForm: () => void
  closeAll: () => void
  
  // データ操作
  setSelectedDate: (date: Date | null) => void
  setEditingData: (data: EditingData | null) => void
  setCreatedCompetitionId: (id: string | null) => void
  setCreatedEntries: (entries: EntryWithStyle[]) => void
  setStyles: (styles: Style[]) => void
  setLoading: (loading: boolean) => void
  
  // リセット
  reset: () => void
}

const initialState: CompetitionFormState = {
  isBasicFormOpen: false,
  isEntryFormOpen: false,
  isRecordFormOpen: false,
  selectedDate: null,
  editingData: null,
  createdCompetitionId: null,
  createdEntries: [],
  styles: [],
  isLoading: false,
}

export const useCompetitionFormStore = create<CompetitionFormState & CompetitionFormActions>()((set) => ({
  ...initialState,
  
  // モーダル操作
  openBasicForm: (date, editData) => set({
    isBasicFormOpen: true,
    isEntryFormOpen: false,
    isRecordFormOpen: false,
    selectedDate: date || null,
    editingData: editData || null,
    createdCompetitionId: null,
    createdEntries: [],
  }),
  
  openEntryForm: (competitionId, editData) => set({
    isBasicFormOpen: false,
    isEntryFormOpen: true,
    isRecordFormOpen: false,
    createdCompetitionId: competitionId || null,
    editingData: editData || null,
  }),
  
  openRecordForm: (competitionId, entryData, editData) => set((state) => ({
    isBasicFormOpen: false,
    isEntryFormOpen: false,
    isRecordFormOpen: true,
    createdCompetitionId: competitionId || null,
    createdEntries: entryData || state.createdEntries,
    editingData: editData || null,
  })),
  
  closeBasicForm: () => set({
    isBasicFormOpen: false,
    selectedDate: null,
    editingData: null,
    createdCompetitionId: null,
  }),
  
  closeEntryForm: () => set({
    isEntryFormOpen: false,
    selectedDate: null,
    createdCompetitionId: null,
    createdEntries: [],
    editingData: null,
  }),
  
  closeRecordForm: () => set({
    isRecordFormOpen: false,
    selectedDate: null,
    editingData: null,
    createdCompetitionId: null,
    createdEntries: [],
  }),
  
  closeAll: () => set({
    isBasicFormOpen: false,
    isEntryFormOpen: false,
    isRecordFormOpen: false,
    selectedDate: null,
    editingData: null,
    createdCompetitionId: null,
    createdEntries: [],
  }),
  
  // データ操作
  setSelectedDate: (date) => set({ selectedDate: date }),
  setEditingData: (data) => set({ editingData: data }),
  setCreatedCompetitionId: (id) => set({ createdCompetitionId: id }),
  setCreatedEntries: (entries) => set({ createdEntries: entries }),
  setStyles: (styles) => set({ styles }),
  setLoading: (loading) => set({ isLoading: loading }),
  
  // リセット
  reset: () => set(initialState),
}))

