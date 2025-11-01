// =============================================================================
// チーム詳細ページ用Zustandストア
// =============================================================================

import type { Team, TeamMembership } from '@apps/shared/types/database'
import { create } from 'zustand'

interface TeamDetailState {
  // チーム情報
  team: Team | null
  membership: TeamMembership | null
  loading: boolean
  
  // タブ
  activeTab: string
  
  // モーダル
  selectedMember: any | null
  isMemberModalOpen: boolean
}

interface TeamDetailActions {
  // チーム情報操作
  setTeam: (team: Team | null) => void
  setMembership: (membership: TeamMembership | null) => void
  setLoading: (loading: boolean) => void
  
  // タブ操作
  setActiveTab: (tab: string) => void
  
  // モーダル操作
  setSelectedMember: (member: any | null) => void
  setIsMemberModalOpen: (open: boolean) => void
  openMemberModal: (member: any) => void
  closeMemberModal: () => void
  
  reset: () => void
}

const initialState: TeamDetailState = {
  team: null,
  membership: null,
  loading: true,
  activeTab: 'announcements',
  selectedMember: null,
  isMemberModalOpen: false,
}

export const useTeamDetailStore = create<TeamDetailState & TeamDetailActions>()((set) => ({
  ...initialState,
  
  // チーム情報操作
  setTeam: (team) => set({ team }),
  setMembership: (membership) => set({ membership }),
  setLoading: (loading) => set({ loading }),
  
  // タブ操作
  setActiveTab: (tab) => set({ activeTab: tab }),
  
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
  
  reset: () => set(initialState),
}))
