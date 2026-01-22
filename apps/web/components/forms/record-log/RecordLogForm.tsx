'use client'

import React, { useEffect } from 'react'
import { Button } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useRecordLogForm } from './hooks/useRecordLogForm'
import { RecordLogEntry } from './components'
import type { RecordLogFormProps } from './types'

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
  editData,
  isLoading = false,
  styles = [],
  entryDataList = [],
}: RecordLogFormProps) {
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
      if (hasUnsavedChanges && !isSubmitted) {
        const confirmed = window.confirm(
          '入力内容が保存されていません。このまま戻りますか？'
        )
        if (!confirmed) {
          window.history.pushState(null, '', window.location.href)
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isOpen, hasUnsavedChanges, isSubmitted])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitted(true)

    const { hasStyleError, submitList } = prepareSubmitData()

    if (hasStyleError) {
      console.error('種目を選択してください')
      return
    }

    if (submitList.length === 0) {
      console.error('タイムを入力してください（形式: 分:秒.小数 または 秒.小数）')
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
      const confirmed = window.confirm(
        '入力内容が保存されていません。このまま閉じますか？'
      )
      if (!confirmed) {
        return
      }
    }
    resetFormData()
    onClose()
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
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-3xl">
          <form onSubmit={handleSubmit}>
            {/* ヘッダー */}
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
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
            </div>

            <div className="px-4 pb-6 sm:px-6 sm:pb-6 space-y-6">
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

            {/* フッター */}
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto sm:ml-3"
                data-testid={editData ? 'update-record-button' : 'save-record-button'}
              >
                {isLoading ? '保存中...' : editData ? '更新' : '保存'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
                className="mt-3 w-full sm:mt-0 sm:w-auto"
              >
                キャンセル
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
