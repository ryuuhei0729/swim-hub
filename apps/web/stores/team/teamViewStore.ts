// =============================================================================
// チーム画面の表示状態ストア（Web 版）
// =============================================================================
// モバイルの stores/teamViewStore.ts と同じ考え方で、ブラウザに次の2つを覚える:
//   - lastTeamId: 最後に開いたチーム (サイドバーの「チーム」から直接そこへ戻る)
//   - byTeam[teamId].adminView: そのチームを最後に管理者ビューで見ていたか
//
// Web では利用者ビュー = /teams/[teamId]、管理者ビュー = /teams-admin/[teamId] と
// ルートが分かれているので、ON/OFF はスイッチで直接書き換えず
// 「最後に開いたルート」を各ページのマウント時に記録する (recordVisit)。
// これで RecordClient などからの /teams-admin へのリンクで戻ってきた場合も一貫する。
//
// ⚠️ adminView はあくまで「表示の好み」であり、権限ではない。
// 管理者ビューへ送るかどうかは必ず実際の role と AND を取る (utils/teamView.ts)。
// 管理者ページ自体もサーバー側 (TeamAdminDataLoader) で権限を確認している。
//
// ⚠️ 描画中に読むと SSR (初期値) とハイドレーション後 (localStorage) で値が食い違うため、
// イベントハンドラ・effect の中で getState() で読むこと。

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface TeamViewPrefs {
  adminView?: boolean;
}

interface TeamViewState {
  lastTeamId: string | null;
  byTeam: Record<string, TeamViewPrefs>;
}

interface TeamViewActions {
  /** チームのページを開いたときに、どのビューで開いたかを記録する */
  recordVisit: (teamId: string, adminView: boolean) => void;
}

const STORAGE_KEY = "team-view";

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
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lastTeamId: state.lastTeamId, byTeam: state.byTeam }),
      // 壊れた値・別形式の値が残っていても既定値に倒す
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<TeamViewState>;
        const byTeam: Record<string, TeamViewPrefs> = {};
        for (const [teamId, prefs] of Object.entries(saved.byTeam ?? {})) {
          byTeam[teamId] = { adminView: prefs?.adminView === true };
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
