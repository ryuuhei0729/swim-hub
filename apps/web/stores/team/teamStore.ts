// =============================================================================
// チーム管理用Zustandストア
// =============================================================================

import { create } from 'zustand'
import type { TeamMembership, Team } from '@apps/shared/types/database'

interface TeamMembershipWithTeam extends TeamMembership {
  team?: Team
}

interface TeamState {
  teams: TeamMembershipWithTeam[]
  teamsLoading: boolean
  activeTab: string
}

interface TeamActions {
  setTeams: (teams: TeamMembershipWithTeam[]) => void
  setTeamsLoading: (loading: boolean) => void
  setActiveTab: (tab: string) => void
  reset: () => void
}

const initialState: TeamState = {
  teams: [],
  teamsLoading: true,
  activeTab: 'announcements',
}

export const useTeamStore = create<TeamState & TeamActions>()((set) => ({
  ...initialState,
  
  setTeams: (teams) => set({ teams }),
  setTeamsLoading: (loading) => set({ teamsLoading: loading }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  reset: () => set(initialState),
}))

