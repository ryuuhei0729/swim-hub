// =============================================================================
// チーム管理ページ用Zustandストア
// =============================================================================

import type { TeamAdminTabType } from '@/components/team/TeamAdminTabs'
import type { MemberDetail } from '@/components/team/MemberDetailModal'
import type { TeamMembership, TeamWithMembers } from '@apps/shared/types'
import { create } from 'zustand'

interface TeamAdminState {
  // チーム情報
  team: TeamWithMembers | null
  membership: TeamMembership | null
  loading: boolean
  
  // タブ
  activeTab: TeamAdminTabType
  
  // モーダル
  selectedMember: MemberDetail | null
  isMemberModalOpen: boolean
}

interface TeamAdminActions {
  // チーム情報操作
  setTeam: (team: TeamWithMembers | null) => void
  setMembership: (membership: TeamMembership | null) => void
  setLoading: (loading: boolean) => void
  
  // タブ操作
  setActiveTab: (tab: TeamAdminTabType) => void
  
  // モーダル操作
  setSelectedMember: (member: MemberDetail | null) => void
  setIsMemberModalOpen: (open: boolean) => void
  openMemberModal: (member: MemberDetail) => void
  closeMemberModal: () => void
  
  reset: () => void
}

const initialState: TeamAdminState = {
  team: null,
  membership: null,
  loading: true,
  activeTab: 'attendance',
  selectedMember: null,
  isMemberModalOpen: false,
}

export const useTeamAdminStore = create<TeamAdminState & TeamAdminActions>()((set) => ({
  ...initialState,
  
  // チーム情報操作
  setTeam: (team) => set({ team }),
  setMembership: (membership) => set({ membership }),
  setLoading: (loading) => set({ loading }),
  
  // タブ操作
  setActiveTab: (tab: TeamAdminTabType) => set({ activeTab: tab }),
  
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


