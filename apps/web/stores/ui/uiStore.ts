// =============================================================================
// UI状態管理用Zustandストア
// =============================================================================

import { create } from 'zustand'

interface UIState {
  selectedDate: Date | null
  calendarRefreshKey: number
}

interface UIActions {
  setSelectedDate: (date: Date | null) => void
  refreshCalendar: () => void
  reset: () => void
}

const initialState: UIState = {
  selectedDate: null,
  calendarRefreshKey: 0,
}

export const useUIStore = create<UIState & UIActions>()((set) => ({
  ...initialState,
  
  setSelectedDate: (date) => set({ selectedDate: date }),
  refreshCalendar: () => set((state) => ({ calendarRefreshKey: state.calendarRefreshKey + 1 })),
  reset: () => set(initialState),
}))

