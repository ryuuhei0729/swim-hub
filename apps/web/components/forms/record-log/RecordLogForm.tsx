'use client'

import React, { useEffect, useState, useRef } from 'react'
import { Button, ConfirmDialog } from '@/components/ui'
import FormStepper from '@/components/ui/FormStepper'
import { XMarkIcon } from '@heroicons/react/24/outline'

// 大会記録フォームのステップ定義
const COMPETITION_STEPS = [
  { id: 'basic', label: '大会情報', description: '日程・場所' },
  { id: 'entry', label: 'エントリー', description: '種目・タイム' },
  { id: 'record', label: '記録入力', description: '結果・スプリット' }
]
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useRecordLogForm } from './hooks/useRecordLogForm'
import { RecordLogEntry } from './components'
import type { RecordLogFormProps } from './types'
import { useBestTimes } from '@/hooks/useBestTimes'
import { useAuth } from '@/contexts'

/**
 * 記録ログフォームコンポーネント
 *
 * 大会記録を登録・編集するためのモーダルフォーム
 */
export default function RecordLogForm({
  isOpen,
  onClose,
  onSubmit,
  competitionId: _competitionId,
  competitionTitle,
  competitionDate,
  poolType = 0,
  editData,
  isLoading = false,
  styles = [],
  entryDataList = [],
}: RecordLogFormProps) {
  const { supabase, user } = useAuth()
  const { bestTimes, loadBestTimes } = useBestTimes(supabase)

  // ベストタイムを取得
  useEffect(() => {
    if (isOpen && user?.id) {
      loadBestTimes(user.id)
    }
  }, [isOpen, user?.id, loadBestTimes])

  const {
    formDataList,
    hasUnsavedChanges,
    isSubmitted,
    setIsSubmitted,
    resetUnsavedChanges,
    resetFormData,
    handleTimeChange,
    handleToggleRelaying,
    handleNoteChange,
    handleVideoChange,
    handleReactionTimeChange,
    handleStyleChange,
    handleAddSplitTime,
    handleAddSplitTimesEvery25m,
    handleRemoveSplitTime,
    handleSplitTimeChange,
    prepareSubmitData,
  } = useRecordLogForm({
    isOpen,
    editData,
    entryDataList,
    styles,
  })

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = () => {
      // ガードフラグが立っている場合は何もしない（再入防止）
      if (isHandlingBackRef.current) {
        return
      }
      if (hasUnsavedChanges && !isSubmitted) {
        // 履歴を戻す（ダイアログ表示中は戻らない）
        window.history.pushState(null, '', window.location.href)
        setConfirmContext('back')
        setShowConfirmDialog(true)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
      // アンマウント時にガードフラグをクリア
      isHandlingBackRef.current = false
    }
  }, [isOpen, hasUnsavedChanges, isSubmitted])

  const [formError, setFormError] = useState<string | null>(null)
  // 確認ダイアログの表示状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  // 確認ダイアログのコンテキスト（close: モーダル閉じる, back: ブラウザバック）
  const [confirmContext, setConfirmContext] = useState<'close' | 'back'>('close')
  // ブラウザバック処理中のガードフラグ（再入防止用）
  const isHandlingBackRef = useRef(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setIsSubmitted(true)

    const { hasStyleError, submitList } = prepareSubmitData()

    if (hasStyleError) {
      setFormError('種目を選択してください')
      setIsSubmitted(false)
      return
    }

    if (submitList.length === 0) {
      setFormError('タイムを入力してください（形式: 分:秒.小数 または 秒.小数）')
      setIsSubmitted(false)
      return
    }

    try {
      await onSubmit(submitList)
      resetUnsavedChanges()
    } catch (error) {
      console.error('フォーム送信エラー:', error)
      setIsSubmitted(false)
    }
  }

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext('close')
      setShowConfirmDialog(true)
      return
    }
    resetFormData()
    onClose()
  }

  const handleConfirmClose = () => {
    if (confirmContext === 'back') {
      // ガードフラグを立ててからナビゲーション実行（再入防止）
      isHandlingBackRef.current = true
      resetUnsavedChanges()
      window.history.back()
    }
    setShowConfirmDialog(false)
    resetFormData()
    onClose()
  }

  const handleCancelClose = () => {
    setShowConfirmDialog(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto" data-testid="record-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={handleClose}
        ></div>

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-3xl max-h-[90vh] flex flex-col">
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                {(competitionTitle || competitionDate) && (
                  <div className="mt-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-lg font-bold text-gray-900">
                      {competitionDate && competitionTitle && (
                        <>
                          <span className="text-base font-semibold text-blue-700">
                            {format(new Date(competitionDate), 'yyyy年M月d日(E)', {
                              locale: ja,
                            })}
                          </span>
                          <span className="ml-3">{competitionTitle}</span>
                        </>
                      )}
                      {competitionDate && !competitionTitle && (
                        format(new Date(competitionDate), 'yyyy年M月d日(E)', { locale: ja })
                      )}
                      {!competitionDate && competitionTitle && competitionTitle}
                    </p>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            {/* ステッププログレス（編集モードでない場合のみ表示） */}
            {!editData && (
              <div className="mb-4">
                <FormStepper
                  steps={COMPETITION_STEPS}
                  currentStep={2}
                  skippedSteps={entryDataList.length === 0 ? [1] : []}
                />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6 sm:pb-6 space-y-6">
              {formError && (
                <div
                  className="rounded-md bg-red-50 border border-red-200 p-4"
                  role="alert"
                  aria-live="polite"
                  data-testid="record-form-error"
                >
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}
              {formDataList.map((formData, index) => {
                const entryInfo = entryDataList[index]

                return (
                  <RecordLogEntry
                    key={
                      entryInfo
                        ? `${entryInfo.styleId}-${index}`
                        : `record-${index}`
                    }
                    formData={formData}
                    index={index}
                    entryInfo={entryInfo}
                    styles={styles}
                    poolType={poolType}
                    bestTimes={bestTimes}
                    isLoading={isLoading}
                    onTimeChange={(value) => handleTimeChange(index, value)}
                    onToggleRelaying={(checked) =>
                      handleToggleRelaying(index, checked)
                    }
                    onNoteChange={(value) => handleNoteChange(index, value)}
                    onVideoChange={(value) => handleVideoChange(index, value)}
                    onReactionTimeChange={(value) =>
                      handleReactionTimeChange(index, value)
                    }
                    onStyleChange={(value) => handleStyleChange(index, value)}
                    onAddSplitTime={() => handleAddSplitTime(index)}
                    onAddSplitTimesEvery25m={() =>
                      handleAddSplitTimesEvery25m(index)
                    }
                    onRemoveSplitTime={(splitIndex) =>
                      handleRemoveSplitTime(index, splitIndex)
                    }
                    onSplitTimeChange={(splitIndex, field, value) =>
                      handleSplitTimeChange(index, splitIndex, field, value)
                    }
                  />
                )
              })}
            </div>

            {/* フッター（固定） */}
            <div className="shrink-0 bg-gray-50 px-4 py-3 sm:px-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto"
                data-testid={editData ? 'update-record-button' : 'save-record-button'}
              >
                {isLoading ? '保存中...' : editData ? '更新' : '保存'}
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
        title="入力内容が保存されていません"
        message={confirmContext === 'back'
          ? '入力内容が保存されていません。このまま戻りますか？'
          : '入力内容が保存されていません。このまま閉じますか？'}
        confirmLabel={confirmContext === 'back' ? '戻る' : '閉じる'}
        cancelLabel="編集を続ける"
        variant="warning"
      />
    </div>
  )
}
