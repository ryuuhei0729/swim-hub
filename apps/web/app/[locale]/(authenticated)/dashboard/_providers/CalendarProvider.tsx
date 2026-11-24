"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import { useIsReusedServerRender } from "@/components/ui/FreshServerRender";
import { useAuth } from "@/contexts";
import { DashboardAPI } from "@apps/shared/api/dashboard";
import { CalendarItem, MonthlySummary } from "@apps/shared/types/ui";
import {
  calendarKeys,
  calendarMonthKeyToDate,
  calendarMonthQueryOptions,
  toCalendarMonthKey,
  type CalendarMonthData,
} from "@/hooks/queries/calendarKeys";
import {
  prefetchAdjacentCalendarMonths,
  useCalendarMonthQuery,
} from "@/hooks/queries/calendarQueries";
import { dayDetailKeys } from "@/hooks/queries/dayDetailQueries";

interface CalendarContextType {
  // 状態
  currentDate: Date;
  calendarItems: CalendarItem[];
  monthlySummary: MonthlySummary;
  loading: boolean;
  error: Error | null;

  // アクション
  setCurrentDate: (date: Date) => void;
  /**
   * 保存・削除の後などに、書き込み後の内容を取り直す。取り直しが終わるまで loading になる
   * (書き込み前の内容を見せない)。date を渡すとその月を取り直す
   */
  refetch: (date?: Date) => Promise<void>;
  addItem: (item: CalendarItem) => void;
  updateItem: (id: string, item: Partial<CalendarItem>) => void;
  removeItem: (id: string) => void;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

interface CalendarProviderProps {
  children: React.ReactNode;
  /**
   * 最初に表示する月 ("yyyy-MM")。サーバーがこの月のデータを同じキーで prefetch して
   * HydrationBoundary に渡しているので、SSR と CSR で同じキーを使うために必ずこの値を
   * そのまま使う (クライアントで new Date() から計算し直すと、月末のタイムゾーン差で
   * 別の月になりうる)
   */
  initialMonth?: string;
  /** initialMonth を渡さないときの最初の表示日 (既定は今日) */
  initialDate?: Date;
  refreshKey?: number;
  /**
   * サーバーの描画ごとの ID (DashboardDataLoader が作る)。ページ遷移のキャッシュで前回の描画が
   * 使い回されたかの判定に使う。使い回しのときは、手元のカレンダーが新しく見えても
   * (他の画面で練習や記録を保存してきた直後かもしれないので) マウント時に必ず取り直す
   */
  serverRenderId?: string;
}

const EMPTY_CALENDAR_ITEMS: CalendarItem[] = [];
const DEFAULT_MONTHLY_SUMMARY: MonthlySummary = { practiceCount: 0, recordCount: 0 };

function resolveInitialDate(initialMonth: string | undefined, initialDate: Date | undefined): Date {
  const today = initialDate ?? new Date();
  if (!initialMonth) return today;
  // 今日がその月なら今日 (「今日」の表示はそのまま)、違えばその月の1日
  return toCalendarMonthKey(today) === initialMonth ? today : calendarMonthKeyToDate(initialMonth);
}

export function CalendarProvider({
  children,
  initialMonth,
  initialDate,
  refreshKey,
  serverRenderId,
}: CalendarProviderProps) {
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDateState] = useState(() =>
    resolveInitialDate(initialMonth, initialDate),
  );
  const api = useMemo(() => new DashboardAPI(supabase), [supabase]);
  const month = toCalendarMonthKey(currentDate);

  const isReusedServerRender = useIsReusedServerRender(serverRenderId);
  const query = useCalendarMonthQuery(api, month, { alwaysRefetchOnMount: isReusedServerRender });
  const data = query.data;

  // 書き込み後の取り直しに失敗したときのエラー。表示中のデータは書き込み前の内容なので、
  // 「保存されなかった」ように見せないよう、データがあってもエラー表示にする (従来と同じ)。
  // その後に取得が成功するか、月を切り替えたら消す
  const [writeRefreshError, setWriteRefreshError] = useState<Error | null>(null);

  // 書き込み後の取り直し中の件数。0 より大きい間は loading にする
  const [pendingRefreshCount, setPendingRefreshCount] = useState(0);

  // 前後の月を先読みする (表示中の月を読み込み終えるたびに。先読み済みで新しい月は取り直さない)
  const dataUpdatedAt = query.dataUpdatedAt;
  const isSuccess = query.isSuccess;
  useEffect(() => {
    if (!isSuccess) return;
    prefetchAdjacentCalendarMonths(queryClient, api, month);
  }, [isSuccess, dataUpdatedAt, month, api, queryClient]);

  // 書き込み後に取り直す
  const refreshAfterWrite = useCallback(
    async (targetDate: Date) => {
      const targetMonth = toCalendarMonthKey(targetDate);
      const targetKey = calendarKeys.month(targetMonth);
      setPendingRefreshCount((count) => count + 1);
      setWriteRefreshError(null);
      try {
        // 表示していない月 (先読みした前後の月など) は書き込み前の内容なので捨てる。
        // 次に表示したときに取り直す (古い内容を一瞬でも見せない)
        queryClient.removeQueries({ queryKey: calendarKeys.all, type: "inactive" });
        // 日付詳細は書き込み前の内容を見せないよう、データを捨てて取り直す
        void queryClient.resetQueries({ queryKey: dayDetailKeys.all });
        // 書き込み前に始まった取得の結果で上書きされないよう、実行中の取得は止めてから取り直す
        await queryClient.cancelQueries({ queryKey: targetKey, exact: true });
        await queryClient.fetchQuery(calendarMonthQueryOptions(api, targetMonth));
      } catch (err) {
        // 後から始まった取り直し (削除のあとに再描画キーと refetch() の両方から呼ばれる場合など)
        // に取り消されただけなら、そちらが結果を出すのでエラーにしない
        if (isCancelledError(err)) return;
        console.error("Calendar data fetch error:", err);
        setWriteRefreshError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setPendingRefreshCount((count) => count - 1);
      }
    },
    [api, queryClient],
  );

  // 月の変更 (データの取得は月をキーにしたクエリが行う。キャッシュ済みの月は先に表示する)
  const setCurrentDate = useCallback((newDate: Date) => {
    setCurrentDateState(newDate);
    setWriteRefreshError(null);
  }, []);

  // 書き込み後の取り直しに失敗したあと、取得が成功したらエラー表示を消す
  const dataUpdatedAtAtErrorRef = useRef<number | null>(null);
  useEffect(() => {
    if (!writeRefreshError) {
      dataUpdatedAtAtErrorRef.current = null;
      return;
    }
    if (dataUpdatedAtAtErrorRef.current === null) {
      dataUpdatedAtAtErrorRef.current = dataUpdatedAt;
      return;
    }
    if (dataUpdatedAt > dataUpdatedAtAtErrorRef.current) setWriteRefreshError(null);
  }, [writeRefreshError, dataUpdatedAt]);

  // リフレッシュキーの変化 (保存・削除) を監視して書き込み後の内容を取り直す
  const previousRefreshKeyRef = useRef<number | undefined>(refreshKey);
  useEffect(() => {
    if (refreshKey === undefined) {
      return;
    }

    if (previousRefreshKeyRef.current === undefined) {
      previousRefreshKeyRef.current = refreshKey;
      return;
    }

    if (previousRefreshKeyRef.current !== refreshKey) {
      previousRefreshKeyRef.current = refreshKey;
      void refreshAfterWrite(currentDate);
    }
  }, [refreshKey, currentDate, refreshAfterWrite]);

  // アイテム操作 (表示中の月のキャッシュを直接書き換える)
  const updateCurrentMonthItems = useCallback(
    (updater: (items: CalendarItem[]) => CalendarItem[]) => {
      queryClient.setQueryData<CalendarMonthData>(calendarKeys.month(month), (prev) =>
        prev ? { ...prev, calendarItems: updater(prev.calendarItems) } : prev,
      );
    },
    [queryClient, month],
  );

  const addItem = useCallback(
    (item: CalendarItem) => updateCurrentMonthItems((prev) => [...prev, item]),
    [updateCurrentMonthItems],
  );

  const updateItem = useCallback(
    (id: string, updates: Partial<CalendarItem>) =>
      updateCurrentMonthItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      ),
    [updateCurrentMonthItems],
  );

  const removeItem = useCallback(
    (id: string) => updateCurrentMonthItems((prev) => prev.filter((item) => item.id !== id)),
    [updateCurrentMonthItems],
  );

  // refetch関数: 常に強制的にデータを再取得
  const refetch = useCallback(
    async (date?: Date) => {
      await refreshAfterWrite(date || currentDate);
    },
    [currentDate, refreshAfterWrite],
  );

  // データが無いときだけ loading / error にする。裏での取り直し中・取り直しの失敗では
  // 表示中のデータを隠さない (書き込み後の取り直しだけは例外で、終わるまで loading)
  const loading = (!data && !query.error) || pendingRefreshCount > 0;
  const error = writeRefreshError ?? (!data && query.error ? query.error : null);

  const value: CalendarContextType = {
    currentDate,
    calendarItems: data?.calendarItems ?? EMPTY_CALENDAR_ITEMS,
    monthlySummary: data?.monthlySummary ?? DEFAULT_MONTHLY_SUMMARY,
    loading,
    error,
    setCurrentDate,
    refetch,
    addItem,
    updateItem,
    removeItem,
  };

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (context === undefined) {
    throw new Error("useCalendar must be used within a CalendarProvider");
  }
  return context;
}
