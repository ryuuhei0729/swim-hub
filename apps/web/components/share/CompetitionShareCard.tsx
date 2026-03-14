"use client";

import { forwardRef, useMemo } from "react";
import type { CompetitionShareData } from "./types";
import { formatTime, formatReactionTime } from "./utils";
import {
  calculateRaceLapTimesTable,
  getLapIntervalsForRace,
  type SplitTime,
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
    // split-timeを有効なものだけフィルタリング（@/types のSplitTimeはsplit_timeを使用）
    const validSplitTimes: SplitTime[] = useMemo(() => {
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

    return (
      <div ref={ref} className={`relative w-[480px] overflow-hidden bg-white ${className}`}>
        {/* コンテンツ */}
        <div className="flex flex-col p-5">
          {/* 1行目: 日付(左) / 大会名(中) / 場所(右) */}
          <div className="grid grid-cols-3 gap-4 items-end pb-3 border-b border-gray-700">
            <p className="text-gray-800 text-sm">{data.date}</p>
            <h2 className="text-gray-900 text-base font-medium text-center">
              {data.competitionName}
            </h2>
            <p className="text-gray-500 text-[8px] text-right">
              📍
              {data.place}
            </p>
          </div>

          {/* 2行目: 種目名(左) / 記録(中) / 短水路・長水路(右) */}
          <div className="grid grid-cols-3 items-baseline gap-4 py-3">
            <span className="text-blue-700 text-xl font-bold">{data.eventName}</span>
            <span className="text-2xl font-bold text-blue-700 text-center">
              {formatTime(data.time)}
            </span>
            <span className="text-sm text-gray-600 font-normal text-right">
              {data.poolType === "short" ? "短水路(25m)" : "長水路(50m)"}
            </span>
          </div>

          {/* 3行目以降: 距離別Lapテーブル */}
          {raceLapTimesTable.length > 0 && (
            <div className="mt-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-gray-700">距離別 Lap</span>
                {data.reactionTime && (
                  <span className="text-xs text-gray-600">
                    （RT {formatReactionTime(data.reactionTime)}）
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-100">
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                        距離
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                        Split
                      </th>
                      {lapIntervals.map((interval) => (
                        <th
                          key={interval}
                          className="px-3 py-2 text-left text-xs font-medium text-gray-700"
                        >
                          {interval}m
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {raceLapTimesTable.map((row, index) => (
                      <tr key={index} className="border-b border-gray-200 last:border-b-0">
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">
                          {row.distance}m
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900">
                          {row.splitTime !== null ? formatTime(row.splitTime) : "-"}
                        </td>
                        {lapIntervals.map((interval) => (
                          <td key={interval} className="px-3 py-2 text-sm text-gray-900">
                            {row.lapTimes[interval] !== null && row.lapTimes[interval] !== undefined
                              ? formatTime(row.lapTimes[interval]!)
                              : "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
