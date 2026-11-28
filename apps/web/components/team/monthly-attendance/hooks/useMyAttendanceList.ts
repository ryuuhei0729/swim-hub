"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";
import { currentBaseDate, myMonthListQueryOptions } from "@/hooks/queries/teamAttendanceQueries";
import type { MyAttendanceItem } from "@/utils/teamAttendance";

const EMPTY_ITEMS: MyAttendanceItem[] = [];

/**
 * 出欠タブの自分の出欠一覧 (今日〜12 か月先の練習・大会と、それぞれに対する自分の回答)。
 *
 * 取得は React Query (`teamDetailKeys.myMonthList`)。タブを開くたびに再取得するが
 * (staleTime 0)、再取得中は前回の一覧を表示する。自分の回答を持つので userId を
 * キーに含める。月ごとのまとめ・直近の出欠・月の詳細はすべてこの一覧から作る。
 */
export const useMyAttendanceList = (
  teamId: string,
  supabase: SupabaseClient,
  userId: string | null,
) => {
  const t = useTranslations("teams");
  const options = myMonthListQueryOptions(supabase, teamId, userId, currentBaseDate());
  const query = useQuery(options);

  const fetchError = query.error;
  useEffect(() => {
    if (fetchError) console.error("出欠一覧の取得に失敗:", fetchError);
  }, [fetchError]);

  return {
    items: query.data ?? EMPTY_ITEMS,
    /** 回答の保存で書き換えるキャッシュのキー */
    queryKey: options.queryKey,
    // スピナー / エラーは表示できる一覧が無いときだけ出す。
    // ユーザー確定待ち (enabled: false) の間も isPending なので読み込み表示のまま
    loading: query.isPending,
    error:
      fetchError && !query.data
        ? toUserFacingMessage(fetchError, t("monthListHook.loadError"))
        : null,
  };
};
