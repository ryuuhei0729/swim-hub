"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { useBulkRegister } from "@/hooks/useBulkRegister";
import { TemplateDownload } from "@/components/bulk-register/TemplateDownload";
import { FileUpload } from "@/components/bulk-register/FileUpload";
import { DataPreview } from "@/components/bulk-register/DataPreview";
import ManualEntryForm from "@/components/bulk-register/ManualEntryForm";
import CalendarBulkRegisterForm from "@/components/bulk-register/calendar/CalendarBulkRegisterForm";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useOptionalQueryClient } from "@/hooks/queries/useOptionalQueryClient";
import {
  resetTeamQueriesAfterExternalSave,
  teamDetailKeys,
} from "@/hooks/queries/teamDetailKeys";

export interface TeamBulkRegisterProps {
  teamId: string;
  isAdmin?: boolean;
}

/**
 * 入力方式。calendar は mobile と同じカレンダー型 (日付を選ぶ・登録済みの印・大会と重なる注意)。
 * web ではファイル取込 (CSV・Excel) と1行ずつの手動入力も残す
 */
type EntryMode = "calendar" | "file" | "manual";

const ENTRY_MODES: { mode: EntryMode; labelKey: "modeTabCalendar" | "modeTabFile" | "modeTabManual" }[] = [
  { mode: "calendar", labelKey: "modeTabCalendar" },
  { mode: "file", labelKey: "modeTabFile" },
  { mode: "manual", labelKey: "modeTabManual" },
];

export default function TeamBulkRegister({ teamId, isAdmin = false }: TeamBulkRegisterProps) {
  const t = useTranslations("teamsAdmin");
  const { supabase } = useAuth();
  const [entryMode, setEntryMode] = useState<EntryMode>("calendar");
  const {
    selectedFile,
    parsedData,
    loading,
    error,
    success,
    registerResult,
    handleFileSelect,
    handleBulkRegister,
    setLoading,
    setError,
  } = useBulkRegister(supabase, teamId);
  const queryClient = useOptionalQueryClient();

  // 一括登録 (ファイル取込 / 手動入力) は練習・大会を作成する。手動入力は登録の完了を
  // この画面に伝えないため、このタブを離れるときに練習・大会一覧と出欠の月別サマリの
  // キャッシュを捨てる。捨てないと、練習・大会タブへ移った直後に登録前の一覧が一瞬出る
  // (このタブを開いただけで何も登録しなかった場合も捨てるが、次に開く一覧が
  // 読み込み表示から始まるだけで鮮度は変わらない)
  useEffect(() => {
    return () => {
      if (!queryClient) return;
      void resetTeamQueriesAfterExternalSave(queryClient, [
        teamDetailKeys.practicePages(teamId),
        teamDetailKeys.competitionPages(teamId),
        teamDetailKeys.myMonthListAll(teamId),
      ]);
    };
  }, [queryClient, teamId]);

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">{t("bulkRegister.unauthorized.title")}</h2>
        <div className="text-center py-8">
          <p className="text-gray-600">{t("bulkRegister.unauthorized.description")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">{t("bulkRegister.wrapperTitle")}</h2>

      {/* モード切替: カレンダー / ファイル取込 / 手動入力 */}
      <div
        role="tablist"
        aria-label={t("bulkRegister.wrapperTitle")}
        className="mb-6 flex overflow-hidden rounded-md border border-gray-200"
      >
        {ENTRY_MODES.map(({ mode, labelKey }) => (
          <button
            key={mode}
            role="tab"
            aria-selected={entryMode === mode}
            onClick={() => setEntryMode(mode)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              entryMode === mode
                ? "bg-blue-600 text-white"
                : "bg-gray-50 text-gray-700 hover:bg-gray-100"
            }`}
          >
            {t(`bulkRegister.${labelKey}`)}
          </button>
        ))}
      </div>

      {entryMode === "calendar" ? (
        <CalendarBulkRegisterForm teamId={teamId} />
      ) : entryMode === "manual" ? (
        <ManualEntryForm teamId={teamId} />
      ) : (
        <>
          {/* エラー表示 */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-400 shrink-0" />
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* 成功表示 */}
          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex">
                <CheckCircleIcon className="h-5 w-5 text-green-400 shrink-0" />
                <div className="ml-3">
                  <p className="text-sm text-green-800">{success}</p>
                </div>
              </div>
            </div>
          )}

          {/* テンプレートダウンロード */}
          <TemplateDownload loading={loading} onLoadingChange={setLoading} onError={setError} />

          {/* ファイルアップロード */}
          <FileUpload
            selectedFile={selectedFile}
            loading={loading}
            onFileSelect={handleFileSelect}
          />

          {/* プレビュー */}
          {parsedData && (
            <DataPreview
              parsedData={parsedData}
              loading={loading}
              onRegister={handleBulkRegister}
            />
          )}
        </>
      )}

      {/* 登録結果 (ファイルモード) */}
      {entryMode === "file" && registerResult && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-md font-medium text-blue-800 mb-2">{t("bulkRegister.result.title")}</h4>
          <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
            {registerResult.practicesCreated > 0 && (
              <li>{t("bulkRegister.result.practicesCreated", { count: registerResult.practicesCreated })}</li>
            )}
            {registerResult.competitionsCreated > 0 && (
              <li>{t("bulkRegister.result.competitionsCreated", { count: registerResult.competitionsCreated })}</li>
            )}
            {registerResult.errors.length > 0 && (
              <li className="text-red-700">{t("bulkRegister.result.errors", { errors: registerResult.errors.join(", ") })}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
