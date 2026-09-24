import React from "react";
import { useTranslations } from "next-intl";
import { TrashIcon } from "@heroicons/react/24/outline";
import type { MemberDetail } from "@/types/member-detail";
import { WaPointsInfoTooltip } from "@/components/ui/WaPointsInfoTooltip";

interface AdminControlsProps {
  member: MemberDetail;
  isRemoving: boolean;
  onRoleChangeClick: (newRole: "admin" | "user") => void;
  onRemoveMember: () => void;
  onSwimmerStatusChange: (isSwimmer: boolean) => void;
}

export function AdminControls({
  member,
  isRemoving,
  onRoleChangeClick,
  onRemoveMember,
  onSwimmerStatusChange,
}: AdminControlsProps) {
  const t = useTranslations("teams.memberDetail.adminControls");
  const tNonSwimmer = useTranslations("teams.nonSwimmer");
  // is_swimmer===false のときのみ「非泳者」。undefined (DB の DEFAULT true が
  // 未反映のキャッシュ等) は泳者側をアクティブ表示する。
  const isSwimmer = member.is_swimmer !== false;
  return (
    <div className="mb-8">
      <h3 className="text-lg font-medium text-gray-900 mb-4">{t("sectionTitle")}</h3>
      <div className="flex items-center">
        {/* 権限切り替え + info (WaPointsCompareButton と同じ「relative inline-block でボタン
            群だけを包み、右上に info を重ねる」パターン。行全体を relative にすると
            info がトグルではなく行の右端を基準に飛んでしまう) */}
        <div className="relative inline-block shrink-0">
          <div
            className="flex items-center bg-gray-100 rounded-lg p-1"
            data-testid="team-member-role-toggle"
          >
            <button
              onClick={() => onRoleChangeClick("user")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                member.role === "user"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              data-testid="team-member-role-user-button"
            >
              {t("roleUser")}
            </button>
            <button
              onClick={() => onRoleChangeClick("admin")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                member.role === "admin"
                  ? "bg-yellow-100 text-yellow-800 shadow-sm"
                  : "text-gray-600 hover:text-yellow-700"
              }`}
              data-testid="team-member-role-admin-button"
            >
              {t("roleAdmin")}
            </button>
          </div>
          <WaPointsInfoTooltip
            buttonTestId="team-member-role-info-icon"
            ariaLabel={t("roleInfoAriaLabel")}
            tooltipText={t("roleInfoText")}
          />
        </div>

        {/* 削除ボタン (i アイコンとの間は広めに空ける) */}
        <button
          onClick={onRemoveMember}
          disabled={isRemoving}
          className="flex items-center space-x-2 px-4 py-2 ml-6 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          data-testid="team-member-remove-button"
        >
          <TrashIcon className="h-4 w-4" />
          <span>{isRemoving ? t("removing") : t("removeFromTeam")}</span>
        </button>
      </div>

      {/* 泳者設定 (権限切り替えと同じセグメントコントロールのパターン) */}
      <div className="mt-4 relative inline-block shrink-0">
        <div
          className="flex items-center bg-gray-100 rounded-lg p-1"
          data-testid="team-member-swimmer-toggle"
        >
          <button
            onClick={() => onSwimmerStatusChange(true)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              isSwimmer
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
            data-testid="team-member-swimmer-swimmer-button"
          >
            {tNonSwimmer("segmentSwimmer")}
          </button>
          <button
            onClick={() => onSwimmerStatusChange(false)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              !isSwimmer
                ? "bg-yellow-100 text-yellow-800 shadow-sm"
                : "text-gray-600 hover:text-yellow-700"
            }`}
            data-testid="team-member-swimmer-nonswimmer-button"
          >
            {tNonSwimmer("segmentNonSwimmer")}
          </button>
        </div>
        <WaPointsInfoTooltip
          buttonTestId="team-member-swimmer-info-icon"
          ariaLabel={tNonSwimmer("infoAriaLabel")}
          tooltipText={tNonSwimmer("infoText")}
        />
      </div>
    </div>
  );
}
