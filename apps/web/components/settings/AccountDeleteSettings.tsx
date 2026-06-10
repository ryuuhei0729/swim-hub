"use client";

import React, { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export default function AccountDeleteSettings() {
  const t = useTranslations("settings.accountDelete");
  const tErrors = useTranslations("settings.accountDelete.errors");
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteAccount = useCallback(async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || tErrors("deleteFailed"));
      }

      // ローカルセッション・キャッシュをクリア
      await signOut();

      // ログイン画面にリダイレクト
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : tErrors("genericFailed"));
      setIsDeleting(false);
    }
  }, [session, signOut, router, tErrors]);

  return (
    <>
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-semibold text-gray-900">{t("title")}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          {t("description")}
        </p>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={isDeleting}
          className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          tabIndex={0}
          role="button"
          aria-label={t("deleteButton")}
        >
          {isDeleting ? t("deleting") : t("deleteButton")}
        </button>
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        onConfirm={() => {
          setShowConfirm(false);
          handleDeleteAccount();
        }}
        onCancel={() => setShowConfirm(false)}
        title={t("confirmDialog.title")}
        message={t("confirmDialog.message")}
        confirmLabel={t("confirmDialog.confirmLabel")}
        cancelLabel={t("confirmDialog.cancelLabel")}
        variant="danger"
      />
    </>
  );
}
