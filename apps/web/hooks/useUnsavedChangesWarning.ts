'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface UseUnsavedChangesWarningOptions {
  isOpen: boolean
  hasUnsavedChanges: boolean
  isSubmitted?: boolean
  onClose?: () => void
}

interface UseUnsavedChangesWarningReturn {
  /** 確認ダイアログを表示するかどうか */
  showConfirmDialog: boolean
  /** 確認ダイアログのコンテキスト（'close': 閉じるボタン, 'back': ブラウザバック） */
  confirmContext: 'close' | 'back'
  /** モーダルを閉じようとした時のハンドラ（未保存変更がある場合は確認ダイアログを表示） */
  handleClose: () => boolean
  /** 確認ダイアログで「閉じる」を選択した時のハンドラ */
  handleConfirmClose: () => void
  /** 確認ダイアログで「キャンセル」を選択した時のハンドラ */
  handleCancelClose: () => void
}

/**
 * 未保存の変更がある場合に離脱警告を表示するフック（拡張版）
 *
 * 機能:
 * - ブラウザのbeforeunloadイベントで警告を表示
 * - ブラウザバック時に確認ダイアログを表示
 * - モーダル閉じるボタン押下時に確認ダイアログを表示
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
  onClose
}: UseUnsavedChangesWarningOptions): UseUnsavedChangesWarningReturn {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmContext, setConfirmContext] = useState<'close' | 'back'>('close')
  const ignorePopStateRef = useRef(false)
  const pushedRef = useRef(false)

  // モーダルが閉じた時にリセット
  useEffect(() => {
    if (!isOpen) {
      setShowConfirmDialog(false)
      ignorePopStateRef.current = false
      pushedRef.current = false
    }
  }, [isOpen])

  // ブラウザの離脱防止
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = () => {
      if (ignorePopStateRef.current) {
        ignorePopStateRef.current = false
        return
      }
      if (hasUnsavedChanges && !isSubmitted) {
        window.history.pushState(null, '', window.location.href)
        setConfirmContext('back')
        setShowConfirmDialog(true)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    if (!pushedRef.current) {
      window.history.pushState(null, '', window.location.href)
      pushedRef.current = true
    }
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isOpen, hasUnsavedChanges, isSubmitted])

  // モーダル閉じるハンドラ
  const handleClose = useCallback((): boolean => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext('close')
      setShowConfirmDialog(true)
      return false
    }
    return true
  }, [hasUnsavedChanges, isSubmitted])

  // 確認ダイアログで「閉じる」を選択
  const handleConfirmClose = useCallback(() => {
    setShowConfirmDialog(false)
    if (confirmContext === 'back') {
      ignorePopStateRef.current = true
      window.history.back()
    } else if (onClose) {
      onClose()
    }
  }, [confirmContext, onClose])

  // 確認ダイアログで「キャンセル」を選択
  const handleCancelClose = useCallback(() => {
    setShowConfirmDialog(false)
  }, [])

  return {
    showConfirmDialog,
    confirmContext,
    handleClose,
    handleConfirmClose,
    handleCancelClose
  }
}

export default useUnsavedChangesWarning
