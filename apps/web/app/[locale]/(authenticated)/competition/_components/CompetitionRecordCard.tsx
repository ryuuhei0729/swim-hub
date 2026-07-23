"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { format, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import { formatTimeBest } from "@/utils/formatters";
import type { Record, Competition, Style } from "@apps/shared/types";
import { formatStyleAbbrev } from "@apps/shared/utils/swimStyles";
import BestTimeBadge from "@/components/ui/BestTimeBadge";

export interface CompetitionRecordCardProps {
  record: Record;
  onClick: (record: Record) => void;
}

/**
 * 大会記録一覧のカード。mobile RecordItem 準拠の2行レイアウト:
 * 1行目=日付+大会名(左) / ベストバッジ(右、大会名と同じ高さ)、
 * 2行目=場所(左) / プール・種目・タイム(右)。
 */
export default function CompetitionRecordCard({ record, onClick }: CompetitionRecordCardProps) {
  const t = useTranslations("competition");
  const tCommon = useTranslations("common");

  const competition = record.competition as Competition | null;
  const style = record.style as Style | undefined;
  // 大会未紐付けレコード(一括ベストタイム入力等)はグレー表示にする
  const isBulkRecord = !competition;
  const textClass = isBulkRecord ? "text-gray-400" : "text-gray-900";

  // 一括入力レコードは泳いだ日を持たないため、日付欄には登録日(created_at)を表示する
  const dateSource = competition?.date ?? record.created_at;
  const parsedDate = dateSource ? new Date(dateSource) : null;
  const formattedDate =
    parsedDate && isValid(parsedDate) ? format(parsedDate, "yyyy/MM/dd", { locale: ja }) : "-";
  const competitionLabel = isBulkRecord ? `(${t("client.bulkInputLabel")})` : competition?.title || "-";
  const cardAriaLabel = t("client.viewDetailAriaLabelWithInfo", {
    date: formattedDate,
    name: competitionLabel,
  });

  const handleClick = () => onClick(record);

  return (
    <div
      className={`rounded-none sm:rounded-lg shadow p-3 sm:p-4 cursor-pointer transition-colors ${
        isBulkRecord ? "bg-gray-100 hover:bg-gray-200" : "bg-white hover:bg-gray-50"
      }`}
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
      <div className="space-y-0.5">
        {/* 1行目: 日付 + 大会名(左、大会未紐付けは「(一括入力)」グレー) + ベストバッジ(右、大会名と同じ高さ) */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="shrink-0 text-xs text-gray-500">{formattedDate}</span>
            <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${textClass}`}>
              {competitionLabel}
            </span>
          </div>
          {/* ベストバッジ: 1行目右端、内容幅・右寄せ */}
          <div className="shrink-0">
            <BestTimeBadge
              recordId={record.id}
              styleId={record.style_id}
              currentTime={record.time}
              recordDate={competition?.date ?? record.created_at}
              poolType={record.pool_type}
              isRelaying={record.is_relaying}
            />
          </div>
        </div>

        {/* 2行目: 場所(左) + プール・種目・タイム(右) */}
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-xs sm:text-sm text-gray-500">
            {competition?.place ? `📍${competition.place}` : ""}
          </span>
          <div className="shrink-0 flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
            {/* 水路列: sm以上は固定幅の列内で pill を内容幅・右寄せにし、列頭を揃えつつ引き伸ばしを防ぐ */}
            <div className="shrink-0 sm:w-28 flex sm:justify-end">
              <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                {record.pool_type === 1
                  ? tCommon("poolTypeLong")
                  : record.pool_type === 0
                    ? tCommon("poolTypeShort")
                    : "-"}
              </span>
            </div>
            {/* 種目列: sm以上は固定幅左寄せ(略称/フル名の出し分け・拡大フォントは維持)。
                sm:w-44(176px)は最長種目名(200m/400m個人メドレー、実測約161px)を
                約15pxの余白(1文字弱)で収める幅(nowrap維持ではみ出し不可のため要注意) */}
            <span className="shrink-0 sm:w-44 sm:whitespace-nowrap text-base sm:text-lg font-bold text-blue-600">
              <span className="sm:hidden">{formatStyleAbbrev(style)}</span>
              <span className="hidden sm:inline">{style?.name_jp || "-"}</span>
            </span>
            {/* タイム列: sm以上は固定幅左寄せ(ベストバッジは1行目に移設済み) */}
            <span className="shrink-0 sm:w-28 sm:text-left text-base sm:text-lg font-bold text-blue-600 tabular-nums">
              {record.time ? (
                <>
                  {formatTimeBest(record.time)}
                  {record.is_relaying && <span className="font-bold text-red-600 ml-1">R</span>}
                </>
              ) : (
                "-"
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
