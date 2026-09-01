"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { WaPointsInfoTooltip } from "@/components/ui/WaPointsInfoTooltip";

interface WaPointsCompareButtonProps {
  onClick: () => void;
}

/**
 * 「WAポイントで比較」ボタン + info アイコン (hover/フォーカスで説明を表示)
 *
 * MemberGroupSorter が `categories.length === 0` で null を返すのとは独立に、
 * TeamMemberManagement 側で常時レンダリングされる位置に配置される想定。
 */
export const WaPointsCompareButton: React.FC<WaPointsCompareButtonProps> = ({ onClick }) => {
  const t = useTranslations("teams.waPointsCompare");

  return (
    <div className="relative inline-block shrink-0">
      <button
        type="button"
        onClick={onClick}
        data-testid="team-wa-points-button"
        className="px-2.5 py-1 text-xs rounded-full border border-blue-300 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
      >
        {t("buttonLabel")}
      </button>

      {/* info マーク（ボタン右上） */}
      <WaPointsInfoTooltip
        buttonTestId="team-wa-points-info-button"
        tooltipTestId="team-wa-points-info-tooltip"
      />
    </div>
  );
};
