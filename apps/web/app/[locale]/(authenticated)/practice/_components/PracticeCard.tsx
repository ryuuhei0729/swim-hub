"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { format, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import type { PracticeWithLogs } from "@apps/shared/types";
import { buildPracticeLogLines } from "../_utils/practiceDayGrouping";

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
 * tags 抽出ロジックと同一にし、web/mobile の見た目を一致させている
 * (日付+タイトル+場所 / ログごとの距離×本数×セット+サークル+種目+タグ)。
 * 2026-07-28: 先頭ログのみの表示は「複数ログがあれば全部見せてほしい」というユーザー判断により
 * 撤回し、practice_logs 全件をそれぞれ1行として列挙する形に戻した
 * (`_utils/practiceDayGrouping.ts` の `buildPracticeLogLines` 参照)。
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

  const parsedDate = practice.date ? new Date(practice.date) : null;
  const formattedDate =
    parsedDate && isValid(parsedDate) ? format(parsedDate, "yyyy/MM/dd", { locale: ja }) : "-";

  const title = practice.title || t("client.practiceTitle");

  // 練習ログごとの行(距離×本数×セット / サークル / 種目 / タグ)。1件のみなら旧来と同じ見た目。
  const logLines = buildPracticeLogLines(practice.practice_logs, getStyleLabel, (distance, reps, sets) =>
    t("page.distanceFormat", { distance, reps, sets }),
  );

  const cardAriaLabel = t("client.viewDetailAriaLabelWithInfo", {
    date: formattedDate,
    place: practice.place || "-",
    style: practice.practice_logs?.[0]?.style || "-",
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

      {/* 2行目以降: 練習ログごとに 距離×本数×セット・サークル・種目、タグ を1行で列挙 */}
      {logLines.map((line) => {
        if (!line.secondLineInfo && line.tags.length === 0) return null;
        return (
          <div key={line.logId} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {line.secondLineInfo && (
              <span className="text-sm text-gray-600">{line.secondLineInfo}</span>
            )}
            {line.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {line.tags.map((tag) => (
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
        );
      })}
    </div>
  );
}
