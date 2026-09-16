"use client";

import React from "react";
import {
  UsersIcon,
  ClockIcon,
  TrophyIcon,
  ChartBarIcon,
  ClipboardDocumentCheckIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";

/**
 * タブの定義。**タブを増やすときはここだけを直す。**
 *
 * 以前は「union 型」「表示用の配列」「URL クエリのホワイトリスト
 * (`_client/TeamDetailClient.tsx`)」の3箇所に同じ ID 列があり、ホワイトリストの
 * 更新を忘れると `?tab=xxx` が型エラーも lint エラーも出さずに黙って無視される
 * 罠になっていた。型・表示順・ホワイトリスト判定をすべてこの配列から導出する。
 *
 * 配列の順序が画面上のタブの並び順になる。
 */
const TEAM_TAB_DEFS = [
  { id: "attendance", labelKey: "tabs.attendance", icon: ClipboardDocumentCheckIcon },
  { id: "members", labelKey: "tabs.members", icon: UsersIcon },
  { id: "practices", labelKey: "tabs.practices", icon: ClockIcon },
  { id: "competitions", labelKey: "tabs.competitions", icon: TrophyIcon },
  { id: "rankings", labelKey: "tabs.rankings", icon: ChartBarIcon },
  // 設定は管理者限定ではない。招待コード・カレンダー記録色・脱退は全メンバーの操作
  { id: "settings", labelKey: "tabs.settings", icon: Cog6ToothIcon },
] as const;

export type TeamTabType = (typeof TEAM_TAB_DEFS)[number]["id"];

/** URL の `?tab=` を `TeamTabType` に絞り込む。定義元は `TEAM_TAB_DEFS` の1箇所のみ。 */
export function isTeamTabType(value: string): value is TeamTabType {
  return TEAM_TAB_DEFS.some((tab) => tab.id === value);
}

export interface TeamTab {
  id: TeamTabType;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface TeamTabsProps {
  activeTab: TeamTabType;
  onTabChange: (tab: TeamTabType) => void;
  isAdmin?: boolean;
}

export default function TeamTabs({ activeTab, onTabChange }: TeamTabsProps) {
  const t = useTranslations("teams");

  const tabs: TeamTab[] = TEAM_TAB_DEFS.map((tab) => ({
    id: tab.id,
    name: t(tab.labelKey),
    icon: tab.icon,
  }));

  // 一般ページは閲覧専用のため、全てのタブを表示（isAdminは使用しない）
  const visibleTabs = tabs;

  return (
    <div className="bg-white rounded-lg shadow">
      {/* タブナビゲーション */}
      <div className="border-b border-gray-200 overflow-x-auto scrollbar-hide">
        <nav className="flex space-x-2 sm:space-x-4 md:space-x-8 px-2 sm:px-6" aria-label="Tabs">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors duration-200 whitespace-nowrap
                  ${
                    isActive
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }
                `}
              >
                <Icon
                  className={`h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2 shrink-0 ${isActive ? "text-blue-600" : "text-gray-400"}`}
                />
                <span className="hidden sm:inline">{tab.name}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
