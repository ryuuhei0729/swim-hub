import React from "react";
import { AdminViewToggle } from "./AdminViewToggle";
import { useTeamViewStore } from "@/stores/teamViewStore";

/**
 * チームタブのヘッダー右側に置く管理者ビュー切替スイッチ (管理者にだけ出す)。
 * 値はチームごとに useTeamViewStore に保存され、次に開いたときもそのまま復元される。
 */
export const TeamHeaderAdminToggle: React.FC<{ teamId: string }> = ({ teamId }) => {
  const isAdminView = useTeamViewStore((state) => state.byTeam[teamId]?.adminView === true);
  const setAdminView = useTeamViewStore((state) => state.setAdminView);

  return (
    <AdminViewToggle value={isAdminView} onValueChange={(value) => setAdminView(teamId, value)} />
  );
};
