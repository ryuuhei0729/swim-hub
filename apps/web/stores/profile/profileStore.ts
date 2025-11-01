// =============================================================================
// プロフィール管理用Zustandストア
// =============================================================================

import type { UserProfile } from '@apps/shared/types/database'
import { create } from 'zustand'

interface BestTime {
  id: string
  time: number
  created_at: string
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
}

interface ProfileState {
  profile: UserProfile | null
  bestTimes: BestTime[]
  loading: boolean
  error: string | null
  isEditModalOpen: boolean
}

interface ProfileActions {
  setProfile: (profile: UserProfile | null) => void
  setBestTimes: (times: BestTime[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  openEditModal: () => void
  closeEditModal: () => void
  reset: () => void
}

const initialState: ProfileState = {
  profile: null,
  bestTimes: [],
  loading: true,
  error: null,
  isEditModalOpen: false,
}

export const useProfileStore = create<ProfileState & ProfileActions>()((set) => ({
  ...initialState,
  
  setProfile: (profile) => set({ profile }),
  setBestTimes: (times) => set({ bestTimes: times }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  openEditModal: () => set({ isEditModalOpen: true }),
  closeEditModal: () => set({ isEditModalOpen: false }),
  reset: () => set(initialState),
}))

