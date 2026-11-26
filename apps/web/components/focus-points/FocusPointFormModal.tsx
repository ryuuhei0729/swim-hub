"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import BaseModal from "@/components/ui/BaseModal";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/contexts";
import { isFocusPointLimitError } from "@apps/shared/api/focusPoints";
import {
  FOCUS_POINT_MAX_ACTIVE,
  FOCUS_POINT_NOTE_MAX_LENGTH,
  FOCUS_POINT_TITLE_MAX_LENGTH,
} from "@apps/shared/constants/focusPoints";
import {
  useCreateFocusPointMutation,
  useDeleteFocusPointMutation,
  useSetFocusPointStatusMutation,
  useUpdateFocusPointMutation,
} from "@apps/shared/hooks/queries/focusPoints";
import type { FocusPoint } from "@apps/shared/types";

interface FocusPointFormModalProps {
  /** null = 新規作成、それ以外 = 編集 */
  focusPoint: FocusPoint | null;
  onClose: () => void;
}

/**
 * フォーカスポイントの追加・編集モーダル。
 * 編集のときは「身についた / もう一度取り組む」と削除もここから行う。
 * 開くたびに入力を作り直すため、呼び出し側は開いている間だけマウントする
 */
export default function FocusPointFormModal({ focusPoint, onClose }: FocusPointFormModalProps) {
  const t = useTranslations("focusPoints");
  const { supabase } = useAuth();
  const isEdit = focusPoint !== null;

  const [title, setTitle] = useState(focusPoint?.title ?? "");
  const [note, setNote] = useState(focusPoint?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const createMutation = useCreateFocusPointMutation(supabase);
  const updateMutation = useUpdateFocusPointMutation(supabase);
  const statusMutation = useSetFocusPointStatusMutation(supabase);
  const deleteMutation = useDeleteFocusPointMutation(supabase);
  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    statusMutation.isPending ||
    deleteMutation.isPending;

  const limitMessage = t("limitError", { max: FOCUS_POINT_MAX_ACTIVE });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() === "") {
      setError(t("form.titleRequired"));
      return;
    }
    setError(null);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: focusPoint.id, input: { title, note } });
      } else {
        await createMutation.mutateAsync({ title, note });
      }
      onClose();
    } catch (err) {
      console.error("フォーカスポイント保存エラー:", err);
      setError(isFocusPointLimitError(err) ? limitMessage : t("form.saveFailed"));
    }
  };

  const handleToggleStatus = async () => {
    if (!isEdit) return;
    setError(null);
    try {
      await statusMutation.mutateAsync({
        id: focusPoint.id,
        status: focusPoint.status === "active" ? "mastered" : "active",
      });
      onClose();
    } catch (err) {
      console.error("フォーカスポイント状態変更エラー:", err);
      setError(isFocusPointLimitError(err) ? limitMessage : t("form.statusFailed"));
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    setIsDeleteConfirmOpen(false);
    setError(null);
    try {
      await deleteMutation.mutateAsync(focusPoint.id);
      onClose();
    } catch (err) {
      console.error("フォーカスポイント削除エラー:", err);
      setError(t("form.deleteFailed"));
    }
  };

  return (
    <>
      {/* 保存中は外側のクリックや × で閉じさせない (閉じると、上限で弾かれたときのエラーが見えないまま消える) */}
      <BaseModal
        isOpen
        onClose={isBusy ? () => {} : onClose}
        title={isEdit ? t("form.editTitle") : t("form.createTitle")}
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1">
            <label htmlFor="focus-point-title" className="block text-sm font-medium text-gray-700">
              {t("form.titleLabel")}
            </label>
            <input
              id="focus-point-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={FOCUS_POINT_TITLE_MAX_LENGTH}
              placeholder={t("form.titlePlaceholder")}
              autoFocus
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="focus-point-note" className="block text-sm font-medium text-gray-700">
              {t("form.noteLabel")}
            </label>
            <textarea
              id="focus-point-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={FOCUS_POINT_NOTE_MAX_LENGTH}
              rows={3}
              placeholder={t("form.notePlaceholder")}
              className="block w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {isEdit ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleToggleStatus()}
                  disabled={isBusy}
                >
                  {focusPoint.status === "active" ? t("form.markMastered") : t("form.reactivate")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  disabled={isBusy}
                  className="text-red-600 hover:bg-red-50"
                >
                  {t("form.delete")}
                </Button>
              </div>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
                {t("form.cancel")}
              </Button>
              <Button
                type="submit"
                loading={createMutation.isPending || updateMutation.isPending}
                disabled={isBusy}
              >
                {isEdit ? t("form.save") : t("form.create")}
              </Button>
            </div>
          </div>
        </form>
      </BaseModal>

      {isEdit && (
        <ConfirmDialog
          isOpen={isDeleteConfirmOpen}
          onConfirm={() => void handleDelete()}
          onCancel={() => setIsDeleteConfirmOpen(false)}
          title={t("form.deleteConfirmTitle")}
          message={t("form.deleteConfirmMessage", { title: focusPoint.title })}
          confirmLabel={t("form.delete")}
          cancelLabel={t("form.cancel")}
          variant="danger"
          initialFocus="cancel"
        />
      )}
    </>
  );
}
