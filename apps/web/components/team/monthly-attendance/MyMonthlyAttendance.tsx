"use client";

/**
 * チーム「出欠」タブ (利用者)
 *
 * mobile のチームの出欠タブと同じく、今日〜12 か月先の練習・大会だけを出す (過去のものは出さず、回答もできない)。
 * 出席 / 欠席 / その他 は押した時点で保存し、備考は入力欄から離れたとき・Enter で保存する (保存ボタンは無い)。
 * - 月の一覧: 押すとその月の詳細 (モーダル)
 * - 直近の出欠: 今月 (今日以降)・来月
 * - 行を押すと、そのイベントの全員の出欠 (出欠状況モーダル)
 */
import React, { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/contexts";
import { useTranslations } from "next-intl";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import { TeamEvent } from "@swim-hub/shared/types";
import { groupMyAttendanceByMonth, type MyAttendanceItem } from "@/utils/teamAttendance";
import { MonthList } from "./components/MonthList";
import { RecentAttendance } from "./components/RecentAttendance";
import { MonthDetailModal } from "./components/MonthDetailModal";
import { AttendanceStatusModal } from "./components/AttendanceStatusModal";
import { useMyAttendanceList } from "./hooks/useMyAttendanceList";
import { useMyAttendanceSaver, type MyAnswerChange } from "./hooks/useMyAttendanceSaver";
import { useAttendanceStatus } from "./hooks/useAttendanceStatus";

export interface MyMonthlyAttendanceProps {
  teamId: string;
}

export default function MyMonthlyAttendance({ teamId }: MyMonthlyAttendanceProps) {
  const { supabase, user } = useAuth();
  const t = useTranslations("teams");
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase]);
  const userId = user?.id ?? null;

  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [selectedEventForAttendance, setSelectedEventForAttendance] = useState<TeamEvent | null>(
    null,
  );

  const { items, queryKey, loading, error } = useMyAttendanceList(teamId, supabase, userId);
  const {
    saveAnswer,
    error: saveError,
    clearError: clearSaveError,
  } = useMyAttendanceSaver({ supabase, attendanceAPI, userId, listKey: queryKey });

  const {
    attendanceData,
    teamMembers,
    loading: loadingAttendance,
    loadAttendanceData,
  } = useAttendanceStatus(teamId, supabase, isAttendanceModalOpen);

  const months = useMemo(() => groupMyAttendanceByMonth(items), [items]);
  // モーダルには一覧のキャッシュの最新の値を渡す (保存後の回答が反映される)
  const selectedMonth = useMemo(
    () => months.find((month) => month.key === selectedMonthKey) ?? null,
    [months, selectedMonthKey],
  );

  const handleSave = useCallback(
    (item: MyAttendanceItem, change: MyAnswerChange) => {
      void saveAnswer(item, change);
    },
    [saveAnswer],
  );

  const handleOpenAttendanceModal = useCallback(
    (item: MyAttendanceItem) => {
      setSelectedEventForAttendance(item.event);
      setIsAttendanceModalOpen(true);
      void loadAttendanceData(item.event);
    },
    [loadAttendanceData],
  );

  const handleCloseAttendanceModal = () => {
    setIsAttendanceModalOpen(false);
    setSelectedEventForAttendance(null);
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          <p className="mt-1.5 text-sm text-gray-500">{t("attendance.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {saveError && (
        <div
          className="mb-4 flex items-start justify-between gap-3 bg-red-50 border border-red-200 rounded-lg p-3"
          role="alert"
        >
          <p className="text-sm text-red-800">{saveError}</p>
          <button
            type="button"
            onClick={clearSaveError}
            className="text-xs text-red-700 hover:text-red-900 shrink-0"
          >
            {t("monthDetail.close")}
          </button>
        </div>
      )}

      <MonthList months={months} onMonthClick={(month) => setSelectedMonthKey(month.key)} />

      <RecentAttendance months={months} onSave={handleSave} onOpen={handleOpenAttendanceModal} />

      <MonthDetailModal
        isOpen={selectedMonthKey !== null}
        onClose={() => setSelectedMonthKey(null)}
        title={
          selectedMonth
            ? t("attendance.monthLabel", { year: selectedMonth.year, month: selectedMonth.month })
            : ""
        }
        items={selectedMonth?.items ?? []}
        onSave={handleSave}
        onEventClick={handleOpenAttendanceModal}
      />

      <AttendanceStatusModal
        isOpen={isAttendanceModalOpen}
        onClose={handleCloseAttendanceModal}
        event={selectedEventForAttendance}
        attendanceData={attendanceData}
        teamMembers={teamMembers}
        loading={loadingAttendance}
      />
    </div>
  );
}
