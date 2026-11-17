"use client";

import React, { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import DatePicker from "@/components/ui/DatePicker";
import NumberStepper from "@/components/ui/NumberStepper";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import {
  MAX_COMPETITION_DAYS,
  MIN_COMPETITION_DAYS,
  competitionDaysFromRange,
  competitionEndDateFromDays,
} from "@apps/shared/utils/competitionDays";

interface CompetitionDateDaysFieldsProps {
  /** 開始日 (yyyy-MM-dd) */
  date: string;
  /** 終了日 (yyyy-MM-dd、単日なら空文字) */
  endDate: string;
  /** 開始日・終了日の変更。日数の変更も終了日の変更として届く */
  onChange: (date: string, endDate: string) => void;
  startLabel: string;
  required?: boolean;
  disabled?: boolean;
  minDate?: Date;
  /** data-testid の接頭辞 (`${prefix}-date` / `${prefix}-days`) */
  testIdPrefix?: string;
}

/**
 * 大会の日程入力 (開始日 + 日数)。終了日は直接入れず、日数から計算して返す。
 * 開始日を変えても日数は保ち、終了日を同じだけずらす。
 */
export default function CompetitionDateDaysFields({
  date,
  endDate,
  onChange,
  startLabel,
  required,
  disabled,
  minDate,
  testIdPrefix = "competition",
}: CompetitionDateDaysFieldsProps) {
  const t = useTranslations("forms.competition");
  const locale = useLocale() as SupportedLocale;
  const days = competitionDaysFromRange(date, endDate);

  // 数字を打ち直す途中で欄を空にできるよう、空欄の間だけローカルに持つ (それ以外は日付から求めた日数)
  const [isDaysBlank, setIsDaysBlank] = useState(false);

  const handleDaysChange = (raw: string) => {
    if (raw === "") {
      setIsDaysBlank(true);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setIsDaysBlank(false);
    const clamped = Math.min(MAX_COMPETITION_DAYS, Math.max(MIN_COMPETITION_DAYS, Math.floor(n)));
    onChange(date, competitionEndDateFromDays(date, clamped));
  };

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
        <DatePicker
          label={startLabel}
          value={date}
          onChange={(next) => onChange(next, days > 1 ? competitionEndDateFromDays(next, days) : "")}
          required={required}
          disabled={disabled}
          minDate={minDate}
          placeholder={startLabel}
          data-testid={`${testIdPrefix}-date`}
        />
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-2">{t("days_label")}</span>
          <div className="flex items-center gap-1.5">
            <div className="w-28">
              <NumberStepper
                value={isDaysBlank ? "" : days}
                onChange={handleDaysChange}
                min={MIN_COMPETITION_DAYS}
                max={MAX_COMPETITION_DAYS}
                ariaLabel={t("days_label")}
                fieldLabel={t("days_label")}
                decreaseLabel={t("days_decrease")}
                increaseLabel={t("days_increase")}
                disabled={disabled || !date}
                data-testid={`${testIdPrefix}-days`}
              />
            </div>
            <span className="text-sm text-gray-600">{t("days_unit")}</span>
          </div>
        </div>
      </div>
      {days > 1 && endDate && (
        <p className="mt-1 text-xs text-gray-500" data-testid={`${testIdPrefix}-end-date-preview`}>
          {t("end_date_preview", { date: formatDate(endDate, "longWithWeekday", locale) })}
        </p>
      )}
    </div>
  );
}
