"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { format, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import type { PracticeLogWithTags, PracticeWithLogs } from "@apps/shared/types";
import { buildPracticeLogLine } from "../_utils/practiceLogGrouping";

// 種目コードの一覧（ラベルは翻訳キー経由で取得。PracticeDetails.tsx と同じ方式）
const SWIM_STYLE_VALUES = ["Fr", "Ba", "Br", "Fly", "IM"] as const;
type SwimStyleValue = (typeof SWIM_STYLE_VALUES)[number];

export interface PracticeCardProps {
  practice: PracticeWithLogs;
  /** このカードが表示する練習ログ。ログ未登録の練習は null(ヘッダー行のみのカードになる) */
  log: PracticeLogWithTags | null;
  onClick: (practice: PracticeWithLogs) => void;
}

/**
 * 練習履歴一覧の全幅カード(log-level, 2026-08-01)。
 *
 * 1枚 = 1練習ログ。大会タブ (CompetitionRecordCard: 1記録=1カード) と同じ粒度で、
 * 1つの練習に複数ログがある場合は同じヘッダー(日付/タイトル/場所)のカードが
 * ログの数だけ並ぶ。2026-07-23〜07-28 の day-level 表示(1練習=1カードに全ログを
 * 行として詰め込む)は、大会タブとの粒度不一致というユーザー指摘により撤回した。
 * カードのクリック先は従来どおり練習全体 (PracticeDetailModal) なので、どのログの
 * カードから開いても同じ練習の全ログが載ったモーダルが開く。
 *
 * 表示項目は mobile `apps/mobile/components/practices/PracticeItem.tsx` と同一
 * (日付+タイトル+場所 / そのログの距離×本数×セット+サークル+種目+タグ)。
 */
export default function PracticeCard({ practice, log, onClick }: PracticeCardProps) {
  const t = useTranslations("practice");

  // 種目コードをローカライズラベルに変換(PracticeDetails.tsx の getStyleLabel と同方式)
  const getStyleLabel = (styleValue: string): string => {
    if (SWIM_STYLE_VALUES.includes(styleValue as SwimStyleValue)) {
      return t(`styles.${styleValue as SwimStyleValue}`);
    }
    return styleValue;
  };

  const handleClick = () => onClick(practice);

  const parsedDate = practice.date ? new Date(practice.date) : null;
  const formattedDate =
    parsedDate && isValid(parsedDate) ? format(parsedDate, "yyyy/MM/dd", { locale: ja }) : "-";

  const title = practice.title || t("client.practiceTitle");

  // このカードが担当する1ログ分の行(距離×本数×セット / サークル / 種目 / タグ)
  const logLine = buildPracticeLogLine(log, getStyleLabel, (distance, reps, sets) =>
    t("page.distanceFormat", { distance, reps, sets }),
  );

  const cardAriaLabel = t("client.viewDetailAriaLabelWithInfo", {
    date: formattedDate,
    place: practice.place || "-",
    style: log?.style || "-",
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
      {/* 1行目: 日付、練習タイトル、場所 */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs text-gray-500">{formattedDate}</span>
        <span className="text-base font-semibold text-gray-900">{title}</span>
        {practice.place && <span className="text-xs text-gray-500">{practice.place}</span>}
      </div>

      {/* 2行目: このカードのログの 距離×本数×セット・サークル・種目、タグ */}
      {logLine && (logLine.secondLineInfo || logLine.tags.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {logLine.secondLineInfo && (
            <span className="text-sm text-gray-600">{logLine.secondLineInfo}</span>
          )}
          {logLine.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {logLine.tags.map((tag) => (
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
        </div>
      )}
    </div>
  );
}
