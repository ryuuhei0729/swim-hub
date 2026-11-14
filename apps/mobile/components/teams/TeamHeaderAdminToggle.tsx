import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { AdminViewToggle } from "./AdminViewToggle";
import { useTeamViewStore } from "@/stores/teamViewStore";
import { useToast } from "@/providers/ToastProvider";

/**
 * チームタブのヘッダー右側に置く管理者ビュー切替スイッチ (管理者にだけ出す)。
 * 値はチームごとに useTeamViewStore に保存され、次に開いたときもそのまま復元される。
 *
 * 切り替えると、記録の保存成功時と同じトーストで「〜ビューに切り替えました」と知らせる
 * (スイッチの位置だけでは今どちらのビューか気づきにくいため)。
 */
export const TeamHeaderAdminToggle: React.FC<{ teamId: string }> = ({ teamId }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const isAdminView = useTeamViewStore((state) => state.byTeam[teamId]?.adminView === true);
  const setAdminView = useTeamViewStore((state) => state.setAdminView);

  const handleChange = useCallback(
    (value: boolean) => {
      setAdminView(teamId, value);
      toast.success(
        value
          ? t("teams.mobile.adminToggle.switchedToAdmin")
          : t("teams.mobile.adminToggle.switchedToUser"),
      );
    },
    [setAdminView, teamId, toast, t],
  );

  return <AdminViewToggle value={isAdminView} onValueChange={handleChange} />;
};
