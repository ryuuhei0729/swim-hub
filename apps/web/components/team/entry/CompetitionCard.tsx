import { memo } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { formatDate } from "@apps/shared/utils/date";
import type { CompetitionCardProps } from "@/types/team-entry";

function CompetitionCardComponent({
  competition,
  entries,
  isExpanded,
  onToggle,
  children,
}: CompetitionCardProps) {
  return (
    <div className="bg-white border border-orange-200 rounded-lg overflow-hidden">
      {/* 大会ヘッダー（クリックで展開/折りたたみ） */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-orange-50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <span className="text-xl">🏆</span>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">{competition.title || "大会"}</h3>
            <div className="flex items-center space-x-3 text-sm text-gray-600 mt-1">
              <span>📅 {formatDate(competition.date, "numeric")}</span>
              {competition.place && <span>📍 {competition.place}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {entries.length > 0 && (
            <span className="text-sm text-orange-700 font-medium">
              {entries.length}件エントリー済み
            </span>
          )}
          {isExpanded ? (
            <ChevronUpIcon className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDownIcon className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* 展開時のコンテンツ */}
      {isExpanded && <div className="px-5 pb-5 border-t border-orange-100">{children}</div>}
    </div>
  );
}

export const CompetitionCard = memo(CompetitionCardComponent);
