"use client";

import React, { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@/components/ui/Tabs";
import { TrophyIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { differenceInDays, parseISO } from "date-fns";
import { formatTimeBest, formatDate } from "@/utils/formatters";
import type { BestTime, TabType } from "@/types/member-detail";
import {
  DISTANCES,
  STYLES,
  STYLE_KEY_MAP,
  isInvalidCombination,
} from "@apps/shared/utils/swimStyles";
import {
  getBestWaPointsForCandidates,
  type Gender,
  type WaPointsCellCandidate,
} from "@apps/shared/utils/waPoints";

const styleHeaderBgClass: Record<string, string> = {
  自由形: "bg-yellow-100",
  平泳ぎ: "bg-green-100",
  背泳ぎ: "bg-red-100",
  バタフライ: "bg-blue-100",
  個人メドレー: "bg-pink-100",
};

const styleCellBgClass: Record<string, string> = {
  自由形: "bg-yellow-50",
  平泳ぎ: "bg-green-50",
  背泳ぎ: "bg-red-50",
  バタフライ: "bg-blue-50",
  個人メドレー: "bg-pink-50",
};

interface BestTimesTableProps {
  bestTimes: BestTime[];
  gender?: number; // 0: 男性, 1: 女性, undefined/その他: 不明 (WAポイントは常に「—」)
}

// セルの data-testid を組み立てる (例: 自由形100m -> "member-detail-best-times-cell-Fr-100")
const cellTestId = (style: string, distance: number) =>
  `member-detail-best-times-cell-${STYLE_KEY_MAP[style as keyof typeof STYLE_KEY_MAP]}-${distance}`;

export function BestTimesTable({ bestTimes, gender }: BestTimesTableProps) {
  const t = useTranslations("teams.memberDetail.bestTimesTable");
  const tStyles = useTranslations("practice.styles");
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false);
  const [isWaPointsMode, setIsWaPointsMode] = useState<boolean>(false);

  const filteredBestTimes = useMemo(() => {
    if (activeTab === "short") {
      return bestTimes.filter((bt) => bt.pool_type === 0);
    } else if (activeTab === "long") {
      return bestTimes.filter((bt) => bt.pool_type === 1);
    } else {
      return bestTimes;
    }
  }, [bestTimes, activeTab]);

  const getBestTime = (style: string, distance: number): BestTime | null => {
    const dbStyleName = `${distance}m${style}`;

    if (activeTab === "all") {
      const candidates: BestTime[] = [];

      // 短水路のタイムを取得
      const shortCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 0,
      );

      shortCourseTimes.forEach((bt) => {
        if (!bt.is_relaying) {
          candidates.push(bt);
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            });
          }
        } else {
          if (includeRelaying) {
            candidates.push(bt);
          }
        }
      });

      // 長水路のタイムを取得
      const longCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 1,
      );

      longCourseTimes.forEach((bt) => {
        if (!bt.is_relaying) {
          candidates.push(bt);
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            });
          }
        } else {
          if (includeRelaying) {
            candidates.push(bt);
          }
        }
      });

      if (candidates.length === 0) return null;
      return candidates.reduce((best, current) => (current.time < best.time ? current : best));
    } else {
      const candidates: BestTime[] = [];
      const matchingTimes = filteredBestTimes.filter((bt) => bt.style.name_jp === dbStyleName);

      matchingTimes.forEach((bt) => {
        if (!bt.is_relaying) {
          candidates.push(bt);
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            });
          }
        } else {
          if (includeRelaying) {
            candidates.push(bt);
          }
        }
      });

      if (candidates.length === 0) return null;
      return candidates.reduce((best, current) => (current.time < best.time ? current : best));
    }
  };

  // WAポイント表示用のセル取得関数
  // D1: 候補は「非リレー記録のみ」とし、includeRelaying の状態から完全に独立させる
  //     (getBestTime とは意図的に別関数にし、既存のタイム表示アルゴリズムへの回帰を避ける)
  // D2: ALLタブでは短水路/長水路を問わず「最高得点」の候補を選ぶ (最速タイムではない)
  const getWaPointsCell = (
    style: string,
    distance: number,
  ): { points: number; poolType: number } | null => {
    // gender が男女いずれでもない (undefined 含む) 場合は常に「—」。例外は投げない
    if (gender !== 0 && gender !== 1) return null;

    const dbStyleName = `${distance}m${style}`;
    // ALLタブは短水路/長水路の両方から候補を集める。短水路/長水路タブは既にpool_typeで絞られている
    const source = activeTab === "all" ? bestTimes : filteredBestTimes;

    const candidates: WaPointsCellCandidate[] = source
      .filter((bt) => bt.style.name_jp === dbStyleName && !bt.is_relaying)
      .map((bt) => ({ time: bt.time, poolType: bt.pool_type === 1 ? 1 : 0 }));

    const styleKey = STYLE_KEY_MAP[style as keyof typeof STYLE_KEY_MAP];
    const result = getBestWaPointsForCandidates(candidates, gender as Gender, styleKey, distance);
    if (result === null) return null;
    return { points: result.points, poolType: result.poolType };
  };

  const getTimeDisplay = (bestTime: BestTime) => {
    const timeStr = formatTimeBest(bestTime.time);
    const suffixes: string[] = [];

    if (activeTab === "all" && bestTime.pool_type === 1) {
      suffixes.push("L");
    }

    if (bestTime.is_relaying) {
      suffixes.push("R");
    }

    return {
      main: timeStr,
      suffix: suffixes.join(""),
    };
  };

  const tabs = [
    { id: "all", label: "ALL" },
    { id: "short", label: t("shortCourse") },
    { id: "long", label: t("longCourse") },
  ];

  if (bestTimes.length === 0) {
    return (
      <div className="text-center py-6">
        <TrophyIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" />
        <p className="text-sm text-gray-600">{t("noRecords")}</p>
        <p className="text-xs text-gray-500 mt-1">{t("noRecordsDetail")}</p>
      </div>
    );
  }

  return (
    <div>
      {/* タブとチェックボックス */}
      <div className="mb-3 flex items-center justify-between">
        <Tabs
          tabs={tabs}
          activeTabId={activeTab}
          onTabChange={(tabId) => setActiveTab(tabId as TabType)}
        />
        <div className="flex items-center space-x-3">
          <button
            type="button"
            data-testid="member-detail-best-times-wa-points-toggle"
            aria-pressed={isWaPointsMode}
            onClick={() => setIsWaPointsMode((prev) => !prev)}
            className={`px-3 py-1.5 rounded-md border text-xs sm:text-sm font-medium transition-colors ${
              isWaPointsMode
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {t("waPointsToggle")}
          </button>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeRelaying}
              onChange={(e) => setIncludeRelaying(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-xs text-gray-700">{t("includeRelay")}</span>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-300">
        <table className="min-w-full table-fixed border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[48px] w-[56px] h-[36px] tracking-wide">
                {t("distanceHeader")}
              </th>
              {STYLES.map((style) => (
                <th
                  key={style}
                  className={`px-2 py-1.5 text-center text-xs font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 min-w-[90px] h-[36px] ${styleHeaderBgClass[style]}`}
                >
                  {tStyles(STYLE_KEY_MAP[style])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {DISTANCES.map((distance, rowIdx) => (
              <tr key={distance}>
                <td
                  className={`px-2 py-2 text-xs font-semibold text-gray-600 border-r border-gray-300 bg-gray-50 min-w-[48px] w-[56px] h-[48px] ${rowIdx > 0 ? "border-t border-gray-300" : ""}`}
                >
                  {distance}m
                </td>
                {STYLES.map((style) => {
                  const bestTime = !isWaPointsMode ? getBestTime(style, distance) : null;
                  const waCell = isWaPointsMode ? getWaPointsCell(style, distance) : null;
                  const createdAt = bestTime ? parseISO(bestTime.created_at) : null;
                  // 一括登録（competition なし）は New 表示対象外
                  const isNew =
                    !isWaPointsMode && bestTime?.competition && createdAt
                      ? differenceInDays(new Date(), createdAt) <= 30
                      : false;
                  return (
                    <td
                      key={style}
                      data-testid={cellTestId(style, distance)}
                      className={`px-2 py-2 text-center text-xs text-gray-900 border-r border-gray-300 last:border-r-0 min-w-[90px] h-[48px] ${rowIdx > 0 ? "border-t border-gray-300" : ""} ${isInvalidCombination(style, distance) ? "bg-gray-200" : styleCellBgClass[style]}`}
                    >
                      {isWaPointsMode ? (
                        waCell ? (
                          <span className="font-semibold text-sm text-gray-900">
                            {waCell.points}
                            {activeTab === "all" && waCell.poolType === 1 && (
                              <span className="text-[10px] ml-0.5">L</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-block text-gray-300">—</span>
                        )
                      ) : bestTime ? (
                        <div className={`group relative inline-block pt-1 ${isNew ? "pr-5" : ""}`}>
                          {isNew && (
                            <span className="absolute -top-0.5 -right-2.5 text-[9px] bg-red-500 text-white px-1 py-0.5 rounded-full shadow">
                              New
                            </span>
                          )}
                          <span
                            className={`font-semibold text-sm ${isNew ? "text-red-600" : "text-gray-900"}`}
                          >
                            {(() => {
                              const display = getTimeDisplay(bestTime);
                              return (
                                <>
                                  {display.main}
                                  {display.suffix && (
                                    <span className="text-[10px] ml-0.5">{display.suffix}</span>
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
                            ) : (
                              <div className="text-gray-400">{bestTime.note || t("bulkEntryNote")}</div>
                            )}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-block text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 注釈 */}
      <div
        data-testid="member-detail-best-times-legend"
        className="mt-2 text-xs text-gray-400 flex items-center justify-end space-x-3"
      >
        <span>{`※ ${t("legend.longCourse")}`}</span>
        {!isWaPointsMode && <span>{t("legend.relaying")}</span>}
        {isWaPointsMode && <span>{t("legend.relayingExcludedFromWaPoints")}</span>}
      </div>
    </div>
  );
}
