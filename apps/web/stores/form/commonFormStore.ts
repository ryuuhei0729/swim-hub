// =============================================================================
// 汎用フォーム用Zustandストア
// =============================================================================

import { create } from 'zustand'

interface CommonFormState {
  isOpen: boolean
  isLoading: boolean
  error: string | null
}

interface CommonFormActions {
  open: () => void
  close: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

const initialState: CommonFormState = {
  isOpen: false,
  isLoading: false,
  error: null,
}

export const useCommonFormStore = create<CommonFormState & CommonFormActions>()((set) => ({
  ...initialState,
  
  open: () => set({ isOpen: true, error: null }),
  close: () => set({ isOpen: false, error: null }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}))

