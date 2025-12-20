import { create } from 'zustand'

// エントリー情報（RecordLogFormで使用）
export interface EntryInfo {
  styleId: number
  styleName: string
  entryTime?: number
}

interface CompetitionFormState {
  // 作成中の大会ID
  createdCompetitionId: string | null
  
  // 作成したエントリー情報（RecordLogFormで使用）
  createdEntries: EntryInfo[]
  
  // フォーム状態
  isLoading: boolean
  errors: Record<string, string>
}

interface CompetitionFormActions {
  // データ操作
  setCreatedCompetitionId: (id: string | null) => void
  setCreatedEntries: (entries: EntryInfo[]) => void
  addCreatedEntry: (entry: EntryInfo) => void
  clearCreatedEntries: () => void
  setLoading: (loading: boolean) => void
  setError: (field: string, message: string) => void
  clearErrors: () => void
  
  // リセット
  reset: () => void
}

const initialState: CompetitionFormState = {
  createdCompetitionId: null,
  createdEntries: [],
  isLoading: false,
  errors: {},
}

export const useCompetitionFormStore = create<CompetitionFormState & CompetitionFormActions>()((set) => ({
  ...initialState,
  
  // データ操作
  setCreatedCompetitionId: (id) => set({ createdCompetitionId: id }),
  setCreatedEntries: (entries) => set({ createdEntries: entries }),
  addCreatedEntry: (entry) => set((state) => ({
    createdEntries: [...state.createdEntries, entry],
  })),
  clearCreatedEntries: () => set({ createdEntries: [] }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (field, message) => set((state) => ({
    errors: {
      ...state.errors,
      [field]: message,
    },
  })),
  clearErrors: () => set({ errors: {} }),
  
  // リセット
  reset: () => set(initialState),
}))
