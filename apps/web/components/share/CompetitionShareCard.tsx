"use client";

import { forwardRef, useMemo } from "react";
import type { CompetitionShareData } from "./types";
import { formatTime, formatReactionTime, getShareBadgeState } from "./utils";
import { BestBadge } from "./BestBadge";
import {
  calculateRaceLapTimesTable,
  getLapIntervalsForRace,
  type LapSplitPoint,
} from "@/utils/lapTimeCalculator";

interface CompetitionShareCardProps {
  data: CompetitionShareData;
  className?: string;
}

/**
 * 大会記録シェアカード
 * 白背景にシンプルなデザイン
 */
export const CompetitionShareCard = forwardRef<HTMLDivElement, CompetitionShareCardProps>(
  function CompetitionShareCard({ data, className = "" }, ref) {
    // split-timeを有効なものだけフィルタリング
    const validSplitTimes: LapSplitPoint[] = useMemo(() => {
      if (!data.splitTimes) return [];
      return data.splitTimes
        .filter((st) => st.distance > 0 && st.split_time > 0)
        .map((st) => ({
          distance: st.distance,
          splitTime: st.split_time,
        }));
    }, [data.splitTimes]);

    // 種目別Lapの計算（最終タイムを追加）
    const raceLapTimesTable = useMemo(() => {
      if (!data.raceDistance || validSplitTimes.length === 0) return [];
      const table = calculateRaceLapTimesTable(validSplitTimes, data.raceDistance);

      // 最後の行がレース距離でない場合、最終タイムを追加
      const lastRow = table[table.length - 1];
      if (lastRow && lastRow.distance < data.raceDistance && data.time > 0) {
        const intervals = getLapIntervalsForRace(data.raceDistance);
        const lapTimes: Record<number, number | null> = {};

        // 各間隔についてlap-timeを計算
        for (const interval of intervals) {
          if (data.raceDistance % interval === 0) {
            // 前の間隔の距離のsplit-timeを探す
            const prevDistance = data.raceDistance - interval;
            const prevRow = table.find((row) => row.distance === prevDistance);

            if (prevRow && prevRow.splitTime !== null) {
              lapTimes[interval] = data.time - prevRow.splitTime;
            } else if (prevDistance === 0) {
              lapTimes[interval] = data.time;
            } else {
              lapTimes[interval] = null;
            }
          } else {
            lapTimes[interval] = null;
          }
        }

        table.push({
          distance: data.raceDistance,
          splitTime: data.time,
          lapTimes,
        });
      }

      return table;
    }, [validSplitTimes, data.raceDistance, data.time]);

    const lapIntervals = useMemo(() => {
      if (!data.raceDistance) return [];
      return getLapIntervalsForRace(data.raceDistance);
    }, [data.raceDistance]);

    // データが1つもないintervalは列ごと非表示にする（モーダルの LapTimeDisplay と挙動を揃える）
    const visibleLapIntervals = useMemo(() => {
      return lapIntervals.filter((interval) =>
        raceLapTimesTable.some((row) => row.lapTimes[interval] != null),
      );
    }, [lapIntervals, raceLapTimesTable]);

    // 自己ベストバッジの状態: 初記録 / ベスト(±0含む=青) / ベストより遅い(赤) / 非表示
    const bestBadge = getShareBadgeState(data.time, data.previousBest, data.isFirstRecord);

    return (
      <div ref={ref} className={`relative w-[480px] overflow-hidden bg-white ${className}`}>
        {/* コンテンツ */}
        <div className="flex flex-col p-5">
          {/* メタ行: 日付 ・ 場所 (プール種別) */}
          <p className="text-gray-500 text-sm">
            {data.date}
            {data.place ? ` ・ ${data.place}` : ""}
            {` (${data.poolType === "short" ? "25m" : "50m"})`}
          </p>

          {/* 大会名 */}
          <p className="mt-2 text-sm text-gray-500">{data.competitionName}</p>

          {/* 種目名 */}
          <h2 className="mt-1 text-3xl font-bold text-gray-900">{data.eventName}</h2>

          {/* 記録: リアクションタイム(左) / 記録(大)+自己ベスト差分(右) */}
          <div className="mt-4 flex items-end gap-4">
            {data.reactionTime != null && (
              <span className="text-gray-400 text-sm pb-1.5">
                RT {formatReactionTime(data.reactionTime)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-blue-600 text-6xl font-bold leading-none tracking-tight">
                {formatTime(data.time)}
              </span>
              <BestBadge state={bestBadge} />
            </div>
          </div>

          {/* スプリットテーブル */}
          {raceLapTimesTable.length > 0 && (
            <div className="mt-6 overflow-x-auto rounded-lg bg-gray-50 px-4 py-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-800">
                    <th className="py-2 pr-4 text-left text-xs font-medium text-gray-400">距離</th>
                    <th className="py-2 pr-4 text-left text-xs font-medium text-gray-400">
                      スプリット
                    </th>
                    {visibleLapIntervals.map((interval) => (
                      <th
                        key={interval}
                        className="py-2 pr-4 text-left text-xs font-medium text-gray-400 whitespace-nowrap"
                      >
                        {interval}m lap
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {raceLapTimesTable.map((row, index) => (
                    <tr key={index} className="border-b border-gray-200 last:border-b-0">
                      <td className="py-2.5 pr-4 text-sm font-bold text-gray-900 whitespace-nowrap">
                        {row.distance}m
                      </td>
                      <td className="py-2.5 pr-4 text-sm font-bold text-gray-900 whitespace-nowrap">
                        {row.splitTime !== null ? formatTime(row.splitTime) : "–"}
                      </td>
                      {visibleLapIntervals.map((interval) => (
                        <td
                          key={interval}
                          className="py-2.5 pr-4 text-sm text-gray-400 whitespace-nowrap"
                        >
                          {row.lapTimes[interval] != null
                            ? formatTime(row.lapTimes[interval]!)
                            : "–"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* フッター：ブランディング */}
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center justify-center gap-2">
              <img src="/favicon.png" alt="SwimHub" className="w-5 h-5 object-contain" />
              <span className="text-gray-700 text-sm font-medium tracking-wide">SwimHub</span>
              <img src="/favicon.png" alt="SwimHub" className="w-5 h-5 object-contain" />
            </div>
          </div>
        </div>
      </div>
    );
  },
);
