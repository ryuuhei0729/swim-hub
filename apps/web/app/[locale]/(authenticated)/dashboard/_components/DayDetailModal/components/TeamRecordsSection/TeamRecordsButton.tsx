"use client";

import { useTranslations } from "next-intl";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import type { TeamRecordsButtonProps } from "../../types";

/**
 * 「チームの記録を見る」。日付詳細には自分の記録だけを出すので、メンバー全員の記録は
 * チーム画面の予定タブで開く詳細で見る (押したときの遷移は DayDetailModal が持つ)
 */
export function TeamRecordsButton({ onClick }: TeamRecordsButtonProps) {
  const t = useTranslations("dashboard");
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors text-sm whitespace-nowrap"
      data-testid="view-team-records-button"
    >
      <UserGroupIcon className="h-4 w-4" aria-hidden="true" />
      <span>{t("dayDetail.viewTeamRecords")}</span>
    </button>
  );
}
