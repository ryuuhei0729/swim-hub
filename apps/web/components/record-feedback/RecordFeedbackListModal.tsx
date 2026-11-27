"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import RecordFeedbackSection from "./RecordFeedbackSection";

export interface RecordFeedbackListModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordId: string;
  /** 見出しに添える補足 (選手名・種目など) */
  subtitle?: string;
}

/** チーム記録一覧などから開く、記録1件のフィードバック一覧モーダル */
export default function RecordFeedbackListModal({
  isOpen,
  onClose,
  recordId,
  subtitle,
}: RecordFeedbackListModalProps) {
  const t = useTranslations("recordFeedback");
  const tCommon = useTranslations("common");
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-80 overflow-y-auto" data-testid="record-feedback-list-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40" onClick={onClose} />
        <div
          className="relative w-full max-w-lg rounded-lg bg-white shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-label={t("listModalTitle")}
        >
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900">{t("listModalTitle")}</h3>
              {subtitle && <p className="mt-0.5 truncate text-sm text-gray-500">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label={tCommon("aria.close")}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <RecordFeedbackSection recordId={recordId} showWhenEmpty />
          </div>
        </div>
      </div>
    </div>
  );
}
