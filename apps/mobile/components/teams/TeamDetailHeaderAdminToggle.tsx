import React from "react";
import { AdminViewToggle } from "./AdminViewToggle";
import { useTeamAdminViewStore } from "@/stores/teamAdminViewStore";

/**
 * TeamDetailScreen のヘッダー右側に配置する管理者ビュー切替スイッチ。
 *
 * navigation.setOptions の headerRight は isCurrentUserAdmin が変わったときのみ
 * 呼び出し、スイッチの値そのものはこのコンポーネントが useTeamAdminViewStore を
 * 直接購読して再レンダリングする（native-stack のヘッダーポータルへ setOptions で
 * props を都度再注入する経路に依存すると、ネイティブ側のコミットが1操作分遅延し
 * タップ2回で切り替わる不具合が起きるため）。
 */
export const TeamDetailHeaderAdminToggle: React.FC = () => {
  const isAdminView = useTeamAdminViewStore((state) => state.isAdminView);
  const setIsAdminView = useTeamAdminViewStore((state) => state.setIsAdminView);

  return <AdminViewToggle value={isAdminView} onValueChange={setIsAdminView} />;
};
