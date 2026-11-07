"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dashboardKeys, recordKeys } from "@apps/shared/hooks/queries/keys";

/**
 * 練習・大会・エントリー・記録を保存するとカレンダーが再取得される (calendarRefreshKey が進む)。
 * 同じタイミングで「対応が必要なこと」「次の大会」とベストタイムも取り直す。
 * 記録の作成・更新の mutation は recordKeys.lists() しか invalidate せず、bestTimes はその配下に無いので、
 * ここで明示的に取り直す。初回の描画では何もしない。
 */
export function useDashboardRefreshOnSave(calendarRefreshKey: number, userId: string | undefined) {
  const queryClient = useQueryClient();
  const lastRefreshKeyRef = useRef(calendarRefreshKey);

  useEffect(() => {
    if (lastRefreshKeyRef.current === calendarRefreshKey) return;
    lastRefreshKeyRef.current = calendarRefreshKey;
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    void queryClient.invalidateQueries({ queryKey: recordKeys.bestTimes(userId) });
  }, [calendarRefreshKey, queryClient, userId]);
}
