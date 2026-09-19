"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  MegaphoneIcon,
  UsersIcon,
  ClockIcon,
  TrophyIcon,
  ChartBarIcon,
  CogIcon,
  ClipboardDocumentCheckIcon,
  DocumentArrowUpIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

/**
 * 管理者タブの定義。**タブを増やすときはここだけを直す。**
 *
 * 以前は「union 型」「表示用の配列」「URL クエリのホワイトリスト
 * (`_client/TeamAdminClient.tsx`)」の3箇所に同じ ID 列があり、ホワイトリストの
 * 更新を忘れると `?tab=xxx` が型エラーも lint エラーも出さずに黙って無視される
 * 罠になっていた。型・表示順・ホワイトリスト判定をすべてこの配列から導出する。
 *
 * ⚠️ `id` と i18n キーは一致しない (`bulk-register` → `tabs.bulkRegister`) ため
 * `labelKey` を明示的に持つ。
 *
 * 配列の順序が画面上のタブの並び順になる。
 */
const TEAM_ADMIN_TAB_DEFS = [
  { id: "attendance", labelKey: "tabs.attendance", icon: ClipboardDocumentCheckIcon },
  { id: "announcements", labelKey: "tabs.announcements", icon: MegaphoneIcon },
  { id: "members", labelKey: "tabs.members", icon: UsersIcon },
  { id: "groups", labelKey: "tabs.groups", icon: TagIcon },
  { id: "practices", labelKey: "tabs.practices", icon: ClockIcon },
  { id: "competitions", labelKey: "tabs.competitions", icon: TrophyIcon },
  { id: "rankings", labelKey: "tabs.rankings", icon: ChartBarIcon },
  { id: "bulk-register", labelKey: "tabs.bulkRegister", icon: DocumentArrowUpIcon },
  { id: "settings", labelKey: "tabs.settings", icon: CogIcon },
] as const;

export type TeamAdminTabType = (typeof TEAM_ADMIN_TAB_DEFS)[number]["id"];

/** URL の `?tab=` を `TeamAdminTabType` に絞り込む。定義元は `TEAM_ADMIN_TAB_DEFS` の1箇所のみ。 */
export function isTeamAdminTabType(value: string): value is TeamAdminTabType {
  return TEAM_ADMIN_TAB_DEFS.some((tab) => tab.id === value);
}

export interface TeamAdminTab {
  id: TeamAdminTabType;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
}

export interface TeamAdminTabsProps {
  activeTab: TeamAdminTabType;
  onTabChange: (tab: TeamAdminTabType) => void;
  pendingCount?: number;
}

export default function TeamAdminTabs({
  activeTab,
  onTabChange,
  pendingCount = 0,
}: TeamAdminTabsProps) {
  const t = useTranslations("teamsAdmin");

  const adminTabs: TeamAdminTab[] = TEAM_ADMIN_TAB_DEFS.map((tab) => ({
    id: tab.id,
    name: t(tab.labelKey),
    icon: tab.icon,
  }));

  return (
    <div className="bg-white rounded-lg shadow">
      {/* タブナビゲーション */}
      <div className="border-b border-gray-200 overflow-x-auto scrollbar-hide">
        <nav className="flex space-x-2 sm:space-x-4 md:space-x-8 px-2 sm:px-6" aria-label="Tabs">
          {adminTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const showBadge = tab.id === "members" && pendingCount > 0;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors duration-200 relative whitespace-nowrap
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
                {showBadge && (
                  <span className="ml-1 sm:ml-2 inline-flex items-center justify-center px-1.5 sm:px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full shrink-0">
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
