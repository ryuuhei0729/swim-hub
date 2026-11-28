"use client";

import React from "react";
import { useTranslations } from "next-intl";

interface MemberStatsHeaderProps {
  totalMembers: number;
  includeRelaying: boolean;
  onToggleRelaying: (value: boolean) => void;
}

/**
 * メンバー統計表示とリレー含む/含まないトグル。
 * メンバー数は mobile (TeamMemberList) と同じく合計だけを出す (管理者・一般の内訳は出さない)
 */
export const MemberStatsHeader: React.FC<MemberStatsHeaderProps> = ({
  totalMembers,
  includeRelaying,
  onToggleRelaying,
}) => {
  const t = useTranslations("teams");

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-gray-900">{t("memberStats.title", { count: totalMembers })}</h2>
        <label className="flex items-center space-x-2 text-sm">
          <input
            type="checkbox"
            checked={includeRelaying}
            onChange={(e) => onToggleRelaying(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-gray-700">{t("memberStats.includeRelay")}</span>
        </label>
      </div>
      <div className="flex items-center space-x-4 text-sm text-gray-600">
        <span data-testid="team-member-count-total">
          {t("memberStats.totalLabel", { count: totalMembers })}
        </span>
      </div>
    </div>
  );
};
