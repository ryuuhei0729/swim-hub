"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { parseISO, isValid } from "date-fns";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useRecordForm, useUnsavedChangesWarning } from "./hooks";
import { RecordBasicInfo, RecordSetItem } from "./components";
import type { RecordFormProps, RecordFormData } from "./types";
import { useAuth } from "@/contexts";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { validateSplitTimeLimit } from "@swim-hub/shared/utils/validators";

/**
 * 大会記録入力フォーム
 *
 * フェーズ3リファクタリングにより、865行から約180行に削減
 * - 状態管理: useRecordForm フック
 * - 離脱警告: useUnsavedChangesWarning フック
 * - 基本情報: RecordBasicInfo コンポーネント
 * - 記録入力: RecordSetItem コンポーネント
 */
export default function RecordForm({
  isOpen,
  onClose,
  onSubmit,
  initialDate,
  editData,
  isLoading = false,
  styles = [],
}: RecordFormProps) {

  const t = useTranslations("forms.record");
  const tUnsaved = useTranslations("forms.unsavedChanges");
  const { subscription } = useAuth();
  const isPremium = checkIsPremium(subscription);

  const {
    formData,
    setFormData,
    hasUnsavedChanges,
    isSubmitted,
    setIsSubmitted,
    resetUnsavedChanges,
    addRecord,
    removeRecord,
    updateRecord,
    addSplitTime,
    addSplitTimesEvery25m,
    addSplitTimesEvery50m,
    updateSplitTime,
    removeSplitTime,
    sanitizeFormData,
    isSplitTimeLimitReached,
    splitTimeLimitError,
  } = useRecordForm({ isOpen, initialDate, editData, styles, isPremium });

  // ブラウザ離脱警告
  useUnsavedChangesWarning({ isOpen, hasUnsavedChanges, isSubmitted });

  // 確認ダイアログの状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // isOpen が false になったら確認ダイアログとバリデーションエラーをリセット
  useEffect(() => {
    if (!isOpen) {
      setShowConfirmDialog(false);
      setRecordDateError(undefined);
    }
  }, [isOpen]);

  // バリデーションエラーの状態
  const [recordDateError, setRecordDateError] = useState<string | undefined>(undefined);

  if (!isOpen) return null;

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      setShowConfirmDialog(true);
      return;
    }
    onClose();
  };

  const handleConfirmClose = () => {
    setShowConfirmDialog(false);
    onClose();
  };

  const handleCancelClose = () => {
    setShowConfirmDialog(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // recordDate のバリデーション
    const sanitized = sanitizeFormData();
    if (!sanitized.recordDate || sanitized.recordDate === "") {
      setRecordDateError(t("validation.dateRequired"));
      return;
    }
    const parsedDate = parseISO(sanitized.recordDate);
    if (!isValid(parsedDate)) {
      setRecordDateError(t("validation.dateInvalid"));
      return;
    }
    setRecordDateError(undefined);

    // Split-time 件数バリデーション（送信前）
    if (!isPremium) {
      for (const record of sanitized.records) {
        const validation = validateSplitTimeLimit(record.splitTimes.length, isPremium);
        if (!validation.valid) {
          return;
        }
      }
    }

    setIsSubmitted(true);
    try {
      await onSubmit(sanitized);
      resetUnsavedChanges();
      onClose();
    } catch (error) {
      console.error("フォーム送信エラー:", error);
      setIsSubmitted(false);
    }
  };

  const handleFieldChange = (field: keyof RecordFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto" data-testid="record-form-modal">
      <div className="flex min-h-screen items-center justify-center p-0 sm:p-4">
        {/* オーバーレイ */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* ヘッダー */}
          <div className="bg-white px-3 py-3 sm:px-6 sm:py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg leading-6 font-medium text-gray-900">
                {editData ? t("title_edit") : t("title_create")}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label={t("closeAria")}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* 大会情報 */}
              <RecordBasicInfo
                formData={formData}
                onFieldChange={handleFieldChange}
                recordDateError={recordDateError}
              />

              {/* 記録セクション */}
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base sm:text-lg font-medium text-gray-900">{t("recordsHeader")}</h3>
                  <Button
                    type="button"
                    onClick={addRecord}
                    className="flex items-center gap-2"
                    data-testid="record-add-button"
                  >
                    <PlusIcon className="h-4 w-4" />
                    {t("addEvent")}
                  </Button>
                </div>

                {formData.records.map((record, recordIndex) => (
                  <RecordSetItem
                    key={record.id}
                    record={record}
                    recordIndex={recordIndex}
                    styles={styles}
                    canRemove={formData.records.length > 1}
                    onUpdate={(updates) => updateRecord(record.id, updates)}
                    onRemove={() => removeRecord(record.id)}
                    onAddSplitTime={() => addSplitTime(record.id)}
                    onAddSplitTimesEvery25m={() => addSplitTimesEvery25m(record.id)}
                    onAddSplitTimesEvery50m={() => addSplitTimesEvery50m(record.id)}
                    onUpdateSplitTime={(splitIndex, updates) =>
                      updateSplitTime(record.id, splitIndex, updates)
                    }
                    onRemoveSplitTime={(splitIndex) => removeSplitTime(record.id, splitIndex)}
                    isSplitTimeLimitReached={isSplitTimeLimitReached(record.id)}
                    splitTimeLimitError={splitTimeLimitError}
                    isPremium={isPremium}
                  />
                ))}
              </div>

              {/* 大会メモ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("competitionNoteLabel")}</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => handleFieldChange("note", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t("competitionNotePlaceholder")}
                  data-testid="tournament-note"
                />
              </div>
            </div>

            {/* フッター（固定） */}
            <div className="shrink-0 bg-white border-t px-4 sm:px-6 py-4 flex justify-end gap-2 sm:gap-3">
              <Button
                type="button"
                onClick={handleClose}
                variant="secondary"
                disabled={isLoading}
                data-testid="record-form-cancel-button"
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isLoading} data-testid="record-form-submit-button">
                {isLoading ? (editData ? t("saving") : t("saving")) : editData ? t("update") : t("save")}
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
        message={tUnsaved("messageClose")}
        confirmLabel={tUnsaved("confirmClose")}
        cancelLabel={tUnsaved("cancel")}
        variant="warning"
      />
    </div>
  );
}
