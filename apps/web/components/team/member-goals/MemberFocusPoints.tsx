"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { useTeamMemberFocusPointsQuery } from "@apps/shared/hooks/queries/teamMemberFocusPoints";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";

interface MemberFocusPointsProps {
  teamId: string;
  memberId: string;
}

/**
 * 管理者向け「目標」タブの、選んだメンバーのフォーカスポイント (読み取り専用)。
 * 取り組み中を番号付きで並べ、身についたものは折りたたんで出す。
 * 大会目標・マイルストーンとは別のクエリなので、こちらだけ失敗しても目標は見られる
 */
export default function MemberFocusPoints({ teamId, memberId }: MemberFocusPointsProps) {
  const t = useTranslations("teamMemberGoals");
  const locale = useLocale() as SupportedLocale;
  const { supabase } = useAuth();
  const query = useTeamMemberFocusPointsQuery(supabase, teamId, memberId);

  const points = query.data ?? [];
  const active = points.filter((p) => p.status === "active");
  const mastered = points.filter((p) => p.status === "mastered");

  return (
    <section
      aria-labelledby="member-focus-points-heading"
      className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4"
      data-testid="member-focus-points"
    >
      <div className="flex items-baseline gap-2">
        <h3 id="member-focus-points-heading" className="text-sm font-semibold text-gray-700">
          {t("focusPoints.title")}
        </h3>
        {query.isSuccess && active.length > 0 && (
          <span className="text-xs text-gray-500">
            {t("focusPoints.activeCount", { count: active.length })}
          </span>
        )}
      </div>

      {query.isPending ? (
        <div className="mt-3 animate-pulse space-y-2" role="status" aria-label={t("focusPoints.title")}>
          <div className="h-5 rounded bg-gray-100" />
          <div className="h-5 rounded bg-gray-100" />
        </div>
      ) : query.isError ? (
        <div className="mt-3" role="alert">
          <p className="text-sm text-red-600">
            {toUserFacingMessage(query.error, t("focusPoints.loadError"))}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("retry")}
          </button>
        </div>
      ) : points.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">{t("focusPoints.empty")}</p>
      ) : (
        <>
          {active.length > 0 && (
            <ol className="mt-2 divide-y divide-gray-100">
              {active.map((point, index) => (
                <li key={point.id} className="flex items-start gap-3 py-2">
                  <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 px-1 text-xs font-bold text-blue-700">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 break-words">
                      {point.title}
                    </span>
                    {point.note && (
                      <span className="mt-0.5 block text-xs text-gray-500 break-words">{point.note}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {mastered.length > 0 && (
            <details className="mt-2 border-t border-gray-100 pt-2">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">
                {t("focusPoints.masteredTitle", { count: mastered.length })}
              </summary>
              <ul className="mt-1 divide-y divide-gray-100">
                {mastered.map((point) => (
                  <li key={point.id} className="py-2">
                    <span className="block text-sm text-gray-800 break-words">{point.title}</span>
                    <span className="block text-xs text-gray-500">
                      {t("focusPoints.masteredOn", {
                        date: formatDate(point.mastered_at, "numeric", locale),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
