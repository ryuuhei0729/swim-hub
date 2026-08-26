"use client";

import { useTranslations } from "next-intl";
import { TrashIcon } from "@heroicons/react/24/outline";

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** 通常の確認文言に追加で表示する警告文（例: 紐づく記録の件数警告）。未指定なら非表示 */
  extraMessage?: string;
  /** true の間、確認ボタンを無効化する（例: 件数取得中の二重押下防止） */
  isConfirmDisabled?: boolean;
}

/**
 * 削除確認モーダル
 *
 * ダッシュボード (DayDetailModal) と練習/大会履歴タブ (PracticeDetailModal / CompetitionDetailModal)
 * から共通で利用される。挙動・見た目を完全に一致させるための共通コンポーネント。
 */
export function DeleteConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  extraMessage,
  isConfirmDisabled = false,
}: DeleteConfirmModalProps) {
  const t = useTranslations("dashboard");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity"></div>

        <div
          className="relative bg-white rounded-lg shadow-2xl border-2 border-red-300 w-full max-w-lg"
          data-testid="confirm-dialog"
        >
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mx-auto shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                <TrashIcon className="h-6 w-6 text-red-600" />
              </div>
              <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                <h3 className="text-lg leading-6 font-medium text-gray-900">{t("deleteConfirm.title")}</h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">{t("deleteConfirm.message")}</p>
                  {extraMessage && (
                    <p className="text-sm text-red-600 mt-1" data-testid="delete-confirm-extra-message">
                      {extraMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onConfirm}
              disabled={isConfirmDisabled}
              data-testid="confirm-delete-button"
            >
              {t("deleteConfirm.confirm")}
            </button>
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={onCancel}
              data-testid="cancel-delete-button"
            >
              {t("deleteConfirm.cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
