"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { format, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import type { PracticeTag, PracticeWithLogs } from "@apps/shared/types";

// 種目コードの一覧（ラベルは翻訳キー経由で取得。PracticeDetails.tsx と同じ方式）
const SWIM_STYLE_VALUES = ["Fr", "Ba", "Br", "Fly", "IM"] as const;
type SwimStyleValue = (typeof SWIM_STYLE_VALUES)[number];

export interface PracticeCardProps {
  practice: PracticeWithLogs;
  onClick: (practice: PracticeWithLogs) => void;
}

/**
 * 練習履歴一覧の全幅カード(day-level, 2026-07-23 Sprint)。
 *
 * 旧 PracticeLogCard(1練習ログ=1カード)を廃止し、1練習日(=1 practice)につき1枚に変更した。
 * 表示項目は mobile `apps/mobile/components/practices/PracticeItem.tsx` の secondLineInfo/
 * firstLog/tags 抽出ロジックと同一にし、web/mobile の見た目を一致させている
 * (日付+タイトル+場所 / 先頭ログの距離×本数×セット+サークル+種目 / タグ)。
 * 旧カードにあった web 独自のヒーロー平均タイム表示(右側の大きな数字)は撤去した
 * (mobile 側に存在しない表示のため、パリティを優先した)。
 */
export default function PracticeCard({ practice, onClick }: PracticeCardProps) {
  const t = useTranslations("practice");

  // 種目コードをローカライズラベルに変換(PracticeDetails.tsx の getStyleLabel と同方式)
  const getStyleLabel = (styleValue: string): string => {
    if (SWIM_STYLE_VALUES.includes(styleValue as SwimStyleValue)) {
      return t(`styles.${styleValue as SwimStyleValue}`);
    }
    return styleValue;
  };

  const handleClick = () => onClick(practice);

  // 先頭ログ(代表ログ)。mobile PracticeItem.tsx の firstLog と同じ扱い
  // (複数ログがある場合は最初のものだけを2行目に表示する)
  const firstLog = practice.practice_logs?.[0];

  const parsedDate = practice.date ? new Date(practice.date) : null;
  const formattedDate =
    parsedDate && isValid(parsedDate) ? format(parsedDate, "yyyy/MM/dd", { locale: ja }) : "-";

  const title = practice.title || t("client.practiceTitle");

  // 2行目: 距離×本数×セット / サークル / 種目 (mobile secondLineInfo と同じ組み立て・区切り " / ")
  const secondLineParts: string[] = [];
  if (firstLog) {
    if (firstLog.distance && firstLog.rep_count && firstLog.set_count) {
      secondLineParts.push(
        t("page.distanceFormat", {
          distance: firstLog.distance,
          reps: firstLog.rep_count,
          sets: firstLog.set_count,
        }),
      );
    }
    if (firstLog.circle) {
      secondLineParts.push(
        `${Math.floor(firstLog.circle / 60)}'${Math.floor(firstLog.circle % 60)
          .toString()
          .padStart(2, "0")}"`,
      );
    }
    if (firstLog.style) {
      secondLineParts.push(getStyleLabel(firstLog.style));
    }
  }
  const secondLineInfo = secondLineParts.join(" / ");

  // タグ情報(先頭ログ由来。mobile PracticeItem.tsx の tags 抽出と同じ)
  const tags: PracticeTag[] = firstLog?.practice_log_tags?.map((plt) => plt.practice_tags) ?? [];

  const cardAriaLabel = t("client.viewDetailAriaLabelWithInfo", {
    date: formattedDate,
    place: practice.place || "-",
    style: firstLog?.style || "-",
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

      {/* 2行目: 距離×本数×セット・サークル・種目、タグ */}
      {(secondLineInfo || tags.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {secondLineInfo && <span className="text-sm text-gray-600">{secondLineInfo}</span>}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
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
