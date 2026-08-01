// =============================================================================
// チーム詳細画面: 管理者ビュー/利用者ビュー切替用Zustandストア（モバイル版）
// =============================================================================
// TeamDetailScreen 本体とヘッダー右側の TeamDetailHeaderAdminToggle
// (components/teams/TeamDetailHeaderAdminToggle.tsx) が、この状態を共有購読する。
//
// 従来は isAdminView を TeamDetailScreen のローカル state にし、
// navigation.setOptions({ headerRight: () => <AdminViewToggle value={isAdminView} .../> })
// で毎回ヘッダーに props を再注入していたが、native-stack (react-native-screens) の
// ヘッダーポータル (ScreenStackHeaderRightView) 経由での props 再注入は
// ネイティブ側のコミットが1操作分遅延し、1タップでは切り替わらない不具合があった。
// 値そのものをこのストアに一元化し、TeamDetailScreen 本体とヘッダーの
// TeamDetailHeaderAdminToggle の両方が Zustand の購読機構で直接再レンダリングされる
// ようにすることで、setOptions の呼び出しタイミングに依存しなくなる。

import { create } from "zustand";

interface TeamAdminViewState {
  isAdminView: boolean;
  setIsAdminView: (value: boolean) => void;
  reset: () => void;
}

export const useTeamAdminViewStore = create<TeamAdminViewState>((set) => ({
  isAdminView: false,
  setIsAdminView: (value) => set({ isAdminView: value }),
  reset: () => set({ isAdminView: false }),
}));
