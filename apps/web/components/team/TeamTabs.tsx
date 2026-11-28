"use client";

import React from "react";
import {
  UsersIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { TEAM_TAB_DEFS, type TeamTabType } from "./teamTabDefs";

// タブの定義元は ./teamTabDefs.ts の 1 本。ここは描画だけを担う
export type { TeamTabType };

const TAB_ICONS: Record<TeamTabType, React.ComponentType<{ className?: string }>> = {
  members: UsersIcon,
  schedule: CalendarDaysIcon,
  attendance: ClipboardDocumentCheckIcon,
  others: Squares2X2Icon,
};

export interface TeamTabsProps {
  activeTab: TeamTabType;
  onTabChange: (tab: TeamTabType) => void;
  /** 承認待ちメンバー数 (管理者ビューのメンバータブにバッジ表示) */
  pendingCount?: number;
}

/**
 * チーム画面のタブ (利用者ビュー・管理者ビュー共通)。
 * メンバー・予定・出欠・その他 の 4 タブを均等幅で並べる (mobile の TeamTabs と同じ)。
 * タブの数・位置は管理者ビューでも変えない。
 */
export default function TeamTabs({ activeTab, onTabChange, pendingCount = 0 }: TeamTabsProps) {
  const t = useTranslations("teams");

  return (
    <div className="bg-white rounded-lg shadow">
      <nav className="flex border-b border-gray-200" role="tablist" aria-label="Tabs">
        {TEAM_TAB_DEFS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const isActive = activeTab === tab.id;
          const name = t(tab.labelKey);
          const badgeCount = tab.id === "members" ? pendingCount : 0;
          const showBadge = badgeCount > 0;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={
                showBadge ? t("mobile.tabBadgeAria", { name, count: badgeCount }) : undefined
              }
              onClick={() => onTabChange(tab.id)}
              data-testid={`team-tab-${tab.id}`}
              className={`flex flex-1 min-w-0 items-center justify-center gap-1 sm:gap-2 py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors duration-200 whitespace-nowrap ${
                isActive
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon
                className={`h-4 w-4 sm:h-5 sm:w-5 shrink-0 ${isActive ? "text-blue-600" : "text-gray-400"}`}
              />
              <span className="truncate">{name}</span>
              {showBadge && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full shrink-0">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
