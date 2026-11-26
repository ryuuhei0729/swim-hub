"use client";

import React, { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import Button from "@/components/ui/Button";
import {
  useCreateRecordFeedbackMutation,
  useUpdateRecordFeedbackMutation,
} from "@apps/shared/hooks/queries/recordFeedbacks";
import { toRecordFeedbackErrorCode } from "@apps/shared/api/recordFeedbacks";
import { RECORD_FEEDBACK_MAX_LENGTH } from "@apps/shared/types/recordFeedback";

export interface RecordFeedbackFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string;
  /** 指定すると編集モード (自分の FB の本文を書き換える) */
  feedback?: { id: string; content: string } | null;
  /** 「〇〇さんへ」の表示に使う (省略時は出さない) */
  recipientName?: string | null;
  onSaved?: () => void;
}

/**
 * フィードバックの作成・編集モーダル (管理者用)。
 * 本文は前後の空白を除いて 1〜1000 文字。権限・重複は DB 側で判定し、
 * 返ってきたエラーを toRecordFeedbackErrorCode で文言に変換する。
 */
export default function RecordFeedbackFormModal({
  isOpen,
  onClose,
  recordId,
  feedback,
  recipientName,
  onSaved,
}: RecordFeedbackFormModalProps) {
  const t = useTranslations("recordFeedback");
  const { supabase } = useAuth();
  const textareaId = useId();
  const isEdit = !!feedback;
  const [content, setContent] = useState(feedback?.content ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createMutation = useCreateRecordFeedbackMutation(supabase);
  const updateMutation = useUpdateRecordFeedbackMutation(supabase);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  // 開き直したら入力を初期化する
  useEffect(() => {
    if (isOpen) {
      setContent(feedback?.content ?? "");
      setErrorMessage(null);
    }
  }, [isOpen, feedback?.id, feedback?.content]);

  if (!isOpen) return null;

  const trimmedLength = content.trim().length;
  const isTooLong = trimmedLength > RECORD_FEEDBACK_MAX_LENGTH;
  const canSubmit = trimmedLength > 0 && !isTooLong && !isSaving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorMessage(null);
    try {
      if (feedback) {
        await updateMutation.mutateAsync({ feedbackId: feedback.id, recordId, content });
      } else {
        await createMutation.mutateAsync({ recordId, content });
      }
      onSaved?.();
      onClose();
    } catch (error) {
      setErrorMessage(t(`errors.${toRecordFeedbackErrorCode(error)}`));
    }
  };

  return (
    <div className="fixed inset-0 z-80 overflow-y-auto" data-testid="record-feedback-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40" onClick={isSaving ? undefined : onClose} />
        <form
          onSubmit={handleSubmit}
          className="relative w-full max-w-lg rounded-lg bg-white shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${textareaId}-title`}
        >
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <div>
              <h3 id={`${textareaId}-title`} className="text-base font-semibold text-gray-900">
                {isEdit ? t("form.editTitle") : t("form.createTitle")}
              </h3>
              {recipientName && (
                <p className="mt-0.5 text-sm text-gray-500">
                  {t("form.recipient", { name: recipientName })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="text-gray-400 hover:text-gray-600"
              aria-label={t("form.cancel")}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="p-4">
            <label htmlFor={textareaId} className="sr-only">
              {t("form.label")}
            </label>
            <textarea
              id={textareaId}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder={t("form.placeholder")}
              className="w-full resize-y rounded-md border border-gray-300 p-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="record-feedback-textarea"
              autoFocus
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-red-600" role="alert">
                {isTooLong ? t("form.tooLong", { max: RECORD_FEEDBACK_MAX_LENGTH }) : errorMessage}
              </span>
              <span
                className={isTooLong ? "text-red-600" : "text-gray-500"}
                data-testid="record-feedback-counter"
              >
                {t("form.counter", { count: trimmedLength, max: RECORD_FEEDBACK_MAX_LENGTH })}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              {t("form.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              loading={isSaving}
              data-testid="record-feedback-submit"
            >
              {isSaving ? t("form.saving") : isEdit ? t("form.save") : t("form.submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
