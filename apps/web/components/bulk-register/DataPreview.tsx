"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { format, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import type { ParsedData } from "@/types/bulk-register";

interface DataPreviewProps {
  parsedData: ParsedData;
  loading: boolean;
  onRegister: () => void;
}

export function DataPreview({ parsedData, loading, onRegister }: DataPreviewProps) {
  const t = useTranslations("teamsAdmin");
  const errors = parsedData.type === "practice" ? parsedData.data.errors : parsedData.data.errors;
  const hasItems =
    parsedData.type === "practice"
      ? parsedData.data.practices.length > 0
      : parsedData.data.competitions.length > 0;

  return (
    <div className="mb-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        {t("dataPreview.title")}
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({parsedData.type === "practice" ? t("dataPreview.practiceType") : t("dataPreview.competitionType")}データ)
        </span>
      </h3>

      {/* エラー一覧 */}
      {errors.length > 0 && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="ml-3 flex-1">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">
                {t("dataPreview.errorTitle", { count: errors.length })}
              </h4>
              <div className="max-h-40 overflow-y-auto">
                <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                  {errors.slice(0, 20).map((err, index) => (
                    <li key={index}>
                      {err.sheet}シート {err.row}行目: {err.message}
                    </li>
                  ))}
                  {errors.length > 20 && (
                    <li className="text-yellow-600">{t("dataPreview.moreItems", { count: errors.length - 20 })}</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 登録予定データ */}
      <div className="space-y-4">
        {/* 練習データ */}
        {parsedData.type === "practice" && parsedData.data.practices.length > 0 && (
          <div>
            <h4 className="text-md font-medium text-gray-800 mb-2">
              {t("dataPreview.practiceCount", { count: parsedData.data.practices.length })}
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.practice.col.date")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.practice.col.title")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.practice.col.place")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.practice.col.note")}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {parsedData.data.practices.slice(0, 10).map((practice, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {isValid(new Date(practice.date))
                          ? format(new Date(practice.date), "yyyy年MM月dd日", { locale: ja })
                          : "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {practice.title || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {practice.place || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{practice.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedData.data.practices.length > 10 && (
                <p className="mt-2 text-sm text-gray-600">
                  {t("dataPreview.moreItems", { count: parsedData.data.practices.length - 10 })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 大会データ */}
        {parsedData.type === "competition" && parsedData.data.competitions.length > 0 && (
          <div>
            <h4 className="text-md font-medium text-gray-800 mb-2">
              {t("dataPreview.competitionCount", { count: parsedData.data.competitions.length })}
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.competition.col.startDate")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.competition.col.endDate")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.competition.col.name")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.competition.col.place")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.competition.col.poolType")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t("dataPreview.competition.col.note")}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {parsedData.data.competitions.slice(0, 10).map((competition, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {isValid(new Date(competition.date))
                          ? format(new Date(competition.date), "yyyy年MM月dd日", { locale: ja })
                          : "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {competition.end_date && isValid(new Date(competition.end_date))
                          ? format(new Date(competition.end_date), "yyyy年MM月dd日", { locale: ja })
                          : "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {competition.title || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {competition.place || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {competition.pool_type === 0
                          ? t("dataPreview.poolShort")
                          : competition.pool_type === 1
                            ? t("dataPreview.poolLong")
                            : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{competition.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedData.data.competitions.length > 10 && (
                <p className="mt-2 text-sm text-gray-600">
                  {t("dataPreview.moreItems", { count: parsedData.data.competitions.length - 10 })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 登録ボタン */}
        {hasItems && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={onRegister}
              disabled={loading}
              className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {t("dataPreview.registering")}
                </>
              ) : (
                `${parsedData.type === "practice" ? t("dataPreview.practiceType") : t("dataPreview.competitionType")}${t("dataPreview.registerButton")}`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
