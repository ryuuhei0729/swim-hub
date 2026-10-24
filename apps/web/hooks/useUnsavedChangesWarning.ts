"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface UseUnsavedChangesWarningOptions {
  isOpen: boolean;
  hasUnsavedChanges: boolean;
  isSubmitted?: boolean;
  onClose?: () => void;
}

interface UseUnsavedChangesWarningReturn {
  /** 確認ダイアログを表示するかどうか */
  showConfirmDialog: boolean;
  /** 確認ダイアログのコンテキスト（'close': 閉じるボタン, 'back': ブラウザバック） */
  confirmContext: "close" | "back";
  /** 閉じる・離れる操作のハンドラ（未保存変更がある場合は確認ダイアログを表示） */
  handleClose: () => boolean;
  /**
   * 確認ダイアログで「閉じる/戻る」を選択した時のハンドラ。close 文脈は onClose を呼ぶ。
   * back 文脈 (ブラウザバック) はページの履歴を2つ戻ってこのページを離れる
   * (戻り先が無ければダイアログを閉じて留まる)。モーダルの中だけで使う用途には向かない
   */
  handleConfirmClose: () => void;
  /** 確認ダイアログで「キャンセル」を選択した時のハンドラ */
  handleCancelClose: () => void;
}

/**
 * 未保存の変更がある場合に離脱警告を表示するフック（拡張版）。ページ単位で使う
 * (OnboardingWizard / チーム代理入力ページ)。
 *
 * 機能:
 * - ブラウザのbeforeunloadイベントで警告を表示
 * - ブラウザバック時に確認ダイアログを表示し、「戻る」で直前のページへ戻る
 * - 閉じる・戻るボタン押下時に確認ダイアログを表示
 * - ConfirmDialogコンポーネントとの連携をサポート
 *
 * @example
 * const {
 *   showConfirmDialog,
 *   confirmContext,
 *   handleClose,
 *   handleConfirmClose,
 *   handleCancelClose
 * } = useUnsavedChangesWarning({
 *   isOpen,
 *   hasUnsavedChanges,
 *   isSubmitted,
 *   onClose
 * })
 *
 * // 閉じるボタン
 * <button onClick={() => { if (handleClose()) onClose() }}>閉じる</button>
 *
 * // 確認ダイアログ
 * <ConfirmDialog
 *   isOpen={showConfirmDialog}
 *   onConfirm={handleConfirmClose}
 *   onCancel={handleCancelClose}
 * />
 */
export function useUnsavedChangesWarning({
  isOpen,
  hasUnsavedChanges,
  isSubmitted = false,
  onClose,
}: UseUnsavedChangesWarningOptions): UseUnsavedChangesWarningReturn {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmContext, setConfirmContext] = useState<"close" | "back">("close");
  const ignorePopStateRef = useRef(false);
  // 確認で「戻る」を選んで離れる途中。別ドキュメントへ戻るときにブラウザ標準の
  // 離脱確認 (beforeunload) まで重ねて出さないために使う
  const leavingRef = useRef(false);
  const pushedRef = useRef(false);

  // モーダルが閉じた時にリセット
  useEffect(() => {
    if (!isOpen) {
      setShowConfirmDialog(false);
      ignorePopStateRef.current = false;
      pushedRef.current = false;
    }
  }, [isOpen]);

  // ブラウザの離脱防止
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };

    const handlePopState = () => {
      if (ignorePopStateRef.current) {
        ignorePopStateRef.current = false;
        return;
      }
      if (hasUnsavedChanges && !isSubmitted) {
        window.history.pushState(null, "", window.location.href);
        setConfirmContext("back");
        setShowConfirmDialog(true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    if (!pushedRef.current) {
      window.history.pushState(null, "", window.location.href);
      pushedRef.current = true;
    }
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isOpen, hasUnsavedChanges, isSubmitted]);

  // モーダル閉じるハンドラ
  const handleClose = useCallback((): boolean => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext("close");
      setShowConfirmDialog(true);
      return false;
    }
    return true;
  }, [hasUnsavedChanges, isSubmitted]);

  // 確認ダイアログで「閉じる」を選択
  const handleConfirmClose = useCallback(() => {
    setShowConfirmDialog(false);
    if (confirmContext === "back") {
      // ブラウザバックの popstate では、上の handlePopState が同じ URL を積み直して
      // このページに留めている。1つ戻るだけではその積み直しの手前 (同じ URL) に着くので
      // ページを離れない。2つ戻って、ブラウザバックで本来行きたかったページへ移る。
      // 積み直しで先の履歴は消えているので、いまは履歴の末尾にいる。2つ前があるのは
      // length >= 3 のときだけ。新しいタブで開いた等で戻り先が無ければ、ダイアログを
      // 閉じて留まる (フラグも立てないので、以後の離脱確認はそのまま効く)
      if (window.history.length >= 3) {
        ignorePopStateRef.current = true;
        leavingRef.current = true;
        window.history.go(-2);
      }
    } else if (onClose) {
      onClose();
    }
  }, [confirmContext, onClose]);

  // 確認ダイアログで「キャンセル」を選択
  const handleCancelClose = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  return {
    showConfirmDialog,
    confirmContext,
    handleClose,
    handleConfirmClose,
    handleCancelClose,
  };
}

export default useUnsavedChangesWarning;
