// =============================================================================
// チームタブの表示状態ストア（モバイル版）
// =============================================================================
// チームタブは「最後に開いたチーム」をそのまま表示する。ここでは次の3つを端末に覚える:
//   - lastTeamId: 最後に開いたチーム
//   - byTeam[teamId].tab: そのチームで最後に開いていたタブ
//   - byTeam[teamId].adminView: そのチームで管理者ビューを ON にしていたか
//
// 機微な情報ではないため AsyncStorage (平文) に置く (lib/onboardingCache.ts と同じ判断)。
//
// ⚠️ adminView はあくまで「表示の好み」であり、権限ではない。
// 管理者専用要素を出すかどうかは、必ず TeamDetailView の
// `effectiveIsAdminView = isCurrentUserAdmin && adminView` で判定する。
// 端末に残った値が「管理者でなくなったチーム」や「別アカウント」で true のままでも、
// この AND があるので漏れない。
//
// TeamDetailView 本体とヘッダーの TeamDetailHeaderAdminToggle は別の場所に描画されるため、
// 値をこのストアに一元化して両方が直接購読する。

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TEAM_TAB_IDS, type TeamTabType } from "@/components/teams/teamTabDefs";
import { resolveActiveTabOnAdminViewToggle } from "@/utils/teamAdminView";

export interface TeamViewPrefs {
  tab?: TeamTabType;
  adminView?: boolean;
}

interface TeamViewState {
  lastTeamId: string | null;
  byTeam: Record<string, TeamViewPrefs>;
  selectTeam: (teamId: string | null) => void;
  setTab: (teamId: string, tab: TeamTabType) => void;
  /** 利用者ビューへ切り替えるとき、管理者専用タブにいたら members へ戻す */
  setAdminView: (teamId: string, value: boolean) => void;
}

const STORAGE_KEY = "team-view";

export const useTeamViewStore = create<TeamViewState>()(
  persist(
    (set) => ({
      lastTeamId: null,
      byTeam: {},
      selectTeam: (teamId) => set({ lastTeamId: teamId }),
      setTab: (teamId, tab) =>
        set((state) => ({
          byTeam: { ...state.byTeam, [teamId]: { ...state.byTeam[teamId], tab } },
        })),
      setAdminView: (teamId, value) =>
        set((state) => {
          const prev = state.byTeam[teamId];
          const tab = prev?.tab ? resolveActiveTabOnAdminViewToggle(prev.tab, value) : prev?.tab;
          return { byTeam: { ...state.byTeam, [teamId]: { ...prev, tab, adminView: value } } };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ lastTeamId: state.lastTeamId, byTeam: state.byTeam }),
      // タブ定義が変わって消えたタブ ID が残っていても members に倒れるよう、読み込み時に捨てる
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<TeamViewState, "lastTeamId" | "byTeam">>;
        const byTeam: Record<string, TeamViewPrefs> = {};
        for (const [teamId, prefs] of Object.entries(saved.byTeam ?? {})) {
          byTeam[teamId] = {
            tab: prefs.tab && TEAM_TAB_IDS.includes(prefs.tab) ? prefs.tab : undefined,
            adminView: prefs.adminView === true,
          };
        }
        return {
          ...current,
          lastTeamId: typeof saved.lastTeamId === "string" ? saved.lastTeamId : null,
          byTeam,
        };
      },
    },
  ),
);

