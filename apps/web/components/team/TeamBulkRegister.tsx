"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { useBulkRegister } from "@/hooks/useBulkRegister";
import { TemplateDownload } from "@/components/bulk-register/TemplateDownload";
import { FileUpload } from "@/components/bulk-register/FileUpload";
import { DataPreview } from "@/components/bulk-register/DataPreview";
import ManualEntryForm from "@/components/bulk-register/ManualEntryForm";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export interface TeamBulkRegisterProps {
  teamId: string;
  isAdmin?: boolean;
}

type EntryMode = "file" | "manual";

export default function TeamBulkRegister({ teamId, isAdmin = false }: TeamBulkRegisterProps) {
  const t = useTranslations("teamsAdmin");
  const { supabase } = useAuth();
  const [entryMode, setEntryMode] = useState<EntryMode>("file");
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

      {/* モード切替: ファイル取込 / 手動入力 */}
      <div
        role="tablist"
        aria-label={t("bulkRegister.wrapperTitle")}
        className="mb-6 flex overflow-hidden rounded-md border border-gray-200"
      >
        <button
          role="tab"
          aria-selected={entryMode === "file"}
          onClick={() => setEntryMode("file")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            entryMode === "file"
              ? "bg-blue-600 text-white"
              : "bg-gray-50 text-gray-700 hover:bg-gray-100"
          }`}
        >
          {t("bulkRegister.modeTabFile")}
        </button>
        <button
          role="tab"
          aria-selected={entryMode === "manual"}
          onClick={() => setEntryMode("manual")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            entryMode === "manual"
              ? "bg-blue-600 text-white"
              : "bg-gray-50 text-gray-700 hover:bg-gray-100"
          }`}
        >
          {t("bulkRegister.modeTabManual")}
        </button>
      </div>

      {entryMode === "manual" ? (
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
