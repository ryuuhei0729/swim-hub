"use client";

import React, { useState, useMemo } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { CalendarIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { formatTimeBest, formatDate } from "../../utils/formatters";
import { Tabs } from "../ui/Tabs";
import { WaPointsInfoTooltip } from "../ui/WaPointsInfoTooltip";
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

export interface BestTime {
  id: string;
  time: number;
  created_at: string | null;
  pool_type: number; // 0: 短水路, 1: 長水路
  is_relaying: boolean;
  note?: string; // 備考（一括登録時に使用）
  style: {
    name_jp: string;
    distance: number;
  };
  competition?: {
    title: string | null;
    date: string;
  };
  // 引き継ぎありのタイム（オプショナル）
  relayingTime?: {
    id: string;
    time: number;
    created_at: string | null;
    note?: string;
    competition?: {
      title: string | null;
      date: string;
    };
  };
}

type TabType = "all" | "short" | "long";

interface BestTimesTableProps {
  bestTimes: BestTime[];
  gender?: number; // 0: 男性, 1: 女性, undefined/その他: 不明 (WAポイントは常に「—」)
}

// セルの data-testid を組み立てる (例: 自由形100m -> "best-times-cell-Fr-100")
const cellTestId = (style: string, distance: number) =>
  `best-times-cell-${STYLE_KEY_MAP[style as keyof typeof STYLE_KEY_MAP]}-${distance}`;

export default function BestTimesTable({ bestTimes, gender }: BestTimesTableProps) {
  const t = useTranslations("mypage.bestTimesTable");
  const tStyles = useTranslations("practice.styles");
  const tStyleAbbrev = useTranslations("practice.styleAbbrev");
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false);
  const [isWaPointsMode, setIsWaPointsMode] = useState<boolean>(false);

  const styleHeaderBgClass: Record<string, string> = {
    自由形: "bg-yellow-100",
    平泳ぎ: "bg-green-100",
    背泳ぎ: "bg-red-100",
    バタフライ: "bg-blue-100", // 紺色系はTailwindではblue系で代替
    個人メドレー: "bg-pink-100",
  };

  const styleCellBgClass: Record<string, string> = {
    自由形: "bg-yellow-50",
    平泳ぎ: "bg-green-50",
    背泳ぎ: "bg-red-50",
    バタフライ: "bg-blue-50",
    個人メドレー: "bg-pink-50",
  };

  // タブごとにフィルタリングされたベストタイムを取得
  const filteredBestTimes = useMemo(() => {
    if (activeTab === "short") {
      // 短水路タブ: pool_type === 0 のみ
      return bestTimes.filter((bt) => bt.pool_type === 0);
    } else if (activeTab === "long") {
      // 長水路タブ: pool_type === 1 のみ
      return bestTimes.filter((bt) => bt.pool_type === 1);
    } else {
      // ALLタブ: そのまま返す（getBestTimeで比較処理）
      return bestTimes;
    }
  }, [bestTimes, activeTab]);

  const getBestTime = (style: string, distance: number): BestTime | null => {
    // データベースの種目名形式（例：50m自由形）で検索
    const dbStyleName = `${distance}m${style}`;

    if (activeTab === "all") {
      // ALLタブ: 短水路と長水路の速い方を選択
      const candidates: BestTime[] = [];

      // 短水路のタイムを取得
      const shortCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 0,
      );

      shortCourseTimes.forEach((bt) => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt);
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              note: bt.relayingTime.note,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            });
          }
        } else {
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
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
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt);
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              note: bt.relayingTime.note,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            });
          }
        } else {
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt);
          }
        }
      });

      if (candidates.length === 0) return null;

      // 最速のタイムを選択
      return candidates.reduce((best, current) => (current.time < best.time ? current : best));
    } else {
      // 短水路/長水路タブ: フィルタリング済みのデータから取得
      const candidates: BestTime[] = [];

      const matchingTimes = filteredBestTimes.filter((bt) => bt.style.name_jp === dbStyleName);

      matchingTimes.forEach((bt) => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt);
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              note: bt.relayingTime.note,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            });
          }
        } else {
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt);
          }
        }
      });

      if (candidates.length === 0) return null;

      // 最速のタイムを選択
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

  // タイム表示用のヘルパー関数
  const getTimeDisplay = (bestTime: BestTime) => {
    const timeStr = formatTimeBest(bestTime.time);
    const suffixes: string[] = [];

    // ALLタブの場合、長水路ならLを追加
    if (activeTab === "all" && bestTime.pool_type === 1) {
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

  const tabs = [
    { id: "all", label: "ALL" },
    { id: "short", label: t("shortCourse") },
    { id: "long", label: t("longCourse") },
  ];

  if (bestTimes.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-4">
          <svg className="h-12 w-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
            />
          </svg>
        </div>
        <p className="text-gray-600">{t("noRecords")}</p>
        <p className="text-sm text-gray-500 mt-1">{t("noRecordsDetail")}</p>
      </div>
    );
  }

  return (
    <div>
      {/* タブとチェックボックス */}
      <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
        <Tabs
          tabs={tabs}
          activeTabId={activeTab}
          onTabChange={(tabId) => setActiveTab(tabId as TabType)}
        />
        <div className="flex items-center gap-3">
          <div className="relative inline-block shrink-0">
            <button
              type="button"
              data-testid="best-times-wa-points-toggle"
              aria-pressed={isWaPointsMode}
              onClick={() => setIsWaPointsMode((prev) => !prev)}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md border text-[10px] sm:text-sm font-medium transition-colors ${
                isWaPointsMode
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t("waPointsToggle")}
            </button>
            <WaPointsInfoTooltip buttonTestId="best-times-wa-points-info-button" />
          </div>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeRelaying}
              onChange={(e) => setIncludeRelaying(e.target.checked)}
              className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-xs sm:text-sm text-gray-700">{t("includeRelay")}</span>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-none sm:rounded-xl shadow border-y sm:border border-gray-300 -mx-4 sm:mx-0">
        <table className="w-full table-fixed border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-0.5 sm:px-3 py-0.5 sm:py-2 text-left text-[9px] sm:text-xs md:text-sm font-semibold text-gray-700 border-r border-gray-300 w-[32px] sm:w-[72px] h-[24px] sm:h-[44px]">
                {t("distanceHeader")}
              </th>
              {STYLES.map((style) => (
                <th
                  key={style}
                  className={`px-0.5 sm:px-3 py-0.5 sm:py-2 text-center text-[9px] sm:text-xs md:text-sm font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 h-[24px] sm:h-[44px] ${styleHeaderBgClass[style]}`}
                >
                  <span className="sm:hidden">{tStyleAbbrev(STYLE_KEY_MAP[style])}</span>
                  <span className="hidden sm:inline">{tStyles(STYLE_KEY_MAP[style])}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {DISTANCES.map((distance, rowIdx) => (
              <tr key={distance}>
                <td
                  className={`px-0.5 sm:px-3 py-1 sm:py-3 text-[9px] sm:text-xs md:text-sm font-semibold text-gray-600 border-r border-gray-300 bg-gray-50 w-[32px] sm:w-[72px] h-[36px] sm:h-[64px] ${rowIdx > 0 ? "border-t border-gray-300" : ""}`}
                >
                  {distance}m
                </td>
                {STYLES.map((style) => {
                  const bestTime = !isWaPointsMode ? getBestTime(style, distance) : null;
                  const waCell = isWaPointsMode ? getWaPointsCell(style, distance) : null;
                  return (
                    <td
                      key={style}
                      data-testid={cellTestId(style, distance)}
                      className={`px-0.5 sm:px-3 py-1 sm:py-3 text-center text-[9px] sm:text-xs md:text-sm text-gray-900 border-r border-gray-300 last:border-r-0 h-[36px] sm:h-[64px] ${rowIdx > 0 ? "border-t border-gray-300" : ""} ${isInvalidCombination(style, distance) ? "bg-gray-200" : styleCellBgClass[style]}`}
                    >
                      {isWaPointsMode ? (
                        waCell ? (
                          <span className="font-semibold text-xs sm:text-base md:text-lg text-gray-900">
                            {waCell.points}
                            {activeTab === "all" && waCell.poolType === 1 && (
                              <span className="text-[8px] sm:text-xs ml-0.5 sm:ml-1">L</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-block text-gray-300">—</span>
                        )
                      ) : bestTime ? (
                        <div
                          className={`group relative inline-block pt-1 sm:pt-2 ${(() => {
                            // 一括登録（competition なし）は New 表示対象外
                            if (!bestTime.competition) return "";
                            const createdAt = bestTime.created_at
                              ? parseISO(bestTime.created_at)
                              : new Date(0);
                            const isNew = differenceInDays(new Date(), createdAt) <= 30;
                            return isNew ? "pr-4 sm:pr-6" : "";
                          })()}`}
                        >
                          {(() => {
                            // 一括登録（competition なし）は New 表示対象外
                            if (!bestTime.competition) return null;
                            const createdAt = bestTime.created_at
                              ? parseISO(bestTime.created_at)
                              : new Date(0);
                            const isNew = differenceInDays(new Date(), createdAt) <= 30;
                            return isNew ? (
                              <span className="absolute -top-0.5 sm:-top-1 -right-2 sm:-right-3 text-[8px] sm:text-[10px] md:text-xs bg-red-500 text-white px-1 sm:px-1.5 py-0.5 rounded-full shadow">
                                New
                              </span>
                            ) : null;
                          })()}
                          {/* 通常表示：ベストタイム */}
                          <span
                            className={`font-semibold text-xs sm:text-base md:text-lg ${(() => {
                              // 一括登録（competition なし）は New 表示対象外
                              if (!bestTime.competition) return "text-gray-900";
                              const createdAt = bestTime.created_at
                                ? parseISO(bestTime.created_at)
                                : new Date(0);
                              return differenceInDays(new Date(), createdAt) <= 30
                                ? "text-red-600"
                                : "text-gray-900";
                            })()}`}
                          >
                            {(() => {
                              const display = getTimeDisplay(bestTime);
                              return (
                                <>
                                  {display.main}
                                  {display.suffix && (
                                    <span className="text-[8px] sm:text-xs ml-0.5 sm:ml-1">
                                      {display.suffix}
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </span>

                          {/* ホバー時の詳細情報 */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[11px] md:text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                            <div className="flex items-center space-x-1 mb-1">
                              <CalendarIcon className="h-3 w-3" />
                              <span>{formatDate(bestTime.competition?.date ?? bestTime.created_at, "numeric")}</span>
                            </div>
                            {bestTime.competition ? (
                              <div className="text-blue-300">{bestTime.competition.title}</div>
                            ) : null}
                            {bestTime.note ? (
                              <div className="text-gray-400">{bestTime.note}</div>
                            ) : !bestTime.competition ? (
                              <div className="text-gray-400">{t("bulkEntryNote")}</div>
                            ) : null}
                            {/* 矢印 */}
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
        data-testid="best-times-legend"
        className="mt-2 sm:mt-3 text-xs sm:text-sm text-red-600 flex flex-col sm:flex-row sm:items-center sm:justify-end gap-1 sm:gap-0 sm:space-x-4"
      >
        <span>
          {isWaPointsMode
            ? `※ ${t("legend.longCourse")}, ${t("legend.relayingExcludedFromWaPoints")}`
            : `※ ${t("legend.longCourse")}, ${t("legend.relaying")}`}
        </span>
      </div>
    </div>
  );
}
