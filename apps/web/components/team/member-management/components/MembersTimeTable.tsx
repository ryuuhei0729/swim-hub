"use client";

import React, { useMemo, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { StarIcon, CalendarIcon, ChevronRightIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { formatTimeBest, formatDate } from "@/utils/formatters";
import type { BestTime } from "../../shared/hooks/useMemberBestTimes";
import type { TeamMember } from "../hooks/useMembers";
import { useTranslations } from "next-intl";
import {
  STYLES,
  STYLE_KEY_MAP,
  isInvalidCombination,
  getDistancesForStyle,
} from "@apps/shared/utils/swimStyles";
import { isNewRecord } from "@apps/shared/utils/bestTimeBadge";
import {
  excludeNonSwimmers,
  selectNonSwimmers,
  remapGroupHeadersForSwimmers,
} from "@apps/shared/utils/swimmerFilter";

interface MembersTimeTableProps {
  members: TeamMember[];
  currentUserId: string;
  includeRelaying: boolean;
  sortStyle: string | null;
  sortDistance: number | null;
  sortOrder: "asc" | "desc";
  isLoading: boolean;
  groupHeaders?: Map<number, string>;
  onSort: (style: string, distance: number) => void;
  onMemberClick: (member: TeamMember) => void;
  getBestTimeForMember: (memberId: string, style: string, distance: number) => BestTime | null;
}

// 種目ヘッダーの背景色
const styleHeaderBgClass: Record<string, string> = {
  自由形: "bg-yellow-100",
  背泳ぎ: "bg-red-100",
  平泳ぎ: "bg-green-100",
  バタフライ: "bg-blue-100",
  個人メドレー: "bg-pink-100",
};

// セルの背景色
const styleCellBgClass: Record<string, string> = {
  自由形: "bg-yellow-50",
  背泳ぎ: "bg-red-50",
  平泳ぎ: "bg-green-50",
  バタフライ: "bg-blue-50",
  個人メドレー: "bg-pink-50",
};

/**
 * タイム表示用のヘルパー関数
 */
const getTimeDisplay = (bestTime: BestTime, _includeRelaying: boolean) => {
  const timeStr = formatTimeBest(bestTime.time);
  const suffixes: string[] = [];

  // 長水路ならLを追加
  if (bestTime.pool_type === 1) {
    suffixes.push("L");
  }

  // 引き継ぎありのタイムの場合、Rを追加
  if (bestTime.is_relaying) {
    suffixes.push("R");
  }

  return {
    main: timeStr,
    suffix: suffixes.join(""),
  };
};

/**
 * メンバーのベストタイム一覧テーブル
 */
// テーブルの全カラム数を計算
const TOTAL_COLUMNS =
  1 + STYLES.reduce((sum, style) => sum + getDistancesForStyle(style).length, 0);

export const MembersTimeTable: React.FC<MembersTimeTableProps> = ({
  members,
  currentUserId,
  includeRelaying,
  sortStyle,
  sortDistance,
  sortOrder,
  isLoading,
  groupHeaders,
  onSort,
  onMemberClick,
  getBestTimeForMember,
}) => {
  const t = useTranslations("teams");
  const tPractice = useTranslations("practice");
  const tNonSwimmer = useTranslations("teams.nonSwimmer");
  const [isNonSwimmerExpanded, setIsNonSwimmerExpanded] = useState(false);

  // 非泳者は表の本体行には出さず、最下行の「非泳者 (N)」トグル行をクリックすると
  // 同じ tbody 内でその場に展開するアコーディオンとして表示する (下部に別テーブルは出さない)。
  // (単一定義元 apps/shared/utils/swimmerFilter.ts を使う。生の members 配列そのものは
  // ここでは書き換えない)。
  const swimmerMembers = useMemo(() => excludeNonSwimmers(members), [members]);
  const nonSwimmerMembers = useMemo(() => selectNonSwimmers(members), [members]);
  const swimmerGroupHeaders = useMemo(
    () => remapGroupHeadersForSwimmers(members, groupHeaders),
    [members, groupHeaders],
  );

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="bg-gray-200 rounded-lg h-64"></div>
      </div>
    );
  }

  const renderTableHead = () => (
    <thead className="sticky top-0 z-10">
      {/* 1行目：種目名 */}
      <tr>
        <th
          rowSpan={2}
          className="px-1.5 py-1.5 text-left text-[11px] font-semibold text-gray-700 border-r border-gray-300 min-w-[76px] w-[76px] max-w-[76px] bg-gray-50"
        >
          {t("membersTimeTable.col.name")}
        </th>
        {STYLES.map((style) => {
          const distances = getDistancesForStyle(style);
          return (
            <th
              key={style}
              colSpan={distances.length}
              className={`px-1 py-1.5 text-center text-[11px] font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 ${styleHeaderBgClass[style]}`}
            >
              {tPractice(`styles.${STYLE_KEY_MAP[style]}` as Parameters<typeof tPractice>[0])}
            </th>
          );
        })}
      </tr>
      {/* 2行目：距離 */}
      <tr>
        {STYLES.map((style) => {
          const distances = getDistancesForStyle(style);
          const styleLabel = tPractice(
            `styles.${STYLE_KEY_MAP[style]}` as Parameters<typeof tPractice>[0],
          );
          return distances.map((distance) => {
            const isSorted = sortStyle === style && sortDistance === distance;
            return (
              <th
                key={`${style}-${distance}`}
                className={`p-0 border-r border-gray-300 last:border-r-0 ${styleHeaderBgClass[style]}`}
              >
                <button
                  type="button"
                  onClick={() => onSort(style, distance)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSort(style, distance);
                    }
                  }}
                  className={`w-full px-1 py-1 text-center text-[11px] font-semibold text-gray-700 cursor-pointer hover:bg-opacity-80 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${isSorted ? "ring-2 ring-blue-500 ring-inset" : ""}`}
                  title={t("membersTimeTable.sortClickTitle")}
                  aria-label={`${t("membersTimeTable.sortAriaLabel", { style: styleLabel, distance })}${isSorted ? (sortOrder === "asc" ? t("membersTimeTable.sortAscSuffix") : t("membersTimeTable.sortDescSuffix")) : ""}`}
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>{distance}m</span>
                    {isSorted && (
                      <span className="text-blue-600">{sortOrder === "asc" ? "↑" : "↓"}</span>
                    )}
                  </div>
                </button>
              </th>
            );
          });
        })}
      </tr>
    </thead>
  );

  const renderMemberRow = (
    member: TeamMember,
    memberIdx: number,
    groupName: string | undefined,
  ) => (
    <React.Fragment key={member.id}>
      {groupName !== undefined && (
        <tr>
          <td
            colSpan={TOTAL_COLUMNS}
            className="px-3 py-2 bg-gray-100 text-xs font-semibold text-gray-700 border-t border-gray-300"
          >
            {groupName}
          </td>
        </tr>
      )}
      <tr
        onClick={() => onMemberClick(member)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onMemberClick(member);
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={t("membersTimeTable.viewDetailAriaLabel", { name: member.users?.name || t("membersTimeTable.unknownUser") })}
        className={`cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
          member.user_id === currentUserId
            ? "bg-blue-50 hover:bg-blue-100"
            : "hover:bg-gray-50"
        } ${memberIdx > 0 ? "border-t border-gray-300" : ""}`}
        data-testid={`team-member-row-${member.id}`}
      >
        {/* メンバー名セル */}
        <td
          className={`px-1.5 py-2 border-r border-gray-300 bg-gray-50 min-w-[76px] w-[76px] max-w-[76px] ${memberIdx > 0 ? "border-t border-gray-300" : ""}`}
        >
          <div className="min-w-0">
            <div className="flex items-center space-x-0.5">
              <p className="text-[11px] font-medium text-gray-900 truncate">
                {member.users?.name || "Unknown User"}
              </p>
              {member.role === "admin" && (
                <StarIcon className="h-2.5 w-2.5 text-yellow-500 shrink-0" />
              )}
            </div>
            {member.user_id === currentUserId && (
              <span className="text-[9px] text-blue-600">{t("membersTimeTable.youLabel")}</span>
            )}
          </div>
        </td>
        {/* 各種目×距離のセル */}
        {STYLES.map((style) => {
          const distances = getDistancesForStyle(style);
          return distances.map((distance) => {
            const bestTime = getBestTimeForMember(member.id, style, distance);
            // New 判定は大会実施日が基準。一括登録 (competition なし) は対象外
            const isNew = isNewRecord(bestTime?.competition?.date);
            return (
              <td
                key={`${member.id}-${style}-${distance}`}
                className={`px-1 py-2 text-center text-[11px] border-r border-gray-300 last:border-r-0 min-w-[62px] ${memberIdx > 0 ? "border-t border-gray-300" : ""} ${isInvalidCombination(style, distance) ? "bg-gray-200" : styleCellBgClass[style]}`}
              >
                {bestTime ? (
                  <div className="group relative inline-block">
                    <span
                      className={`font-semibold text-[11px] ${isNew ? "text-red-600" : "text-gray-900"}`}
                    >
                      {(() => {
                        const display = getTimeDisplay(bestTime, includeRelaying);
                        return (
                          <>
                            {display.main}
                            {display.suffix && (
                              <span className="text-[9px] ml-0.5">{display.suffix}</span>
                            )}
                          </>
                        );
                      })()}
                    </span>

                    {/* ホバー時の詳細情報 */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-gray-900 text-white text-[10px] rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                      <div className="flex items-center space-x-1 mb-1">
                        <CalendarIcon className="h-2.5 w-2.5" />
                        <span>{formatDate(bestTime.competition?.date ?? bestTime.created_at, "numeric")}</span>
                      </div>
                      {bestTime.competition ? (
                        <div className="text-blue-300">{bestTime.competition.title}</div>
                      ) : null}
                      {bestTime.note ? (
                        <div className="text-gray-400">{bestTime.note}</div>
                      ) : !bestTime.competition ? (
                        <div className="text-gray-400">{t("membersTimeTable.bulkEntryNote")}</div>
                      ) : null}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  </div>
                ) : (
                  <span className="inline-block text-gray-300">—</span>
                )}
              </td>
            );
          });
        })}
      </tr>
    </React.Fragment>
  );

  // 「非泳者 (N)」行。メンバー行ではないため renderMemberRow / swimmerGroupHeaders の
  // インデックス計算には一切関与させない (別関数として完全に分離する)。
  // 非泳者が0人のときは呼び出し側で描画しない。
  // クリックでその場開閉するトグル (アコーディオン)。ポップアップは持たない。
  const renderNonSwimmerToggleRow = () => (
    <tr
      onClick={() => setIsNonSwimmerExpanded((prev) => !prev)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsNonSwimmerExpanded((prev) => !prev);
        }
      }}
      tabIndex={0}
      role="button"
      aria-expanded={isNonSwimmerExpanded}
      aria-label={tNonSwimmer("sectionToggle", { count: nonSwimmerMembers.length })}
      data-testid="team-member-nonswimmer-row"
      className="cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors border-t border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
    >
      <td colSpan={TOTAL_COLUMNS} className="px-3 py-2 text-xs font-medium text-gray-600">
        <span className="inline-flex items-center gap-1">
          {tNonSwimmer("sectionToggle", { count: nonSwimmerMembers.length })}
          {isNonSwimmerExpanded ? (
            <ChevronDownIcon className="h-3 w-3" />
          ) : (
            <ChevronRightIcon className="h-3 w-3" />
          )}
        </span>
      </td>
    </tr>
  );

  const hasSwimmers = swimmerMembers.length > 0;
  const hasNonSwimmers = nonSwimmerMembers.length > 0;

  return (
    <div>
      {!hasSwimmers && !hasNonSwimmers ? (
        <div className="text-center py-8" data-testid="team-member-empty-state">
          <Avatar avatarUrl={null} userName="?" size="lg" className="mx-auto mb-4 opacity-50" />
          <p className="text-gray-600">{t("membersTimeTable.empty")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-300">
          <table className="min-w-full table-fixed border-separate border-spacing-0">
            {renderTableHead()}
            <tbody className="bg-white">
              {swimmerMembers.map((member, memberIdx) =>
                renderMemberRow(member, memberIdx, swimmerGroupHeaders.get(memberIdx)),
              )}
              {hasNonSwimmers && renderNonSwimmerToggleRow()}
              {/* 展開中の非泳者行。groupHeaders のインデックス計算 (swimmerGroupHeaders /
                  remapGroupHeadersForSwimmers) には一切関与させないため、泳者の行配列
                  (swimmerMembers.map) の外・末尾に別枠で追加する。 */}
              {hasNonSwimmers &&
                isNonSwimmerExpanded &&
                nonSwimmerMembers.map((member, memberIdx) =>
                  renderMemberRow(member, memberIdx, undefined),
                )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
