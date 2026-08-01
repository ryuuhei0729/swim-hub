"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { TeamBulkRegisterAPI, type BulkRegisterResult } from "@apps/shared/api/teams/bulkRegister";
import { useAuth } from "@/contexts";
import {
  validatePracticeRows,
  validateCompetitionRows,
  buildManualBulkRegisterInput,
  type PracticeRow,
  type CompetitionRow,
  type ManualMode,
  type ManualErrorTranslator,
} from "@/utils/teamBulkRegisterManual";

interface ManualEntryFormProps {
  teamId: string;
  onSuccess?: () => void;
}

const emptyPracticeRow = (date: string): PracticeRow => ({
  date,
  title: "",
  place: "",
  note: "",
});

const emptyCompetitionRow = (date: string): CompetitionRow => ({
  date,
  endDate: "",
  title: "",
  place: "",
  poolType: 0,
  note: "",
});

/**
 * チーム練習・大会の手動一括入力フォーム（web）。
 * バリデーション/変換は @/utils/teamBulkRegisterManual の純粋関数に委譲し、
 * 送信は共有 API TeamBulkRegisterAPI.bulkRegister を再利用する（手本 = mobile
 * components/teams/TeamBulkRegisterForm.tsx）。
 */
export default function ManualEntryForm({ teamId, onSuccess }: ManualEntryFormProps) {
  const t = useTranslations("teamsAdmin.bulkRegister");
  const { supabase } = useAuth();
  const api = useMemo(() => new TeamBulkRegisterAPI(supabase), [supabase]);
  const today = format(new Date(), "yyyy-MM-dd");

  const [mode, setMode] = useState<ManualMode>("practice");
  const [practiceRows, setPracticeRows] = useState<PracticeRow[]>([emptyPracticeRow(today)]);
  const [competitionRows, setCompetitionRows] = useState<CompetitionRow[]>([
    emptyCompetitionRow(today),
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkRegisterResult | null>(null);

  // 純粋バリデータへ渡す翻訳器（行番号を埋め込んだメッセージを組み立てる）
  const errorTranslator: ManualErrorTranslator = (key, row) => {
    const keyMap = {
      dateRequired: "manual.errorDateRequired",
      startDateRequired: "manual.errorStartDateRequired",
      endDateAfterStart: "manual.errorEndDateAfterStart",
    } as const;
    return t(keyMap[key], { row });
  };

  const updatePracticeRow = (index: number, key: keyof PracticeRow, value: string) => {
    setPracticeRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const updateCompetitionRow = (
    index: number,
    key: keyof CompetitionRow,
    value: string | number,
  ) => {
    setCompetitionRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  };

  const addPracticeRow = () => setPracticeRows((prev) => [...prev, emptyPracticeRow(today)]);
  const removePracticeRow = (index: number) =>
    setPracticeRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const addCompetitionRow = () =>
    setCompetitionRows((prev) => [...prev, emptyCompetitionRow(today)]);
  const removeCompetitionRow = (index: number) =>
    setCompetitionRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const handleSubmit = async () => {
    setResult(null);
    setError(null);

    const errors =
      mode === "practice"
        ? validatePracticeRows(practiceRows, errorTranslator)
        : validateCompetitionRows(competitionRows, errorTranslator);
    if (errors.length > 0) {
      setError(errors.join("\n"));
      return;
    }

    const input = buildManualBulkRegisterInput(mode, practiceRows, competitionRows);
    if (mode === "practice" && input.practices.length === 0) {
      setError(t("manual.practiceEmpty"));
      return;
    }
    if (mode === "competition" && input.competitions.length === 0) {
      setError(t("manual.competitionEmpty"));
      return;
    }

    try {
      setLoading(true);
      const res = await api.bulkRegister(teamId, input);
      setResult(res);
      if (res.success) {
        // 成功時はフォームをリセットし、親に通知
        setPracticeRows([emptyPracticeRow(today)]);
        setCompetitionRows([emptyCompetitionRow(today)]);
        onSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelClass = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <div className="mt-4">
      {/* 練習 / 大会 サブタブ */}
      <div
        role="tablist"
        aria-label={t("modeTabManual")}
        className="mb-4 flex overflow-hidden rounded-md border border-gray-200"
      >
        <button
          role="tab"
          aria-selected={mode === "practice"}
          onClick={() => {
            setMode("practice");
            setError(null);
            setResult(null);
          }}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mode === "practice" ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-700 hover:bg-gray-100"
          }`}
        >
          {t("manual.tabPractice")}
        </button>
        <button
          role="tab"
          aria-selected={mode === "competition"}
          onClick={() => {
            setMode("competition");
            setError(null);
            setResult(null);
          }}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mode === "competition"
              ? "bg-blue-600 text-white"
              : "bg-gray-50 text-gray-700 hover:bg-gray-100"
          }`}
        >
          {t("manual.tabCompetition")}
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mb-4 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* 練習行 */}
      {mode === "practice" && (
        <div className="space-y-3">
          {practiceRows.map((row, index) => (
            <div key={index} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">
                  {t("manual.rowTitlePractice", { n: index + 1 })}
                </h4>
                {practiceRows.length > 1 && (
                  <button
                    onClick={() => removePracticeRow(index)}
                    aria-label={t("manual.deleteRowButton")}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    {t("manual.deleteRowButton")}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor={`p-date-${index}`}>
                    {t("manual.labelDate")}
                  </label>
                  <input
                    id={`p-date-${index}`}
                    type="date"
                    value={row.date}
                    onChange={(e) => updatePracticeRow(index, "date", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`p-title-${index}`}>
                    {t("manual.labelTitle")}
                  </label>
                  <input
                    id={`p-title-${index}`}
                    type="text"
                    value={row.title}
                    onChange={(e) => updatePracticeRow(index, "title", e.target.value)}
                    placeholder={t("manual.titlePlaceholder")}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`p-place-${index}`}>
                    {t("manual.labelPlace")}
                  </label>
                  <input
                    id={`p-place-${index}`}
                    type="text"
                    value={row.place}
                    onChange={(e) => updatePracticeRow(index, "place", e.target.value)}
                    placeholder={t("manual.placePlaceholder")}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor={`p-note-${index}`}>
                    {t("manual.labelNote")}
                  </label>
                  <textarea
                    id={`p-note-${index}`}
                    value={row.note}
                    onChange={(e) => updatePracticeRow(index, "note", e.target.value)}
                    placeholder={t("manual.notePlaceholder")}
                    rows={2}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addPracticeRow}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <PlusIcon className="h-4 w-4" />
            {t("manual.addPracticeRowButton")}
          </button>
        </div>
      )}

      {/* 大会行 */}
      {mode === "competition" && (
        <div className="space-y-3">
          {competitionRows.map((row, index) => (
            <div key={index} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">
                  {t("manual.rowTitleCompetition", { n: index + 1 })}
                </h4>
                {competitionRows.length > 1 && (
                  <button
                    onClick={() => removeCompetitionRow(index)}
                    aria-label={t("manual.deleteRowButton")}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                    {t("manual.deleteRowButton")}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor={`c-date-${index}`}>
                    {t("manual.labelStartDate")}
                  </label>
                  <input
                    id={`c-date-${index}`}
                    type="date"
                    value={row.date}
                    onChange={(e) => updateCompetitionRow(index, "date", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`c-enddate-${index}`}>
                    {t("manual.labelEndDate")}
                  </label>
                  <input
                    id={`c-enddate-${index}`}
                    type="date"
                    value={row.endDate}
                    min={row.date || undefined}
                    onChange={(e) => updateCompetitionRow(index, "endDate", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`c-title-${index}`}>
                    {t("manual.labelCompetitionName")}
                  </label>
                  <input
                    id={`c-title-${index}`}
                    type="text"
                    value={row.title}
                    onChange={(e) => updateCompetitionRow(index, "title", e.target.value)}
                    placeholder={t("manual.competitionNamePlaceholder")}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`c-place-${index}`}>
                    {t("manual.labelPlace")}
                  </label>
                  <input
                    id={`c-place-${index}`}
                    type="text"
                    value={row.place}
                    onChange={(e) => updateCompetitionRow(index, "place", e.target.value)}
                    placeholder={t("manual.placePlaceholder")}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <span className={labelClass}>{t("manual.labelPoolType")}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-pressed={row.poolType === 0}
                      onClick={() => updateCompetitionRow(index, "poolType", 0)}
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                        row.poolType === 0
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t("manual.poolShort")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={row.poolType === 1}
                      onClick={() => updateCompetitionRow(index, "poolType", 1)}
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                        row.poolType === 1
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t("manual.poolLong")}
                    </button>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor={`c-note-${index}`}>
                    {t("manual.labelNote")}
                  </label>
                  <textarea
                    id={`c-note-${index}`}
                    value={row.note}
                    onChange={(e) => updateCompetitionRow(index, "note", e.target.value)}
                    placeholder={t("manual.notePlaceholder")}
                    rows={2}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addCompetitionRow}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <PlusIcon className="h-4 w-4" />
            {t("manual.addCompetitionRowButton")}
          </button>
        </div>
      )}

      {/* 登録ボタン */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-5 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {loading ? t("manual.submitting") : t("manual.submitButton")}
      </button>

      {/* 登録結果 */}
      {result && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h4 className="mb-2 text-sm font-medium text-blue-800">{t("result.title")}</h4>
          <ul className="list-inside list-disc space-y-1 text-sm text-blue-700">
            {result.practicesCreated > 0 && (
              <li>{t("result.practicesCreated", { count: result.practicesCreated })}</li>
            )}
            {result.competitionsCreated > 0 && (
              <li>{t("result.competitionsCreated", { count: result.competitionsCreated })}</li>
            )}
            {result.errors.length > 0 && (
              <li className="text-red-700">{t("result.errors", { errors: result.errors.join(", ") })}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
