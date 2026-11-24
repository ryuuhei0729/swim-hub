"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { LapTimeDisplay } from "@/components/forms/LapTimeDisplay";
import { useRecordSplitTimesQuery } from "@/hooks/queries/dayDetailQueries";
import type { RecordSplitTimesProps } from "../../types";

export function RecordSplitTimes({ recordId, raceDistance, recordTime }: RecordSplitTimesProps) {
  const { supabase } = useAuth();
  const t = useTranslations("dashboard");
  // スプリットタイム (開くたびに取り直す。前回の内容があれば先に表示する)
  const { data, error } = useRecordSplitTimesQuery(supabase, recordId);

  // データが無いときだけ読み込み中・エラーを表示する (裏での取り直し中・その失敗では隠さない)
  if (!data) {
    if (error) {
      return <div className="mt-3 text-sm text-red-600">{t("competition.splitFetchError")}</div>;
    }
    return <div className="mt-3 text-sm text-gray-500">{t("competition.splitLoading")}</div>;
  }
  const splits = data;

  // DBにsplit_timeがない場合は表示しない
  if (!splits.length) {
    return null;
  }

  // DBから取得したsplit_timesに、ゴールタイム（種目の距離）を追加して表示用データを作成
  const displaySplitTimes = (() => {
    const baseSplits = splits.map((st) => ({
      distance: st.distance,
      splitTime: st.split_time,
    }));

    // ゴールタイムを最終splitとして追加（種目の距離と同じ距離のsplitがない場合）
    if (raceDistance && recordTime && recordTime > 0) {
      const hasGoalSplit = baseSplits.some((st) => st.distance === raceDistance);
      if (!hasGoalSplit) {
        return [...baseSplits, { distance: raceDistance, splitTime: recordTime }];
      }
    }

    return baseSplits;
  })();

  return (
    <div className="mt-3">
      {/* 距離別Lap表示 */}
      {displaySplitTimes.length > 0 && (
        <LapTimeDisplay splitTimes={displaySplitTimes} raceDistance={raceDistance} />
      )}
    </div>
  );
}
