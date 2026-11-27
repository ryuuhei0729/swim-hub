"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon, ClipboardDocumentCheckIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { useDayDetailAttendanceQuery } from "@/hooks/queries/dayDetailQueries";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";
import Link from "next/link";
import type { TeamAttendanceWithDetails } from "@apps/shared/types";
import type { AttendanceModalProps } from "../../types";

const EMPTY_ATTENDANCES: TeamAttendanceWithDetails[] = [];

export function AttendanceModal({
  isOpen,
  onClose,
  eventId,
  eventType,
  teamId,
}: AttendanceModalProps) {
  const { supabase } = useAuth();
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  // 出欠 (開くたびに取り直す。同じ予定を開き直したときは前回の内容を先に表示する)
  const {
    data,
    error: queryError,
    isFetching,
    refetch,
  } = useDayDetailAttendanceQuery(supabase, {
    eventType,
    eventId,
    enabled: isOpen,
  });
  const attendances = data ?? EMPTY_ATTENDANCES;
  // データが無いときだけ読み込み中・エラーを表示する (裏での取り直し中・その失敗では隠さない)
  // 再試行中は (エラーではなく) 読み込み中を表示する
  const loading = !data && (!queryError || isFetching);
  const error =
    !data && !isFetching && queryError
      ? toUserFacingMessage(queryError, t("attendance.fetchFailed"))
      : null;

  if (!isOpen) return null;

  const stats = {
    present: attendances.filter((a) => a.status === "present").length,
    absent: attendances.filter((a) => a.status === "absent").length,
    other: attendances.filter((a) => a.status === "other").length,
    pending: attendances.filter((a) => !a.status).length,
    total: attendances.length,
  };

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose} />

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-blue-300 w-full max-w-2xl">
          {/* ヘッダー */}
          <div className="bg-blue-50 px-4 pt-5 pb-4 sm:p-6 border-b border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardDocumentCheckIcon className="h-6 w-6 text-blue-600" />
                <h3 className="text-lg leading-6 font-medium text-gray-900">{t("attendance.title")}</h3>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* コンテンツ */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-gray-500">{t("attendance.loading")}</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-600 mb-4">{error}</p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {tCommon("retry")}
                </button>
              </div>
            ) : (
              <>
                {/* 統計サマリー */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-700">{stats.present}</div>
                    <div className="text-xs text-green-600 mt-1">{t("attendance.present")}</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-700">{stats.absent}</div>
                    <div className="text-xs text-red-600 mt-1">{t("attendance.absent")}</div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-700">{stats.other}</div>
                    <div className="text-xs text-yellow-600 mt-1">{t("attendance.other")}</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-gray-700">{stats.pending}</div>
                    <div className="text-xs text-gray-600 mt-1">{t("attendance.pending")}</div>
                  </div>
                </div>

                {/* 詳細リスト */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {t("attendance.nameCol")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {t("attendance.statusCol")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          {t("attendance.noteCol")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {attendances.map((attendance) => (
                        <tr key={attendance.id}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {attendance.user?.name || t("attendance.unknownUser")}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {attendance.status === "present" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {t("attendance.present")}
                              </span>
                            )}
                            {attendance.status === "absent" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                {t("attendance.absent")}
                              </span>
                            )}
                            {attendance.status === "other" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                {t("attendance.other")}
                              </span>
                            )}
                            {!attendance.status && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                {t("attendance.pending")}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {attendance.note || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
            <Link
              href={`/teams/${teamId}?tab=attendance`}
              className="w-full inline-flex justify-center items-center gap-2 rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto sm:text-sm"
            >
              <ClipboardDocumentCheckIcon className="h-4 w-4" />
              {t("attendance.changeButton")}
            </Link>
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              {t("attendance.closeButton")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
