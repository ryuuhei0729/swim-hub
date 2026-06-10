"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormStepper from "@/components/ui/FormStepper";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { format } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import { useRecordLogForm } from "./hooks/useRecordLogForm";
import { RecordLogEntry } from "./components";
import type { RecordLogFormProps, StyleOption } from "./types";
import type { EntryInfo } from "@apps/shared/types/ui";
import { useBestTimes } from "@/hooks/useBestTimes";
import { useAuth } from "@/contexts";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";

const EMPTY_STYLES: StyleOption[] = [];
const EMPTY_ENTRY_DATA_LIST: EntryInfo[] = [];

/**
 * 記録ログフォームコンポーネント
 *
 * 大会記録を登録・編集するためのモーダルフォーム
 */
export default function RecordLogForm({
  isOpen,
  onClose,
  onSubmit,
  competitionId: _competitionId,
  competitionTitle,
  competitionDate,
  poolType = 0,
  editData,
  isLoading = false,
  styles = EMPTY_STYLES,
  entryDataList = EMPTY_ENTRY_DATA_LIST,
}: RecordLogFormProps) {
  const t = useTranslations("forms.recordLog");
  const tCompetition = useTranslations("forms.competition");
  const tUnsaved = useTranslations("forms.unsavedChanges");
  const locale = useLocale();
  const dateFnsLocale = locale === "ja" ? ja : enUS;

  const COMPETITION_STEPS = useMemo(
    () => [
      {
        id: "basic",
        label: tCompetition("steps.basic.label"),
        description: tCompetition("steps.basic.description"),
      },
      {
        id: "entry",
        label: tCompetition("steps.entry.label"),
        description: tCompetition("steps.entry.description"),
      },
      {
        id: "record",
        label: tCompetition("steps.record.label"),
        description: tCompetition("steps.record.description"),
      },
    ],
    [tCompetition],
  );

  const { supabase, user, subscription } = useAuth();
  const isPremium = checkIsPremium(subscription);
  const { bestTimes, loadBestTimes } = useBestTimes(supabase);

  // ベストタイムを取得
  useEffect(() => {
    if (isOpen && user?.id) {
      loadBestTimes(user.id);
    }
  }, [isOpen, user?.id, loadBestTimes]);

  const {
    formDataList,
    hasUnsavedChanges,
    isSubmitted,
    setIsSubmitted,
    resetUnsavedChanges,
    resetFormData,
    handleTimeChange,
    handleToggleRelaying,
    handleNoteChange,
    handleVideoPathChange,
    handlePendingFileChange,
    handleReactionTimeChange,
    handleStyleChange,
    handleAddSplitTime,
    handleAddSplitTimesEvery25m,
    handleAddSplitTimesEvery50m,
    handleRemoveSplitTime,
    handleSplitTimeChange,
    prepareSubmitData,
    isSplitTimeLimitReached,
  } = useRecordLogForm({
    isOpen,
    editData,
    entryDataList,
    styles,
    isPremium,
  });

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const handlePopState = () => {
      // ガードフラグが立っている場合は何もしない（再入防止）
      if (isHandlingBackRef.current) {
        return;
      }
      if (hasUnsavedChanges && !isSubmitted) {
        // 履歴を戻す（ダイアログ表示中は戻らない）
        window.history.pushState(null, "", window.location.href);
        setConfirmContext("back");
        setShowConfirmDialog(true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      // アンマウント時にガードフラグをクリア
      isHandlingBackRef.current = false;
    };
  }, [isOpen, hasUnsavedChanges, isSubmitted]);

  const [formError, setFormError] = useState<string | null>(null);
  // 確認ダイアログの表示状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // 確認ダイアログのコンテキスト（close: モーダル閉じる, back: ブラウザバック）
  const [confirmContext, setConfirmContext] = useState<"close" | "back">("close");
  // ブラウザバック処理中のガードフラグ（再入防止用）
  const isHandlingBackRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitted(true);

    const { hasStyleError, submitList } = prepareSubmitData();

    if (hasStyleError) {
      setFormError(t("formError_noStyle"));
      setIsSubmitted(false);
      return;
    }

    if (submitList.length === 0) {
      setFormError(t("formError_noTime"));
      setIsSubmitted(false);
      return;
    }

    try {
      await onSubmit(submitList);
      resetUnsavedChanges();
    } catch (error) {
      console.error("フォーム送信エラー:", error);
      setIsSubmitted(false);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext("close");
      setShowConfirmDialog(true);
      return;
    }
    resetFormData();
    onClose();
  };

  const handleConfirmClose = () => {
    if (confirmContext === "back") {
      // ガードフラグを立ててからナビゲーション実行（再入防止）
      isHandlingBackRef.current = true;
      resetUnsavedChanges();
      window.history.back();
    }
    setShowConfirmDialog(false);
    resetFormData();
    onClose();
  };

  const handleCancelClose = () => {
    setShowConfirmDialog(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto" data-testid="record-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-3xl max-h-[90vh] flex flex-col">
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                {(competitionTitle || competitionDate) && (
                  <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-lg font-bold text-gray-900">
                      {competitionDate && competitionTitle && (
                        <>
                          <span className="text-base font-semibold text-blue-700">
                            {format(new Date(competitionDate), "yyyy年M月d日(E)", {
                              locale: dateFnsLocale,
                            })}
                          </span>
                          <span className="ml-3">{competitionTitle}</span>
                        </>
                      )}
                      {competitionDate &&
                        !competitionTitle &&
                        format(new Date(competitionDate), "yyyy年M月d日(E)", { locale: dateFnsLocale })}
                      {!competitionDate && competitionTitle && competitionTitle}
                    </p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            {/* ステッププログレス（編集モードでない場合のみ表示） */}
            {!editData && (
              <div className="mb-4">
                <FormStepper
                  steps={COMPETITION_STEPS}
                  currentStep={2}
                  skippedSteps={entryDataList.length === 0 ? [1] : []}
                />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6 sm:pb-6 space-y-3 sm:space-y-6">
              {formError && (
                <div
                  className="rounded-md bg-red-50 border border-red-200 p-4"
                  role="alert"
                  aria-live="polite"
                  data-testid="record-form-error"
                >
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}
              {formDataList.map((formData, index) => {
                const entryInfo = entryDataList[index];

                return (
                  <RecordLogEntry
                    key={entryInfo ? `${entryInfo.styleId}-${index}` : `record-${index}`}
                    formData={formData}
                    index={index}
                    entryInfo={entryInfo}
                    styles={styles}
                    poolType={poolType}
                    bestTimes={bestTimes}
                    isLoading={isLoading}
                    onTimeChange={(value) => handleTimeChange(index, value)}
                    onToggleRelaying={(checked) => handleToggleRelaying(index, checked)}
                    onNoteChange={(value) => handleNoteChange(index, value)}
                    onVideoPathChange={(vPath, tPath) => handleVideoPathChange(index, vPath, tPath)}
                    onVideoDelete={() => handleVideoPathChange(index, "", "")}
                    recordId={editData?.id}
                    videoPath={formData.videoPath}
                    videoThumbnailPath={formData.videoThumbnailPath}
                    onReactionTimeChange={(value) => handleReactionTimeChange(index, value)}
                    onStyleChange={(value) => handleStyleChange(index, value)}
                    onAddSplitTime={() => handleAddSplitTime(index)}
                    onAddSplitTimesEvery25m={() => handleAddSplitTimesEvery25m(index)}
                    onAddSplitTimesEvery50m={() => handleAddSplitTimesEvery50m(index)}
                    onRemoveSplitTime={(splitIndex) => handleRemoveSplitTime(index, splitIndex)}
                    onSplitTimeChange={(splitIndex, field, value) =>
                      handleSplitTimeChange(index, splitIndex, field, value)
                    }
                    isSplitTimeLimitReached={isSplitTimeLimitReached(index)}
                    isPremium={isPremium}
                    onPendingFile={
                      !editData?.id
                        ? (file, thumbnail) => handlePendingFileChange(index, file, thumbnail)
                        : undefined
                    }
                  />
                );
              })}
            </div>

            {/* フッター（固定） */}
            <div className="shrink-0 bg-gray-50 px-4 py-3 sm:px-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto"
                data-testid={editData ? "update-record-button" : "save-record-button"}
              >
                {isLoading ? t("saving") : editData ? t("update") : t("save")}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* 確認ダイアログ */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        title={tUnsaved("title")}
        message={
          confirmContext === "back"
            ? tUnsaved("messageBack")
            : tUnsaved("messageClose")
        }
        confirmLabel={confirmContext === "back" ? tUnsaved("confirmBack") : tUnsaved("confirmClose")}
        cancelLabel={tUnsaved("cancel")}
        variant="warning"
      />
    </div>
  );
}
