'use client'

import React, { useState } from 'react'
import { parseISO, isValid } from 'date-fns'
import { Button, ConfirmDialog } from '@/components/ui'
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useRecordForm, useUnsavedChangesWarning } from './hooks'
import { RecordBasicInfo, RecordSetItem } from './components'
import type { RecordFormProps, RecordFormData } from './types'

/**
 * 大会記録入力フォーム
 *
 * フェーズ3リファクタリングにより、865行から約180行に削減
 * - 状態管理: useRecordForm フック
 * - 離脱警告: useUnsavedChangesWarning フック
 * - 基本情報: RecordBasicInfo コンポーネント
 * - 記録入力: RecordSetItem コンポーネント
 */
export default function RecordForm({
  isOpen,
  onClose,
  onSubmit,
  initialDate,
  editData,
  isLoading = false,
  styles = [],
}: RecordFormProps) {
  const {
    formData,
    setFormData,
    hasUnsavedChanges,
    isSubmitted,
    setIsSubmitted,
    resetUnsavedChanges,
    addRecord,
    removeRecord,
    updateRecord,
    addSplitTime,
    addSplitTimesEvery25m,
    updateSplitTime,
    removeSplitTime,
    sanitizeFormData,
  } = useRecordForm({ isOpen, initialDate, editData, styles })

  // ブラウザ離脱警告
  useUnsavedChangesWarning({ isOpen, hasUnsavedChanges, isSubmitted })

  // 確認ダイアログの状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  // バリデーションエラーの状態
  const [recordDateError, setRecordDateError] = useState<string | undefined>(undefined)

  if (!isOpen) return null

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      setShowConfirmDialog(true)
      return
    }
    onClose()
  }

  const handleConfirmClose = () => {
    setShowConfirmDialog(false)
    onClose()
  }

  const handleCancelClose = () => {
    setShowConfirmDialog(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // recordDate のバリデーション
    const sanitized = sanitizeFormData()
    if (!sanitized.recordDate || sanitized.recordDate === '') {
      setRecordDateError('大会日を入力してください')
      return
    }
    const parsedDate = parseISO(sanitized.recordDate)
    if (!isValid(parsedDate)) {
      setRecordDateError('有効な日付を入力してください')
      return
    }
    setRecordDateError(undefined)

    setIsSubmitted(true)
    try {
      await onSubmit(sanitized)
      resetUnsavedChanges()
      onClose()
    } catch (error) {
      console.error('フォーム送信エラー:', error)
      setIsSubmitted(false)
    }
  }

  const handleFieldChange = (field: keyof RecordFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto" data-testid="record-form-modal">
      <div className="flex min-h-screen items-center justify-center p-0 sm:p-4">
        {/* オーバーレイ */}
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={handleClose}
        ></div>

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* ヘッダー */}
          <div className="bg-white px-3 py-3 sm:px-6 sm:py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg leading-6 font-medium text-gray-900">
                {editData ? '大会記録を編集' : '大会記録を追加'}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label="閉じる"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            {/* 大会情報 */}
            <RecordBasicInfo
              formData={formData}
              onFieldChange={handleFieldChange}
              recordDateError={recordDateError}
            />

            {/* 記録セクション */}
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base sm:text-lg font-medium text-gray-900">記録</h3>
                <Button
                  type="button"
                  onClick={addRecord}
                  className="flex items-center gap-2"
                  data-testid="record-add-button"
                >
                  <PlusIcon className="h-4 w-4" />
                  種目を追加
                </Button>
              </div>

              {formData.records.map((record, recordIndex) => (
                <RecordSetItem
                  key={record.id}
                  record={record}
                  recordIndex={recordIndex}
                  styles={styles}
                  canRemove={formData.records.length > 1}
                  onUpdate={(updates) => updateRecord(record.id, updates)}
                  onRemove={() => removeRecord(record.id)}
                  onAddSplitTime={() => addSplitTime(record.id)}
                  onAddSplitTimesEvery25m={() => addSplitTimesEvery25m(record.id)}
                  onUpdateSplitTime={(splitIndex, updates) =>
                    updateSplitTime(record.id, splitIndex, updates)
                  }
                  onRemoveSplitTime={(splitIndex) =>
                    removeSplitTime(record.id, splitIndex)
                  }
                />
              ))}
            </div>

            {/* 大会メモ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                大会メモ
              </label>
              <textarea
                value={formData.note}
                onChange={(e) => handleFieldChange('note', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="大会に関する特記事項"
                data-testid="tournament-note"
              />
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-2 sm:gap-3 pt-4 sm:pt-6 border-t">
              <Button
                type="button"
                onClick={handleClose}
                variant="secondary"
                disabled={isLoading}
                data-testid="record-form-cancel-button"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="record-form-submit-button"
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
        message="入力内容が保存されていません。このまま閉じますか？"
        confirmLabel="閉じる"
        cancelLabel="編集を続ける"
        variant="warning"
      />
    </div>
  )
}
