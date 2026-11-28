"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import BaseModal from "@/components/ui/BaseModal";
import CompetitionDateDaysFields from "@/components/forms/CompetitionDateDaysFields";
import {
  competitionDaysFromRange,
  competitionEndDateFromDays,
} from "@apps/shared/utils/competitionDays";
import type { CompetitionDraft } from "@apps/shared/utils/bulkRegisterCalendar";

interface CompetitionDraftModalProps {
  /** 開いたときの内容 (呼び出し側は開くたびに key を変えて作り直す) */
  draft: CompetitionDraft;
  isEditing: boolean;
  /** 指定期間に他の大会 (登録済み・追加予定) があるか */
  hasOverlap: (date: string, days: number, excludeId: string | null) => boolean;
  onSave: (draft: CompetitionDraft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const POOL_TYPES = [
  { value: 0, labelKey: "poolTypeShort" },
  { value: 1, labelKey: "poolTypeLong" },
] as const;

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

/**
 * 一括登録で大会を追加・編集するモーダル (日程はカレンダーでクリックした日が入り、ここでも変更できる)。
 * mobile components/teams/bulkRegister/CompetitionDraftSheet.tsx と同じ項目・注意表示にする。
 */
export default function CompetitionDraftModal({
  draft,
  isEditing,
  hasOverlap,
  onSave,
  onDelete,
  onClose,
}: CompetitionDraftModalProps) {
  const t = useTranslations("teams.mobile.bulkRegister");
  const tMobile = useTranslations("teams.mobile");
  const tCompetitionForm = useTranslations("competition.form");
  const tCommon = useTranslations("common");
  const [local, setLocal] = useState<CompetitionDraft>(draft);

  const update = <K extends keyof CompetitionDraft>(key: K, value: CompetitionDraft[K]) =>
    setLocal((prev) => ({ ...prev, [key]: value }));

  const overlap = hasOverlap(local.date, local.days, isEditing ? local.id : null);

  return (
    <BaseModal
      isOpen
      onClose={onClose}
      title={isEditing ? t("editCompetitionTitle") : t("addCompetitionTitle")}
    >
      <div className="space-y-4">
        <CompetitionDateDaysFields
          date={local.date}
          endDate={local.days > 1 ? competitionEndDateFromDays(local.date, local.days) : ""}
          onChange={(date, endDate) =>
            // 開始日は空にしない (カレンダーの帯の起点になるため)
            setLocal((prev) => ({
              ...prev,
              date: date || prev.date,
              days: competitionDaysFromRange(date || prev.date, endDate),
            }))
          }
          startLabel={t("labelSchedule")}
          required
          testIdPrefix="bulk-competition-draft"
        />

        <div>
          <label htmlFor="bulk-competition-draft-title" className="mb-1 block text-sm font-medium text-gray-700">
            {t("labelCompetitionName")}
          </label>
          <input
            id="bulk-competition-draft-title"
            type="text"
            value={local.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder={tMobile("bulkCompetitionNamePlaceholder")}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="bulk-competition-draft-place" className="mb-1 block text-sm font-medium text-gray-700">
            {t("labelPlace")}
          </label>
          <input
            id="bulk-competition-draft-place"
            type="text"
            value={local.place}
            onChange={(e) => update("place", e.target.value)}
            placeholder={tMobile("bulkPlacePlaceholder")}
            className={inputClass}
          />
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">{t("labelPoolType")}</span>
          <div className="flex gap-2">
            {POOL_TYPES.map((p) => {
              const active = local.poolType === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => update("poolType", p.value)}
                  aria-pressed={active}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                    active
                      ? "border-blue-600 bg-blue-50 text-blue-800"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {tCompetitionForm(p.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {local.noteOpen ? (
          <div>
            <label htmlFor="bulk-competition-draft-note" className="mb-1 block text-sm font-medium text-gray-700">
              {t("labelMemo")}
            </label>
            <textarea
              id="bulk-competition-draft-note"
              value={local.note}
              onChange={(e) => update("note", e.target.value)}
              placeholder={tMobile("bulkMemoPlaceholder")}
              rows={3}
              className={inputClass}
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => update("noteOpen", true)}
            className="rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-500 hover:bg-gray-50"
          >
            {t("addMemo")}
          </button>
        )}

        {overlap && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
            {t("overlapWarning")}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
          {isEditing && (
            <button
              type="button"
              onClick={() => onDelete(local.id)}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              {tCommon("delete")}
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave(local)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {isEditing ? tCommon("save") : tCommon("add")}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
