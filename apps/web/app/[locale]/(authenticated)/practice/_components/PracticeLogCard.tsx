"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { format, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import type { PracticeTag } from "@apps/shared/types";
import { calculateOverallAverage, formatAverageTime } from "../_utils/practiceLogFormat";
import type { PracticeLogWithFormattedData } from "../_utils/practiceLogFormat";

// 種目コードの一覧（ラベルは翻訳キー経由で取得。PracticeDetails.tsx と同じ方式）
const SWIM_STYLE_VALUES = ["Fr", "Ba", "Br", "Fly", "IM"] as const;
type SwimStyleValue = (typeof SWIM_STYLE_VALUES)[number];

export interface PracticeLogCardProps {
  log: PracticeLogWithFormattedData;
  onClick: (log: PracticeLogWithFormattedData) => void;
}

/**
 * 練習ログ一覧の全幅カード。旧 lg:hidden カード表示の内容(日付/場所/距離×本数×セット/
 * サークル/種目/タグ/平均タイム/ノート)と一致するように独立コンポーネント化したもの。
 */
export default function PracticeLogCard({ log, onClick }: PracticeLogCardProps) {
  const t = useTranslations("practice");

  // 種目コードをローカライズラベルに変換(PracticeDetails.tsx の getStyleLabel と同方式)。
  // log.style は距離を含まない stroke コード("Fr"等)のみのため、大会カードのような
  // 距離+略称組み立てや sm:略称/フル名出し分けは不要。
  const getStyleLabel = (styleValue: string): string => {
    if (SWIM_STYLE_VALUES.includes(styleValue as SwimStyleValue)) {
      return t(`styles.${styleValue as SwimStyleValue}`);
    }
    return styleValue;
  };

  const handleClick = () => onClick(log);
  const average = log.practice_times && log.practice_times.length > 0
    ? calculateOverallAverage(log.practice_times)
    : null;

  const parsedDate = log.practice?.date ? new Date(log.practice.date) : null;
  const formattedDate =
    parsedDate && isValid(parsedDate) ? format(parsedDate, "yyyy/MM/dd", { locale: ja }) : "-";
  const cardAriaLabel = t("client.viewDetailAriaLabelWithInfo", {
    date: formattedDate,
    place: log.practice?.place || "-",
    style: log.style || "-",
  });

  return (
    <div
      className="rounded-none sm:rounded-lg bg-white shadow p-3 sm:p-4 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={handleClick}
      tabIndex={0}
      role="button"
      aria-label={cardAriaLabel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* 左カラム: 日付・場所(上部・小) → メニュー内容(主役) → タグ・ノート */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs text-gray-500">
            {formattedDate}
            {log.practice?.place && <> · {log.practice.place}</>}
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-base font-semibold text-gray-900">
              {t("page.distanceFormat", {
                distance: log.distance,
                reps: log.rep_count,
                sets: log.set_count,
              })}
            </span>
            <span className="text-sm text-gray-600">
              {log.circle
                ? `${Math.floor(log.circle / 60)}'${Math.floor(log.circle % 60)
                    .toString()
                    .padStart(2, "0")}"`
                : "-"}
            </span>
            <span className="text-sm text-gray-600">{getStyleLabel(log.style)}</span>
          </div>

          {log.tags && log.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {log.tags.map((tag: PracticeTag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-black"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {log.note && (
            <div className="min-w-0 truncate text-xs text-gray-600">{log.note}</div>
          )}
        </div>

        {/* 右カラム: ヒーロー平均タイム(average が無い場合は非表示) */}
        {average !== null && (
          <div className="shrink-0 text-right">
            <div className="text-xs text-gray-500">{t("page.avgTimeLabel")}</div>
            <div className="mt-0.5 text-2xl font-bold text-gray-900 tabular-nums">
              {formatAverageTime(average)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
