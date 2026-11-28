"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { format, isValid, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { ArrowLeftIcon, CalendarDaysIcon, MapPinIcon } from "@heroicons/react/24/outline";
import type { RecordCompetition } from "./types";

interface RecordPageHeaderProps {
  backLabel: string;
  onBack: () => void;
  title: string;
  subtitle?: string;
  competition: RecordCompetition;
}

/** 大会記録の代理入力画面の見出し (戻るボタン + 画面名 + 大会情報)。種目一覧と種目の入力で共用 */
export default function RecordPageHeader({
  backLabel,
  onBack,
  title,
  subtitle,
  competition,
}: RecordPageHeaderProps) {
  const tCommon = useTranslations("common");
  const tRecords = useTranslations("competition.records");
  const date = parseISO(competition.date);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        {backLabel}
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
        {subtitle && <p className="text-gray-600 mb-4">{subtitle}</p>}

        {/* 大会情報 */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 border-t pt-4">
          <div className="flex items-center gap-1">
            <span className="font-medium">
              {competition.title || tRecords("competitionFallback")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <CalendarDaysIcon className="h-4 w-4" />
            <span>{isValid(date) ? format(date, "yyyy年M月d日(EEE)", { locale: ja }) : "-"}</span>
          </div>
          {competition.place && (
            <div className="flex items-center gap-1">
              <MapPinIcon className="h-4 w-4" />
              <span>{competition.place}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
              {competition.pool_type === 1 ? tCommon("poolTypeLong") : tCommon("poolTypeShort")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
