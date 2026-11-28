"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import BaseModal from "@/components/ui/BaseModal";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import {
  EMPTY_PRACTICE_FIELDS,
  type ExistingScheduleMap,
  type PracticeFields,
} from "@apps/shared/utils/bulkRegisterCalendar";

interface PracticePerDayModalProps {
  isOpen: boolean;
  dates: readonly string[];
  common: PracticeFields;
  overrides: Readonly<Record<string, PracticeFields>>;
  existing: ExistingScheduleMap;
  onChangeOverride: (date: string, next: PracticeFields) => void;
  onRemoveDate: (date: string) => void;
  onClose: () => void;
}

const inputBase =
  "w-full rounded-md border px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

/**
 * 選んだ練習日ごとに、タイトル・場所・メモを上書きするモーダル (空欄は共通の内容になる)。
 * mobile components/teams/bulkRegister/PracticePerDaySheet.tsx と同じ。
 */
export default function PracticePerDayModal({
  isOpen,
  dates,
  common,
  overrides,
  existing,
  onChangeOverride,
  onRemoveDate,
  onClose,
}: PracticePerDayModalProps) {
  const t = useTranslations("teams.mobile.bulkRegister");
  const locale = useLocale() as SupportedLocale;

  const inputClass = (overridden: boolean) =>
    `${inputBase} ${overridden ? "border-green-400 bg-green-50" : "border-gray-300 bg-white"}`;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={t("perDayTitle")} size="lg">
      <p className="mb-3 text-xs text-gray-500">{t("perDayHint")}</p>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {dates.map((date) => {
          const o = overrides[date] ?? EMPTY_PRACTICE_FIELDS;
          const set = (patch: Partial<PracticeFields>) => onChangeOverride(date, { ...o, ...patch });
          const dateLabel = formatDate(date, "shortWithWeekday", locale);
          return (
            <div key={date} className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{dateLabel}</span>
                  {existing[date]?.competition && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">
                      {t("sameDayAsCompetition")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveDate(date)}
                  className="text-xs font-bold text-red-600 hover:underline"
                >
                  {t("removeDay")}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={o.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder={common.title || t("labelTitle")}
                  aria-label={`${dateLabel} ${t("labelTitle")}`}
                  className={inputClass(!!o.title)}
                />
                <input
                  type="text"
                  value={o.place}
                  onChange={(e) => set({ place: e.target.value })}
                  placeholder={common.place || t("labelPlace")}
                  aria-label={`${dateLabel} ${t("labelPlace")}`}
                  className={inputClass(!!o.place)}
                />
              </div>
              {o.noteOpen ? (
                <textarea
                  value={o.note}
                  onChange={(e) => set({ note: e.target.value })}
                  placeholder={common.note || t("labelMemo")}
                  aria-label={`${dateLabel} ${t("labelMemo")}`}
                  rows={2}
                  className={`mt-2 ${inputClass(!!o.note)}`}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => set({ noteOpen: true })}
                  className="mt-2 rounded-md border border-dashed border-gray-300 px-3 py-1 text-xs font-bold text-gray-500 hover:bg-gray-50"
                >
                  {t("addMemo")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </BaseModal>
  );
}
