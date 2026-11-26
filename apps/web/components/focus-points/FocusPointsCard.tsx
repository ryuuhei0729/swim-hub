"use client";

import React, { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { FOCUS_POINT_MAX_ACTIVE } from "@apps/shared/constants/focusPoints";
import { splitFocusPoints, useFocusPointsQuery } from "@apps/shared/hooks/queries/focusPoints";
import type { FocusPoint } from "@apps/shared/types";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import FocusPointFormModal from "./FocusPointFormModal";

interface FocusPointsCardProps {
  /** 身についたものの一覧も出す (目標ページ用。ダッシュボードでは出さない) */
  showMastered?: boolean;
}

const CARD_CLASS = "bg-white rounded-lg shadow p-4 sm:p-5";

/** 開いているフォーム。"create" = 新規作成、FocusPoint = その行の編集 */
type FormTarget = "create" | FocusPoint | null;

/**
 * フォーカスポイント (数字で測らない、泳ぎで意識すること) のカード。
 * ダッシュボードと目標ページの両方に置き、どちらからでも追加・編集できる。
 * 取り組み中は FOCUS_POINT_MAX_ACTIVE 個までで、超えて追加しようとするとカード内にエラーを出す
 */
export default function FocusPointsCard({ showMastered = false }: FocusPointsCardProps) {
  const t = useTranslations("focusPoints");
  const locale = useLocale() as SupportedLocale;
  const { supabase, user } = useAuth();
  const { data, isLoading, isError } = useFocusPointsQuery(supabase, user?.id);
  const { active, mastered } = useMemo(() => splitFocusPoints(data ?? []), [data]);

  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [showLimitError, setShowLimitError] = useState(false);

  const handleAdd = () => {
    if (active.length >= FOCUS_POINT_MAX_ACTIVE) {
      setShowLimitError(true);
      return;
    }
    setShowLimitError(false);
    setFormTarget("create");
  };

  const handleEdit = (point: FocusPoint) => {
    setShowLimitError(false);
    setFormTarget(point);
  };

  if (isLoading) {
    return (
      <section className={CARD_CLASS} aria-busy="true">
        <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-16 animate-pulse rounded bg-gray-100" />
      </section>
    );
  }

  return (
    <section className={CARD_CLASS} aria-labelledby="focus-points-heading" data-testid="focus-points-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="focus-points-heading" className="text-base font-semibold text-gray-900">
            {t("title")}
          </h2>
          {!isError && active.length > 0 && (
            <span className="text-xs text-gray-500">
              {t("count", { count: active.length, max: FOCUS_POINT_MAX_ACTIVE })}
            </span>
          )}
        </div>
        {!isError && active.length > 0 && (
          <button
            type="button"
            onClick={handleAdd}
            aria-label={t("addAria")}
            className="rounded-md px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
          >
            {t("add")}
          </button>
        )}
      </div>

      {isError ? (
        <p className="mt-3 text-sm text-red-600">{t("loadError")}</p>
      ) : active.length === 0 ? (
        <div className="mt-3 rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
          <p className="text-sm font-semibold text-gray-900">{t("emptyTitle")}</p>
          <p className="mt-1 text-xs text-gray-500">{t("emptyDescription")}</p>
          <button
            type="button"
            onClick={handleAdd}
            className="mt-3 inline-flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            {t("addAria")}
          </button>
        </div>
      ) : (
        <ol className="mt-2 divide-y divide-gray-100">
          {active.map((point, index) => (
            <li key={point.id}>
              <button
                type="button"
                onClick={() => handleEdit(point)}
                aria-label={t("editAria", { title: point.title })}
                className="flex w-full items-start gap-3 rounded-md px-1 py-2.5 text-left hover:bg-gray-50"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 break-words">
                    {point.title}
                  </span>
                  {point.note && (
                    <span className="mt-0.5 block truncate text-xs text-gray-500">{point.note}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {showLimitError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {t("limitError", { max: FOCUS_POINT_MAX_ACTIVE })}
        </p>
      )}

      {showMastered && !isError && mastered.length > 0 && (
        <details className="mt-3 border-t border-gray-100 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            {t("masteredTitle", { count: mastered.length })}
          </summary>
          <ul className="mt-2 divide-y divide-gray-100">
            {mastered.map((point) => (
              <li key={point.id}>
                <button
                  type="button"
                  onClick={() => handleEdit(point)}
                  aria-label={t("editAria", { title: point.title })}
                  className="w-full rounded-md px-1 py-2 text-left hover:bg-gray-50"
                >
                  <span className="block text-sm text-gray-800 break-words">{point.title}</span>
                  <span className="block text-xs text-gray-500">
                    {t("masteredOn", { date: formatDate(point.mastered_at, "numeric", locale) })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {formTarget !== null && (
        <FocusPointFormModal
          focusPoint={formTarget === "create" ? null : formTarget}
          onClose={() => setFormTarget(null)}
        />
      )}
    </section>
  );
}
