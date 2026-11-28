"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import BaseModal from "@/components/ui/BaseModal";
import type { BulkRegisterInput } from "@apps/shared/api/teams/bulkRegister";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";

interface BulkRegisterConfirmModalProps {
  isOpen: boolean;
  input: BulkRegisterInput;
  submitting: boolean;
  /** 登録で一部失敗したときのエラー (モーダルを開いたまま表示する) */
  error: string | null;
  onSubmit: () => void;
  onClose: () => void;
}

/** カレンダー型一括登録の登録前確認 (mobile BulkRegisterConfirmSheet と同じ内容) */
export default function BulkRegisterConfirmModal({
  isOpen,
  input,
  submitting,
  error,
  onSubmit,
  onClose,
}: BulkRegisterConfirmModalProps) {
  const t = useTranslations("teams.mobile.bulkRegister");
  const tMobile = useTranslations("teams.mobile");
  const tCompetitionForm = useTranslations("competition.form");
  const tCommon = useTranslations("common");
  const tAdmin = useTranslations("teamsAdmin.bulkRegister");
  const locale = useLocale() as SupportedLocale;
  const total = input.practices.length + input.competitions.length;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title={t("confirmTitle")}
      size="lg"
    >
      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        {input.practices.length > 0 && (
          <section>
            <h4 className="mb-1 text-sm font-bold text-green-700">
              {t("previewSectionPractices", { count: input.practices.length })}
            </h4>
            <ul className="divide-y divide-gray-100">
              {input.practices.map((p) => (
                <li key={p.date} className="flex gap-3 py-1.5 text-sm">
                  <span className="w-28 shrink-0 font-medium text-gray-900">
                    {formatDate(p.date, "shortWithWeekday", locale)}
                  </span>
                  <span className="min-w-0 text-gray-600">
                    {[p.title || tMobile("fallbackPractice"), p.place, p.note].filter(Boolean).join(" / ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {input.competitions.length > 0 && (
          <section>
            <h4 className="mb-1 text-sm font-bold text-blue-800">
              {t("previewSectionCompetitions", { count: input.competitions.length })}
            </h4>
            <ul className="divide-y divide-gray-100">
              {input.competitions.map((c, i) => (
                <li key={`${c.date}-${i}`} className="flex gap-3 py-1.5 text-sm">
                  <span className="w-28 shrink-0 font-medium text-gray-900">
                    {formatDate(c.date, "shortWithWeekday", locale)}
                    {c.end_date ? ` 〜 ${formatDate(c.end_date, "shortWithWeekday", locale)}` : ""}
                  </span>
                  <span className="min-w-0 text-gray-600">
                    {[
                      c.title || tMobile("fallbackCompetitionTitle"),
                      c.place,
                      c.pool_type === 1
                        ? tCompetitionForm("poolTypeLong")
                        : tCompetitionForm("poolTypeShort"),
                      c.note,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {tCommon("back")}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          aria-busy={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? tAdmin("manual.submitting") : t("confirmSubmit", { count: total })}
        </button>
      </div>
    </BaseModal>
  );
}
