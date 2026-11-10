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
 * 2026-11-09 に「次の大会」と横並びにしたので、見出し・余白・表を詰め、見出しと一括入力を表の上下の段に入れた (ユーザー指定)。
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

  const title = (
    <h2 className="flex items-center gap-1.5 text-base font-semibold text-gray-900">
      <TrophyIcon className="h-5 w-5 text-yellow-500" aria-hidden="true" />
      {t("bestTime.title")}
    </h2>
  );
  const bulkInputLink = (
    <Link
      href="/bulk-besttime"
      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <DocumentArrowUpIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
      {t("bulkInput")}
    </Link>
  );

  // 見出しは表の上の段 (水路の切り替え・引き継ぎと同じ行)、一括入力は表の下の段 (点数化の右) に出す
  // (2026-11-09 ユーザー指定)。表を出せない読み込み中・エラー時はここで並べる
  return (
    <section className="bg-white rounded-lg shadow p-4 sm:p-5" data-testid="dashboard-best-times">
      {isLoading || isError ? (
        <>
          <div className="mb-3 flex items-center justify-between">
            {title}
            {bulkInputLink}
          </div>
          {isLoading ? (
            <div className="h-48 animate-pulse rounded bg-gray-100" aria-busy="true" />
          ) : (
            <p className="text-sm text-red-600">{tDashboard("loadError")}</p>
          )}
        </>
      ) : (
        <BestTimesTable
          bestTimes={bestTimes}
          gender={profile?.gender}
          ageCategory={ageCategory}
          title={title}
          footerAction={bulkInputLink}
        />
      )}
    </section>
  );
}
