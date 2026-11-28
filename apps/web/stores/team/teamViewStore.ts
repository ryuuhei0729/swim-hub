// =============================================================================
// チーム画面の表示状態ストア（Web 版）
// =============================================================================
// モバイルの stores/teamViewStore.ts と同じ考え方で、ブラウザに次を覚える:
//   - lastTeamId: 最後に開いたチーム (サイドバーの「チーム」から直接そこへ戻る)
//   - byTeam[teamId].adminView: そのチームを最後に管理者ビューで見ていたか
//   - byTeam[teamId].tab: そのチームで最後に開いていたタブ (swimhub-tasks #100)
//
// ⚠️ adminView はあくまで「表示の好み」であり、権限ではない。
// 管理者ビューにするかどうかは必ず実際の role と AND を取る (utils/teamView.ts)。
//
// ⚠️ 描画中に読むと SSR (初期値) とハイドレーション後 (localStorage) で値が食い違うため、
// イベントハンドラ・effect の中で getState() で読むこと。
//
// localStorage はプライベートモード・サイトデータのブロックなどで読み書きが例外になる
// ことがあるので、保存先は try/catch で包む (失敗したら覚えないだけにする)。

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { resolveTeamTabParam, type TeamTabType } from "@/components/team/teamTabDefs";

export interface TeamViewPrefs {
  adminView?: boolean;
  tab?: TeamTabType;
}

interface TeamViewState {
  lastTeamId: string | null;
  byTeam: Record<string, TeamViewPrefs>;
}

interface TeamViewActions {
  /** チームのページを開いたときに、どのビューで開いたかを記録する */
  recordVisit: (teamId: string, adminView: boolean) => void;
  /** そのチームで開いているタブを記録する */
  setTab: (teamId: string, tab: TeamTabType) => void;
}

const STORAGE_KEY = "team-view";

/** 例外を握りつぶす localStorage。使えない環境では何も覚えない */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // 容量超過・ブロックなど。覚えられないだけで表示には影響しない
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // 同上
    }
  },
};

export const useTeamViewStore = create<TeamViewState & TeamViewActions>()(
  persist(
    (set) => ({
      lastTeamId: null,
      byTeam: {},
      recordVisit: (teamId, adminView) =>
        set((state) => ({
          lastTeamId: teamId,
          byTeam: { ...state.byTeam, [teamId]: { ...state.byTeam[teamId], adminView } },
        })),
      setTab: (teamId, tab) =>
        set((state) => {
          if (state.byTeam[teamId]?.tab === tab) return state;
          return { byTeam: { ...state.byTeam, [teamId]: { ...state.byTeam[teamId], tab } } };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ lastTeamId: state.lastTeamId, byTeam: state.byTeam }),
      // 壊れた値・別形式の値が残っていても既定値に倒す。
      // 旧タブ構成の ID (practices など) が保存されていたら新しいタブへ読み替える
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<TeamViewState>;
        const byTeam: Record<string, TeamViewPrefs> = {};
        for (const [teamId, prefs] of Object.entries(saved.byTeam ?? {})) {
          const tab = resolveTeamTabParam(prefs?.tab)?.tab;
          byTeam[teamId] = { adminView: prefs?.adminView === true, ...(tab ? { tab } : {}) };
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
