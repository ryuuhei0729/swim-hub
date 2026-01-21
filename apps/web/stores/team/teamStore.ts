// =============================================================================
// チーム管理用Zustandストア
// =============================================================================

import type { MemberDetail } from '@/components/team/MemberDetailModal'
import type { Team, TeamMembership } from '@apps/shared/types'
import { create } from 'zustand'

interface TeamMembershipWithTeam extends TeamMembership {
  team?: Team
}

interface TeamState {
  // チーム一覧
  teams: TeamMembershipWithTeam[]
  teamsLoading: boolean
  activeTab: string
  
  // チーム詳細
  currentTeam: Team | null
  currentMembership: TeamMembership | null
  teamLoading: boolean
  
  // モーダル
  selectedMember: MemberDetail | null
  isMemberModalOpen: boolean
  
  // 出欠管理
  selectedEventId: string | null
  selectedEventType: 'practice' | 'competition' | null
}

interface TeamActions {
  // チーム一覧操作
  setTeams: (teams: TeamMembershipWithTeam[]) => void
  setTeamsLoading: (loading: boolean) => void
  setActiveTab: (tab: string) => void
  
  // チーム詳細操作
  setCurrentTeam: (team: Team | null) => void
  setCurrentMembership: (membership: TeamMembership | null) => void
  setTeamLoading: (loading: boolean) => void
  
  // モーダル操作
  setSelectedMember: (member: MemberDetail | null) => void
  setIsMemberModalOpen: (open: boolean) => void
  openMemberModal: (member: MemberDetail) => void
  closeMemberModal: () => void
  
  // 出欠管理操作
  setSelectedEvent: (eventId: string | null, eventType: 'practice' | 'competition' | null) => void
  
  reset: () => void
}

const initialState: TeamState = {
  teams: [],
  teamsLoading: true,
  activeTab: 'announcements',
  currentTeam: null,
  currentMembership: null,
  teamLoading: true,
  selectedMember: null,
  isMemberModalOpen: false,
  selectedEventId: null,
  selectedEventType: null,
}

export const useTeamStore = create<TeamState & TeamActions>()((set) => ({
  ...initialState,
  
  // チーム一覧操作
  setTeams: (teams) => set({ teams }),
  setTeamsLoading: (loading) => set({ teamsLoading: loading }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  // チーム詳細操作
  setCurrentTeam: (team) => set({ currentTeam: team }),
  setCurrentMembership: (membership) => set({ currentMembership: membership }),
  setTeamLoading: (loading) => set({ teamLoading: loading }),
  
  // モーダル操作
  setSelectedMember: (member) => set({ selectedMember: member }),
  setIsMemberModalOpen: (open) => set({ isMemberModalOpen: open }),
  openMemberModal: (member) => set({ 
    selectedMember: member, 
    isMemberModalOpen: true 
  }),
  closeMemberModal: () => set({ 
    isMemberModalOpen: false, 
    selectedMember: null 
  }),
  
  // 出欠管理操作
  setSelectedEvent: (eventId, eventType) => set({ 
    selectedEventId: eventId, 
    selectedEventType: eventType 
  }),
  
  reset: () => set(initialState),
}))

