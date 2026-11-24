"use client";

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SupabaseClient } from "@supabase/supabase-js";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import { useTranslations } from "next-intl";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";
import {
  calculateMyMonthStatus,
  currentBaseMonth,
  myMonthListQueryOptions,
  type MonthItem,
} from "@/hooks/queries/teamAttendanceQueries";
import { teamDetailKeys } from "@/hooks/queries/teamDetailKeys";

export type { MonthItem } from "@/hooks/queries/teamAttendanceQueries";

const EMPTY_MONTH_LIST: MonthItem[] = [];

/**
 * 出欠タブの月別サマリ。
 *
 * 取得は React Query (`teamDetailKeys.myMonthList`)。タブを開くたびに再取得するが
 * (staleTime 0)、再取得中は前回の一覧を表示する。自分の回答を数えるので
 * userId をキーに含める。
 */
export const useMonthList = (
  teamId: string,
  supabase: SupabaseClient,
  attendanceAPI: AttendanceAPI,
  userId: string | null,
) => {
  const t = useTranslations("teams");
  const queryClient = useQueryClient();
  const baseMonth = currentBaseMonth();
  const query = useQuery(myMonthListQueryOptions(supabase, teamId, userId, baseMonth));

  const fetchError = query.error;
  useEffect(() => {
    if (fetchError) console.error("月リストの取得に失敗:", fetchError);
  }, [fetchError]);

  const { refetch } = query;
  const loadMonthList = useCallback(async () => {
    // refetch は enabled を無視するので、ユーザー未確定のときは取得しない
    if (userId === null) return;
    await refetch();
  }, [refetch, userId]);

  // 1 か月分だけ回答状況を計算し直してキャッシュに反映する (直近の出欠を保存したとき)
  const updateMonthStatus = useCallback(
    async (year: number, month: number) => {
      try {
        const status = await calculateMyMonthStatus(supabase, attendanceAPI, teamId, year, month);
        queryClient.setQueryData<MonthItem[]>(
          teamDetailKeys.myMonthList(teamId, userId, baseMonth),
          (prev) =>
          prev?.map((item) =>
            item.year === year && item.month === month
              ? {
                  ...item,
                  status: status.status,
                  answeredCount: status.answeredCount,
                  eventCount: status.eventCount,
                }
              : item,
          ),
        );
      } catch (err) {
        console.error("月ステータスの更新に失敗:", err);
      }
    },
    [supabase, attendanceAPI, teamId, queryClient, userId, baseMonth],
  );

  return {
    monthList: query.data ?? EMPTY_MONTH_LIST,
    // スピナー / エラーは表示できる一覧が無いときだけ出す。
    // ユーザー確定待ち (enabled: false) の間も isPending なので読み込み表示のまま
    loading: query.isPending,
    error:
      fetchError && !query.data
        ? toUserFacingMessage(fetchError, t("monthListHook.loadError"))
        : null,
    loadMonthList,
    updateMonthStatus,
  };
};
