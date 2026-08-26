"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

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
  const [showInfo, setShowInfo] = useState(false);

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
      <div className="absolute -top-1.5 -right-1.5 group/wainfo">
        <button
          type="button"
          data-testid="team-wa-points-info-button"
          aria-label={t("infoAriaLabel")}
          onClick={() => setShowInfo((v) => !v)}
          onBlur={() => setShowInfo(false)}
          className="sm:pointer-events-none flex items-center justify-center h-4 w-4 rounded-full bg-white text-gray-400 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <InformationCircleIcon className="h-4 w-4" />
        </button>

        {/* デスクトップ: hover またはキーボードフォーカスで表示（Tab フォーカスでも出る） */}
        <div
          role="tooltip"
          data-testid="team-wa-points-info-tooltip"
          className="hidden group-hover/wainfo:sm:block group-focus-within/wainfo:sm:block absolute z-20 top-full right-0 mt-1.5 w-64 max-w-[calc(100vw-2rem)] p-2.5 bg-gray-900 text-white text-xs rounded-md shadow-lg leading-relaxed"
        >
          {t("infoTooltip")}
        </div>

        {/* モバイル: タップトグル */}
        {showInfo && (
          <div
            role="tooltip"
            className="sm:hidden absolute z-20 top-full right-0 mt-1.5 w-64 max-w-[calc(100vw-2rem)] p-2.5 bg-gray-900 text-white text-xs rounded-md shadow-lg leading-relaxed"
          >
            {t("infoTooltip")}
          </div>
        )}
      </div>
    </div>
  );
};
