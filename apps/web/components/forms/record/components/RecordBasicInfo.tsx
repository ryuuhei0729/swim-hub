"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import DatePicker from "@/components/ui/DatePicker";
import type { RecordFormData } from "../types";
import { POOL_TYPES } from "../types";

interface RecordBasicInfoProps {
  formData: RecordFormData;
  onFieldChange: (field: keyof RecordFormData, value: string | number) => void;
  recordDateError?: string;
}

/**
 * 大会基本情報入力コンポーネント
 */
export default function RecordBasicInfo({
  formData,
  onFieldChange,
  recordDateError,
}: RecordBasicInfoProps) {
  const t = useTranslations("forms.record");
  return (
    <>
      {/* 大会日・開催地 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <DatePicker
            label={t("dateLabel")}
            value={formData.recordDate}
            onChange={(date) => onFieldChange("recordDate", date)}
            required
            error={recordDateError}
          />
        </div>
        <div>
          <label htmlFor="record-place" className="block text-sm font-medium text-gray-700 mb-2">
            {t("placeLabel")}
          </label>
          <Input
            id="record-place"
            type="text"
            value={formData.place}
            onChange={(e) => onFieldChange("place", e.target.value)}
            placeholder={t("placePlaceholder")}
            required
            data-testid="tournament-place"
          />
        </div>
      </div>

      {/* 大会名・プール種別 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <label
            htmlFor="competition-name"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {t("nameLabel")}
          </label>
          <Input
            id="competition-name"
            type="text"
            value={formData.competitionName}
            onChange={(e) => onFieldChange("competitionName", e.target.value)}
            placeholder={t("namePlaceholder")}
            required
            data-testid="tournament-name"
          />
        </div>
        <div>
          <label
            htmlFor="tournament-pool-type"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            {t("poolTypeLabel")}
          </label>
          <select
            id="tournament-pool-type"
            value={formData.poolType}
            onChange={(e) => onFieldChange("poolType", parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            data-testid="tournament-pool-type"
          >
            {POOL_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.value === 0 ? t("poolShort") : t("poolLong")}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
