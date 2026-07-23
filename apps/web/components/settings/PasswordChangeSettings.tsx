"use client";

import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { KeyIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Input from "@/components/ui/Input";

const MIN_PASSWORD_LENGTH = 6;

export default function PasswordChangeSettings() {
  const t = useTranslations("mypage.passwordChange");
  const tSettings = useTranslations("settings.password");
  const tCommon = useTranslations("common");
  const tModal = useTranslations("settings.email.modal");
  const { supabase } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // モーダルを開く時に状態をリセット
  const openModal = () => {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // ESCキーとフォーカストラップ
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isModalOpen]);

  const isTooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH;
  const isMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    newPassword.length >= MIN_PASSWORD_LENGTH && newPassword === confirmPassword && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(t("updateFailed"));
        return;
      }

      setSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("パスワード変更エラー:", err);
      setError(t("unexpectedError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* セクション: ボタンのみ表示 */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 pb-2 mb-4 border-b border-gray-200">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">{tSettings("title")}</h2>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <KeyIcon className="h-5 w-5 text-gray-400" />
            <span>{tSettings("title")}</span>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            {tSettings("openButton")}
          </button>
        </div>
      </div>

      {/* モーダル */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-change-dialog-title"
        >
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity animate-in fade-in duration-200"
            onClick={closeModal}
            aria-hidden="true"
          />

          {/* ダイアログ */}
          <div
            ref={dialogRef}
            className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-in zoom-in-95 fade-in duration-200"
          >
            {/* 閉じるボタン */}
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={tModal("closeAriaLabel")}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>

            <div className="p-6">
              <h3
                id="password-change-dialog-title"
                className="text-lg font-semibold text-gray-900 mb-4"
              >
                {t("title")}
              </h3>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                  {t("updateSuccess")}
                </div>
              )}

              {!success && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    type="password"
                    label={t("newPasswordLabel")}
                    placeholder={t("newPasswordPlaceholder")}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError(null);
                    }}
                    error={isTooShort ? t("passwordMinLength") : undefined}
                    required
                  />
                  <Input
                    type="password"
                    label={t("confirmPasswordLabel")}
                    placeholder={t("confirmPasswordPlaceholder")}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError(null);
                    }}
                    error={isMismatch ? t("passwordMismatch") : undefined}
                    required
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                    >
                      {tCommon("cancel")}
                    </button>
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? t("updating") : t("submitButton")}
                    </button>
                  </div>
                </form>
              )}

              {success && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                  >
                    {tCommon("cancel")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
