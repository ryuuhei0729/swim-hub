// =============================================================================
// チーム管理ページ用Zustandストア
// =============================================================================

import type { TeamAdminTabType } from "@/components/team/TeamAdminTabs";
import type { MemberDetail } from "@/components/team/MemberDetailModal";
import type { TeamMembership, TeamWithMembers } from "@apps/shared/types";
import { create } from "zustand";

interface TeamAdminState {
  // チーム情報
  team: TeamWithMembers | null;
  membership: TeamMembership | null;
  loading: boolean;

  // タブ
  activeTab: TeamAdminTabType;
  /**
   * 既に適用済みの `?tab=` の値 (クエリなしは null)。
   *
   * 🚨 **ref ではなくストアに置く。** これは activeTab と対になった状態で、
   * 「この URL 値はもう反映した」という記録。コンポーネント側の useRef に置くと
   * `reset()` で activeTab だけが初期化されて記録が生き残り、
   * 「activeTab は attendance なのに ?tab=settings は適用済み」という不整合になって
   * URL のタブが二度と反映されない。ここに置けば reset() が両方を同時に消す。
   */
  appliedTabParam: string | null;

  // モーダル
  selectedMember: MemberDetail | null;
  isMemberModalOpen: boolean;
}

interface TeamAdminActions {
  // チーム情報操作
  setTeam: (team: TeamWithMembers | null) => void;
  setMembership: (membership: TeamMembership | null) => void;
  setLoading: (loading: boolean) => void;

  // タブ操作
  setActiveTab: (tab: TeamAdminTabType) => void;
  setAppliedTabParam: (tabParam: string | null) => void;

  // モーダル操作
  setSelectedMember: (member: MemberDetail | null) => void;
  setIsMemberModalOpen: (open: boolean) => void;
  openMemberModal: (member: MemberDetail) => void;
  closeMemberModal: () => void;

  reset: () => void;
}

const initialState: TeamAdminState = {
  team: null,
  membership: null,
  loading: true,
  activeTab: "attendance",
  appliedTabParam: null,
  selectedMember: null,
  isMemberModalOpen: false,
};

export const useTeamAdminStore = create<TeamAdminState & TeamAdminActions>()((set) => ({
  ...initialState,

  // チーム情報操作
  setTeam: (team) => set({ team }),
  setMembership: (membership) => set({ membership }),
  setLoading: (loading) => set({ loading }),

  // タブ操作
  setActiveTab: (tab: TeamAdminTabType) => set({ activeTab: tab }),
  setAppliedTabParam: (tabParam) => set({ appliedTabParam: tabParam }),

  // モーダル操作
  setSelectedMember: (member) => set({ selectedMember: member }),
  setIsMemberModalOpen: (open) => set({ isMemberModalOpen: open }),
  openMemberModal: (member) =>
    set({
      selectedMember: member,
      isMemberModalOpen: true,
    }),
  closeMemberModal: () =>
    set({
      isMemberModalOpen: false,
      selectedMember: null,
    }),

  reset: () => set(initialState),
}));
