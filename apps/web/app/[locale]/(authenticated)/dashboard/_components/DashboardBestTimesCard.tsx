"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import { DocumentArrowUpIcon, TrophyIcon } from "@heroicons/react/24/outline";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/contexts";
import { useBestTimesQuery } from "@apps/shared/hooks/queries/records";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { resolveAgeCategory } from "@apps/shared/utils/domesticRecords";
import BestTimesTable from "@/components/profile/BestTimesTable";

/**
 * ダッシュボードのベストタイム欄。
 * 2026-11-07 にマイページから見出し・一括入力・表をそのまま移した (マイページからは削除)。
 */
export default function DashboardBestTimesCard() {
  const { supabase, user } = useAuth();
  const t = useTranslations("mypage");
  const tDashboard = useTranslations("dashboard.bestTimes");
  const { data: bestTimes = [], isLoading, isError } = useBestTimesQuery(supabase, {
    userId: user?.id,
  });
  const { profile } = useUserQuery(supabase, { enableRealtime: false });
  // 年齢別ポイント比較用の区分。生の birthday はテーブルコンポーネントへ渡さない
  // (必要なのは区分だけ。生年月日は gender より機微度が高い)
  const ageCategory = useMemo(() => resolveAgeCategory(profile?.birthday), [profile?.birthday]);

  return (
    <section className="bg-white rounded-lg shadow p-4 sm:p-6" data-testid="dashboard-best-times">
      <div className="flex flex-row items-center justify-between mb-4">
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          <TrophyIcon className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
          <h2 className="text-base sm:text-2xl font-semibold text-gray-900">{t("bestTime.title")}</h2>
        </div>
        <Link
          href="/bulk-besttime"
          className="inline-flex items-center justify-center px-2 sm:px-3 py-1 sm:py-2 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          <DocumentArrowUpIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
          {t("bulkInput")}
        </Link>
      </div>
      {isLoading ? (
        <div className="h-48 animate-pulse rounded bg-gray-100" aria-busy="true" />
      ) : isError ? (
        <p className="text-sm text-red-600">{tDashboard("loadError")}</p>
      ) : (
        <BestTimesTable bestTimes={bestTimes} gender={profile?.gender} ageCategory={ageCategory} />
      )}
    </section>
  );
}
