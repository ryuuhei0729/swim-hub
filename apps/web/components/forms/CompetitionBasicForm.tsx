'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Button, Input, ConfirmDialog, DatePicker } from '@/components/ui'
import PlaceCombobox from '@/components/ui/PlaceCombobox'
import FormStepper from '@/components/ui/FormStepper'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { createClient } from '@/lib/supabase'
import { CompetitionAPI } from '@apps/shared/api'

// 大会記録フォームのステップ定義
const COMPETITION_STEPS = [
  { id: 'basic', label: '大会情報', description: '日程・場所' },
  { id: 'entry', label: 'エントリー', description: '種目・タイム' },
  { id: 'record', label: '記録入力', description: '結果・スプリット' }
]
import { format } from 'date-fns'
import CompetitionImageUploader, {
  CompetitionImageFile,
  ExistingImage
} from './CompetitionImageUploader'

interface CompetitionBasicFormData {
  date: string
  endDate: string // 終了日（複数日開催の場合）。空文字の場合は単日開催
  title: string
  place: string
  poolType: number
  note: string
}

export interface CompetitionImageData {
  newFiles: CompetitionImageFile[]
  deletedIds: string[]
}

type EditCompetitionBasicData = {
  date?: string
  end_date?: string | null // 終了日（複数日開催の場合）
  title?: string
  competition_name?: string
  place?: string
  pool_type?: number
  note?: string
  images?: ExistingImage[]
}

interface SubmitOptions {
  continueToNext?: boolean
  skipEntry?: boolean
}

interface CompetitionBasicFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CompetitionBasicFormData, imageData?: CompetitionImageData, options?: SubmitOptions) => Promise<void>
  selectedDate: Date
  editData?: EditCompetitionBasicData
  isLoading?: boolean
  teamMode?: boolean // チームモード: 保存ボタンのみ表示
}

const POOL_TYPES = [
  { value: 0, label: '短水路 (25m)' },
  { value: 1, label: '長水路 (50m)' }
]

export default function CompetitionBasicForm({
  isOpen,
  onClose,
  onSubmit,
  selectedDate,
  editData,
  isLoading = false,
  teamMode = false
}: CompetitionBasicFormProps) {
  const [formData, setFormData] = useState<CompetitionBasicFormData>({
    date: format(selectedDate, 'yyyy-MM-dd'),
    endDate: '',
    title: '',
    place: '',
    poolType: 0,
    note: ''
  })

  // 画像データ
  const [imageData, setImageData] = useState<CompetitionImageData>({
    newFiles: [],
    deletedIds: []
  })

  // 初期化済みフラグ（モーダルが開かれた時だけ初期化するため）
  const [isInitialized, setIsInitialized] = useState(false)
  // フォームに変更があるかどうかを追跡
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  // 送信済みフラグ（送信後は警告を出さない）
  const [isSubmitted, setIsSubmitted] = useState(false)
  // 初期値を保存（初期化時の変更を無視するため）
  const initialFormDataRef = useRef<CompetitionBasicFormData | null>(null)
  // 確認ダイアログの表示状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  // 確認ダイアログのコンテキスト（close: モーダル閉じる, back: ブラウザバック）
  const [confirmContext, setConfirmContext] = useState<'close' | 'back'>('close')
  // 確認ダイアログで「確認」を押した後のナビゲーション中フラグ（popstateの重複発火を防ぐ）
  const isNavigatingRef = useRef(false)
  // 場所の候補一覧
  const [placeSuggestions, setPlaceSuggestions] = useState<string[]>([])
  // バリデーションエラー
  const [validationError, setValidationError] = useState<string | null>(null)

  // 場所の候補を取得
  useEffect(() => {
    if (!isOpen) return

    const client = createClient()
    const fetchPlaces = async () => {
      try {
        const competitionAPI = new CompetitionAPI(client)
        const places = await competitionAPI.getUniqueCompetitionPlaces()
        setPlaceSuggestions(places)
      } catch (error) {
        console.error('場所候補の取得に失敗:', error)
      }
    }
    fetchPlaces()
  }, [isOpen])

  // モーダルが閉じた時に初期化フラグをリセット
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false)
      setHasUnsavedChanges(false)
      setIsSubmitted(false)
      setShowConfirmDialog(false)
      // 画像データもリセット
      setImageData({ newFiles: [], deletedIds: [] })
      initialFormDataRef.current = null
      isNavigatingRef.current = false
      setValidationError(null)
    }
  }, [isOpen])

  // フォームに変更があったことを記録（初期値と比較して、実際にユーザーが変更した場合のみ）
  useEffect(() => {
    if (!isOpen || !isInitialized || !initialFormDataRef.current) return

    // 初期値と現在の値を比較
    const formChanged = JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current)
    const hasImageChanges = imageData.newFiles.length > 0 || imageData.deletedIds.length > 0
    setHasUnsavedChanges(formChanged || hasImageChanges)
  }, [formData, imageData, isOpen, isInitialized])

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = (_e: PopStateEvent) => {
      // ナビゲーション中または既にダイアログ表示中は無視
      if (isNavigatingRef.current || showConfirmDialog) return

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
    }
  }, [isOpen, hasUnsavedChanges, isSubmitted, showConfirmDialog])

  // selectedDateまたはeditDataが変更された時にフォームを初期化（モーダルが開かれた時だけ）
  useEffect(() => {
    if (!isOpen || isInitialized) return

    let initialData: CompetitionBasicFormData
    if (editData) {
      // 編集モード
      initialData = {
        date: editData.date || format(selectedDate, 'yyyy-MM-dd'),
        endDate: editData.end_date || '',
        title: editData.title || editData.competition_name || '',
        place: editData.place || '',
        poolType: editData.pool_type ?? 0,
        note: editData.note || ''
      }
    } else {
      // 新規作成モード
      initialData = {
        date: format(selectedDate, 'yyyy-MM-dd'),
        endDate: '',
        title: '',
        place: '',
        poolType: 0,
        note: ''
      }
    }
    
    setFormData(initialData)
    // 初期値を保存（初期化時の変更を無視するため）
    initialFormDataRef.current = { ...initialData }
    setIsInitialized(true)
  }, [isOpen, selectedDate, editData, isInitialized])

  const handleClose = () => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext('close')
      setShowConfirmDialog(true)
      return
    }
    cleanupAndClose()
  }

  const cleanupAndClose = () => {
    // プレビューURLをクリーンアップ
    imageData.newFiles.forEach(file => {
      URL.revokeObjectURL(file.previewUrl)
    })
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      endDate: '',
      title: '',
      place: '',
      poolType: 0,
      note: ''
    })
    setShowConfirmDialog(false)
    onClose()
  }

  const handleConfirmClose = () => {
    // 先に状態をクリアしてpopstateの重複発火を防ぐ
    setHasUnsavedChanges(false)
    setShowConfirmDialog(false)
    isNavigatingRef.current = true

    if (confirmContext === 'back') {
      // ブラウザバックの場合は履歴を戻す
      window.history.back()
    }
    cleanupAndClose()
  }

  const handleCancelClose = () => {
    setShowConfirmDialog(false)
  }

  const handleImagesChange = (newFiles: CompetitionImageFile[], deletedIds: string[]) => {
    setImageData({ newFiles, deletedIds })
  }

  // 日付が今日以前かどうかを判定
  const isDateTodayOrPast = () => {
    const selectedDateValue = new Date(formData.date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    selectedDateValue.setHours(0, 0, 0, 0)
    return selectedDateValue <= today
  }

  // フォーム送信の共通処理
  const submitForm = async (options: SubmitOptions) => {
    // バリデーション
    if (formData.endDate && formData.endDate < formData.date) {
      setValidationError('終了日は開始日以降の日付を指定してください')
      return
    }

    setIsSubmitted(true)
    try {
      const hasImageChanges = imageData.newFiles.length > 0 || imageData.deletedIds.length > 0
      await onSubmit(formData, hasImageChanges ? imageData : undefined, options)
      setHasUnsavedChanges(false)
      setValidationError(null)
    } catch (error) {
      console.error('フォーム送信エラー:', error)
      setIsSubmitted(false)
    }
  }

  // 保存して終了（次へ進まない）
  const handleSubmitAndClose = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitForm({ continueToNext: false })
  }

  // 次へ進む（エントリー登録へ - 未来の日付用）
  const handleSubmitToEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitForm({ continueToNext: true, skipEntry: false })
  }

  // 次へ進む（記録入力へ - 今日/過去の日付用）
  const handleSubmitToRecord = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitForm({ continueToNext: true, skipEntry: true })
  }

  // 編集モードでの更新
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitForm({ continueToNext: false })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto" data-testid="competition-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-lg">
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '大会情報編集' : '大会情報登録'}
              </h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            {/* ステッププログレス（新規作成時のみ表示） */}
            {!editData && (
              <div className="mb-4">
                <FormStepper
                  steps={COMPETITION_STEPS}
                  currentStep={0}
                  skippedSteps={isDateTodayOrPast() ? [1] : []}
                />
              </div>
            )}

            {/* フォーム */}
            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              {/* バリデーションエラー */}
              {validationError && (
                <div
                  role="alert"
                  className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3"
                >
                  {validationError}
                </div>
              )}

              {/* 日付（開始日・終了日） */}
              <div className="grid grid-cols-2 gap-4">
                <DatePicker
                  label="開始日"
                  value={formData.date}
                  onChange={(date) => {
                    setFormData({ ...formData, date })
                    setValidationError(null)
                  }}
                  required
                  placeholder="開始日を選択"
                />
                <DatePicker
                  label="終了日"
                  value={formData.endDate}
                  onChange={(date) => {
                    setFormData({ ...formData, endDate: date })
                    setValidationError(null)
                  }}
                  minDate={formData.date ? new Date(formData.date) : undefined}
                  placeholder="終了日を選択"
                  helperText="複数日の場合"
                />
              </div>

              {/* 大会名 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  大会名
                </label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="例: 全国大会, 対抗戦, タイムトライアル"
                  className="w-full"
                  data-testid="competition-title"
                />
              </div>

              {/* 場所 */}
              <PlaceCombobox
                label="場所"
                value={formData.place}
                onChange={(value) => setFormData({ ...formData, place: value })}
                suggestions={placeSuggestions}
                placeholder="例: 東京アクアティクスセンター"
                data-testid="competition-place"
              />

              {/* プール種別 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  プール種別 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.poolType}
                  onChange={(e) => setFormData({ ...formData, poolType: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                  data-testid="competition-pool-type"
                >
                  {POOL_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* メモ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  メモ
                </label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="大会に関するメモ（任意）"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  data-testid="competition-note"
                />
              </div>

              {/* 画像添付 */}
              <div className="border-t border-gray-200 pt-6">
                <CompetitionImageUploader
                  existingImages={editData?.images}
                  onImagesChange={handleImagesChange}
                  disabled={isLoading}
                />
              </div>
            </form>
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse sm:gap-3">
            {/* 編集モード */}
            {editData && (
              <Button
                onClick={handleUpdate}
                disabled={isLoading}
                className="w-full sm:w-auto"
                data-testid="competition-update-button"
              >
                {isLoading ? '更新中...' : '更新'}
              </Button>
            )}

            {/* 新規作成 - チームモード: 保存ボタンのみ */}
            {!editData && teamMode && (
              <Button
                onClick={handleSubmitAndClose}
                disabled={isLoading}
                className="w-full sm:w-auto"
                data-testid="competition-save-button"
              >
                {isLoading ? '保存中...' : '保存'}
              </Button>
            )}

            {/* 新規作成 - 未来の日付（チームモード以外） */}
            {!editData && !teamMode && !isDateTodayOrPast() && (
              <Button
                onClick={handleSubmitToEntry}
                disabled={isLoading}
                className="w-full sm:w-auto"
                data-testid="competition-next-button"
              >
                {isLoading ? '保存中...' : '次へ（エントリー登録）'}
              </Button>
            )}

            {/* 新規作成 - 今日/過去の日付（チームモード以外） */}
            {!editData && !teamMode && isDateTodayOrPast() && (
              <>
                <Button
                  onClick={handleSubmitToRecord}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                  data-testid="competition-record-button"
                >
                  {isLoading ? '保存中...' : '次へ（記録入力）'}
                </Button>
                <Button
                  onClick={handleSubmitAndClose}
                  variant="outline"
                  disabled={isLoading}
                  className="mt-3 w-full sm:mt-0 sm:w-auto"
                  data-testid="competition-close-button"
                >
                  {isLoading ? '保存中...' : '保存して終了'}
                </Button>
              </>
            )}

            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              className="mt-3 w-full sm:mt-0 sm:w-auto"
            >
              キャンセル
            </Button>
          </div>
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

