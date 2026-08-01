"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  format,
  parseISO,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from "date-fns";
import { getCalendarGridRange } from "../_utils/calendarGridRange";
import { useCalendar } from "../_providers/CalendarProvider";
import DayDetailModal from "./DayDetailModal";
import CalendarHeader from "./CalendarHeader";
import CalendarGrid from "./CalendarGrid";
import { useAuth } from "@/contexts";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks";
import { resolveCalendarItemColor } from "@apps/shared/utils/calendarColorResolver";
import type { CalendarItem, CalendarProps } from "@apps/shared/types/ui";

// カレンダー表示コンポーネント（表示ロジック）
export default function CalendarView({
  entries: _propEntries,
  onDateClick,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onAddPracticeLog,
  onAddPracticeLogFromTemplate,
  onEditPracticeLog,
  onDeletePracticeLog,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
  isLoading: propLoading = false,
  userId: propUserId,
}: Omit<CalendarProps, "currentDate" | "onCurrentDateChange">) {
  const router = useRouter();
  const t = useTranslations("dashboard");
  const { supabase, user } = useAuth();
  const userId = propUserId ?? user?.id;
  const { settings: calendarColorSettings } = useCalendarColorSettingsQuery(supabase, userId);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [currentYear, setCurrentYear] = useState(2024); // SSR安全な初期値

  // マウント済みフラグ: SSR と CSR でタイムゾーンが異なる場合に calendarDays や
  // format(currentDate, ...) の出力が変わることで hydration mismatch が起きる。
  // マウント前はスケルトン表示に固定して不一致を防ぐ。
  const [mounted, setMounted] = useState(false);

  // クライアント側でのみ現在年・mountedを設定（Hydration Mismatch回避）
  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
    setMounted(true);
  }, []);

  // カレンダーコンテキストからデータを取得
  const {
    currentDate,
    calendarItems,
    monthlySummary: _monthlySummary,
    loading: dataLoading,
    error,
    setCurrentDate,
    refetch,
  } = useCalendar();

  // プロップスのentriesが指定されている場合はそれを優先、そうでなければカレンダーデータを使用
  const entries = calendarItems;
  const isLoading = propLoading || dataLoading;

  // グリッドの可視範囲を単一の真実源から取得（データ取得範囲と完全一致させる）
  const { startDate: gridStartDate, endDate: gridEndDate } = getCalendarGridRange(currentDate);
  const calendarStart = parseISO(gridStartDate);
  const calendarEnd = parseISO(gridEndDate);

  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  // 日付別のエントリーをマッピング
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    // 同じcompetition.idのエントリーが重複しないように、entryタイプを優先
    // 日付ごとにcompetition.idを追跡
    const competitionIdsByDate = new Map<string, Set<string>>();

    // まず、entryタイプのアイテムを処理
    entries.forEach((item) => {
      const dateKey = item.date;
      const competitionId = item.metadata?.competition?.id;

      if (item.type === "entry" && competitionId) {
        if (!competitionIdsByDate.has(dateKey)) {
          competitionIdsByDate.set(dateKey, new Set());
        }
        const competitionIds = competitionIdsByDate.get(dateKey)!;
        if (!competitionIds.has(competitionId)) {
          competitionIds.add(competitionId);
          if (!map.has(dateKey)) {
            map.set(dateKey, []);
          }
          map.get(dateKey)!.push(item);
        }
      }
    });

    // 次に、team_competitionタイプのアイテムを処理（同じcompetition.idのentryタイプが存在しない場合のみ）
    entries.forEach((item) => {
      const dateKey = item.date;
      const competitionId = item.metadata?.competition?.id;

      if (item.type === "team_competition" && competitionId) {
        const competitionIds = competitionIdsByDate.get(dateKey);
        if (!competitionIds || !competitionIds.has(competitionId)) {
          if (!competitionIdsByDate.has(dateKey)) {
            competitionIdsByDate.set(dateKey, new Set());
          }
          competitionIdsByDate.get(dateKey)!.add(competitionId);
          if (!map.has(dateKey)) {
            map.set(dateKey, []);
          }
          map.get(dateKey)!.push(item);
        }
      } else if (item.type !== "entry") {
        // その他のタイプ（entryとteam_competition以外）はそのまま追加
        if (!map.has(dateKey)) {
          map.set(dateKey, []);
        }
        map.get(dateKey)!.push(item);
      }
    });

    return map;
  }, [entries]);

  const handlePrevMonth = () => {
    const newDate = subMonths(currentDate, 1);
    setCurrentDate(newDate);
    // setCurrentDate内で自動的にデータ再取得が実行されるため、refetch()は不要
  };

  const handleNextMonth = () => {
    const newDate = addMonths(currentDate, 1);
    setCurrentDate(newDate);
    // setCurrentDate内で自動的にデータ再取得が実行されるため、refetch()は不要
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setShowDayDetail(true);
    onDateClick?.(date);
  };

  const handleAddClick = (date: Date) => {
    setSelectedDate(date);
    setShowDayDetail(true);
  };

  const getDateEntries = (date: Date) => {
    const dateKey = format(date, "yyyy-MM-dd");
    return entriesByDate.get(dateKey) || [];
  };

  // アイテムの表示色(hex)をユーザーのカスタム設定(個人/チーム別)から解決する。
  // resolver は未設定ユーザーには既存の緑(練習)/青(大会)と同値のデフォルト hex を返す。
  // 「デフォルトのまま = 旧 Tailwind クラスでピクセル一致を維持する」の実際の分岐は
  // CalendarGrid 側で resolver 戻り値とデフォルト色を比較して行う。
  const getItemColor = (item: CalendarItem) =>
    resolveCalendarItemColor(item.type, item.metadata, calendarColorSettings);

  const handleMonthYearSelect = (year: number, month: number) => {
    const newDate = new Date(year, month, 1);
    setCurrentDate(newDate);
    setShowMonthSelector(false);
    // setCurrentDate内で自動的にデータ再取得が実行されるため、refetch()は不要
  };

  const handleTodayClick = () => {
    const today = new Date();
    setCurrentDate(today);
    // setCurrentDate内で自動的にデータ再取得が実行されるため、refetch()は不要
  };

  // エラー表示
  if (error && !isLoading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">{t("calendarView.title")}</h2>
        </div>
        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <ExclamationTriangleIcon className="h-8 w-8 text-red-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              データの読み込みに失敗しました
            </h3>
            <p className="text-gray-600 mb-6 max-w-md">
              カレンダーデータを取得できませんでした。ネットワーク接続を確認してから再試行してください。
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => refetch()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                再試行
              </button>
              <button
                onClick={() => router.refresh()}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                ページを更新
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow" data-testid="calendar">
      {/* ヘッダー */}
      <CalendarHeader
        currentDate={currentDate}
        isLoading={!mounted || isLoading}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onTodayClick={handleTodayClick}
        onMonthYearSelect={handleMonthYearSelect}
        showMonthSelector={showMonthSelector}
        setShowMonthSelector={setShowMonthSelector}
      />

      {/* カレンダー本体 */}
      <CalendarGrid
        calendarDays={calendarDays}
        currentDate={currentDate}
        entriesByDate={entriesByDate}
        isLoading={!mounted || isLoading}
        onDateClick={handleDateClick}
        onAddClick={handleAddClick}
        getItemColor={getItemColor}
      />

      {/* 年月選択モーダル */}
      {showMonthSelector && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* オーバーレイ */}
            <div
              className="fixed inset-0 bg-black/40 transition-opacity"
              onClick={() => setShowMonthSelector(false)}
            ></div>

            {/* モーダルコンテンツ */}
            <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">{t("calendarView.selectMonth")}</h3>
                    <div className="space-y-4">
                      {/* 年選択 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t("calendarView.yearLabel")}</label>
                        <select
                          value={currentDate.getFullYear()}
                          onChange={(e) =>
                            handleMonthYearSelect(parseInt(e.target.value), currentDate.getMonth())
                          }
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {Array.from(
                            { length: 10 },
                            (_, i) => currentYear - 5 + i,
                          ).map((year) => (
                            <option key={year} value={year}>
                              {year}年
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 月選択 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t("calendarView.monthLabel")}</label>
                        <div className="grid grid-cols-3 gap-2">
                          {Array.from({ length: 12 }, (_, i) => i).map((month) => (
                            <button
                              key={month}
                              onClick={() =>
                                handleMonthYearSelect(currentDate.getFullYear(), month)
                              }
                              className={`
                                px-3 py-2 text-sm rounded-md border transition-colors
                                ${
                                  currentDate.getMonth() === month
                                    ? "bg-blue-600 text-white border-blue-600"
                                    : "bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300"
                                }
                              `}
                            >
                              {month + 1}月
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowMonthSelector(false)}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 日付詳細モーダル */}
      {showDayDetail && selectedDate && (
        <DayDetailModal
          isOpen={showDayDetail}
          onClose={() => {
            setShowDayDetail(false);
            setSelectedDate(null);
          }}
          date={selectedDate}
          entries={getDateEntries(selectedDate)}
          onEditItem={onEditItem}
          onDeleteItem={(itemId, itemType) => {
            onDeleteItem?.(itemId, itemType);
            refetch();
          }}
          onAddItem={(date, type) => {
            setShowDayDetail(false);
            setSelectedDate(null);
            onAddItem?.(date, type);
          }}
          onAddPracticeLog={onAddPracticeLog}
          onAddPracticeLogFromTemplate={onAddPracticeLogFromTemplate}
          onEditPracticeLog={onEditPracticeLog}
          onDeletePracticeLog={onDeletePracticeLog}
          onAddRecord={onAddRecord}
          onEditRecord={onEditRecord}
          onDeleteRecord={onDeleteRecord}
        />
      )}
    </div>
  );
}
