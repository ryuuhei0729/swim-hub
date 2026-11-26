"use client";

import React, { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { formatCircle, formatTimeBest } from "@apps/shared/utils/time";
import {
  buildLastPracticeRows,
  formatLastPracticeMenu,
  type LastPractice,
  type LastPracticeRow,
} from "@apps/shared/utils/dashboardLastPractice";
import { ChipScrollRow } from "@/components/ui/ChipScrollRow";
import { cn } from "@/utils/cn";

interface LastPracticeCardProps {
  practice: LastPractice;
  /** カードを押したとき、その練習日の詳細を開く */
  onOpenDay: (date: string) => void;
}

const STYLE_KEYS = ["Fr", "Ba", "Br", "Fly", "IM"] as const;

const CATEGORY_CLASS: Record<LastPracticeRow["category"], string> = {
  Swim: "bg-blue-100 text-blue-700",
  Pull: "bg-violet-100 text-violet-700",
  Kick: "bg-orange-100 text-orange-700",
};

/**
 * ダッシュボードの「前回の練習」。次の大会のカードと横に並べて切り替える。
 * 見出しは「前回の練習（日付）」と「タイトル @場所」の2行。
 * メニューごとに1行目へ種類・種目・距離×本数・サークル・平均、2行目へ1本ごとのタイムを並べ、
 * 最速の1本を緑にする。タイムが入りきらないときは横にスクロールでき、右端を薄くして示す。
 */
export default function LastPracticeCard({ practice, onOpenDay }: LastPracticeCardProps) {
  const t = useTranslations("dashboard.lastPractice");
  const tPractice = useTranslations("practice");
  const locale = useLocale() as SupportedLocale;
  const rows = useMemo(
    () => buildLastPracticeRows(practice.practice_logs),
    [practice.practice_logs],
  );
  const date = formatDate(practice.date, "numeric", locale);
  const title = practice.title || tPractice("client.practiceTitle");
  const open = () => onOpenDay(practice.date);

  return (
    <section
      className="cursor-pointer rounded-lg bg-white p-4 shadow transition-colors hover:bg-gray-50 sm:p-5"
      role="button"
      tabIndex={0}
      aria-label={t("openDay", { date })}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      data-testid="last-practice-card"
    >
      <h2 className="text-sm font-semibold text-teal-700">{t("titleWithDate", { date })}</h2>
      <p className="mt-1 truncate text-base font-bold text-gray-900">
        {title}
        {practice.place && (
          <span className="text-sm font-normal text-gray-500"> @{practice.place}</span>
        )}
      </p>

      <ul className="mt-3">
        {rows.map((row) => {
          const styleKey = STYLE_KEYS.find((k) => k.toLowerCase() === row.style.toLowerCase());
          return (
            <li key={row.logId} className="border-t border-gray-100 py-2">
              <div className="flex items-center gap-1.5 text-sm tabular-nums">
                <span
                  className={cn(
                    "shrink-0 rounded px-1 text-[11px] font-bold",
                    CATEGORY_CLASS[row.category] ?? CATEGORY_CLASS.Swim,
                  )}
                >
                  {tPractice(`categories.${row.category}`)}
                </span>
                <span className="min-w-0 truncate font-semibold text-gray-900">
                  {styleKey ? tPractice(`styleAbbrev.${styleKey}`) : row.style}{" "}
                  {formatLastPracticeMenu(row)}
                  {row.circle ? (
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      {formatCircle(row.circle)}
                    </span>
                  ) : null}
                </span>
                {row.average !== null && (
                  <span className="ml-auto shrink-0 text-xs text-gray-500">
                    {t("average", { time: formatTimeBest(row.average) })}
                  </span>
                )}
              </div>
              {row.times.length > 0 && (
                // overscroll-x-contain: タイムの列を端までスクロールしたあと、外のカルーセルまで動かさない
                <ChipScrollRow wrapFromSm={false} className="mt-1.5 gap-1 overscroll-x-contain">
                  {row.times.map((time, i) => {
                    const isFastest = time === row.fastest;
                    return (
                      <span
                        // 同じタイムが複数あり得るので位置を key にする (並びは固定)
                        key={i}
                        className={cn(
                          "rounded border px-1.5 py-px text-xs tabular-nums",
                          isFastest
                            ? "border-emerald-200 bg-emerald-50 font-bold text-emerald-700"
                            : "border-gray-100 bg-gray-100 text-gray-700",
                        )}
                        data-testid={isFastest ? "last-practice-fastest" : undefined}
                      >
                        {formatTimeBest(time)}
                      </span>
                    );
                  })}
                </ChipScrollRow>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
