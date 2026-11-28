"use client";

import React, { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/**
 * 目標・マイルストーンのフォームを入力途中で閉じるときの破棄確認
 * (mobile の GoalFormScreen / MilestoneFormScreen と同じく、開いた時点から変わっていれば確認する)。
 *
 * - markPristine(values): フォームを初期化した値を「開いた時点」として覚える
 * - requestClose(values): 閉じる操作 (背景クリック・×・キャンセル)。変わっていれば確認を出し、
 *   変わっていなければそのまま onClose を呼ぶ。保存成功後の close はこれを通さずに直接閉じる
 */
export function useDiscardConfirm(onClose: () => void) {
  const tUnsaved = useTranslations("forms.unsavedChanges");
  const snapshotRef = useRef<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const markPristine = useCallback((values: unknown) => {
    snapshotRef.current = JSON.stringify(values);
  }, []);

  const requestClose = useCallback(
    (values: unknown) => {
      const changed = snapshotRef.current !== null && JSON.stringify(values) !== snapshotRef.current;
      if (changed) {
        setShowConfirm(true);
        return;
      }
      onClose();
    },
    [onClose],
  );

  const confirmDialog = (
    <ConfirmDialog
      isOpen={showConfirm}
      onConfirm={() => {
        setShowConfirm(false);
        onClose();
      }}
      onCancel={() => setShowConfirm(false)}
      title={tUnsaved("title")}
      message={tUnsaved("messageClose")}
      confirmLabel={tUnsaved("confirmClose")}
      cancelLabel={tUnsaved("cancel")}
      variant="warning"
      initialFocus="cancel"
    />
  );

  return { markPristine, requestClose, confirmDialog };
}
