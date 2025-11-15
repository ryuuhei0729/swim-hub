// =============================================================================
// 出欠管理タブ用Zustandストア
// =============================================================================

import type { TeamEvent } from '@apps/shared/types/database'
import { create } from 'zustand'

interface AttendanceTabState {
  selectedEventId: string | null
  selectedEventType: 'practice' | 'competition' | null
  events: TeamEvent[]
  loading: boolean
}

interface AttendanceTabActions {
  setSelectedEvent: (eventId: string | null, eventType: 'practice' | 'competition' | null) => void
  setEvents: (events: TeamEvent[]) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

const initialState: AttendanceTabState = {
  selectedEventId: null,
  selectedEventType: null,
  events: [],
  loading: true,
}

export const useAttendanceTabStore = create<AttendanceTabState & AttendanceTabActions>()((set) => ({
  ...initialState,
  
  setSelectedEvent: (eventId, eventType) => set({ 
    selectedEventId: eventId, 
    selectedEventType: eventType 
  }),
  setEvents: (events) => set({ events }),
  setLoading: (loading) => set({ loading }),
  
  reset: () => set(initialState),
}))

