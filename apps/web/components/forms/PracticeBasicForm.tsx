'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Input, ConfirmDialog, DatePicker } from '@/components/ui'
import PlaceCombobox from '@/components/ui/PlaceCombobox'
import FormStepper from '@/components/ui/FormStepper'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { supabase } from '@/lib/supabase'
import { PracticeAPI } from '@apps/shared/api'

// 練習記録フォームのステップ定義
const PRACTICE_STEPS = [
  { id: 'basic', label: '基本情報', description: '日付・場所' },
  { id: 'log', label: '練習記録', description: 'メニュー・タイム' }
]
import { format, parseISO, isValid } from 'date-fns'
import { ja } from 'date-fns/locale'
import PracticeImageUploader, {
  PracticeImageFile,
  ExistingImage
} from './PracticeImageUploader'

export interface PracticeBasicData {
  date: string
  title: string
  place: string
  note: string
}

export interface PracticeImageData {
  newFiles: PracticeImageFile[]
  deletedIds: string[]
}

type EditPracticeBasicData = {
  date?: string
  title?: string | null
  place?: string
  note?: string
  images?: ExistingImage[]
}

interface PracticeBasicFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PracticeBasicData, imageData?: PracticeImageData, continueToNext?: boolean) => Promise<void>
  selectedDate: Date
  editData?: EditPracticeBasicData // 編集時のデータ
  isLoading?: boolean
  teamMode?: boolean // チームモード: 保存して次へボタンを非表示
}

export default function PracticeBasicForm({
  isOpen,
  onClose,
  onSubmit,
  selectedDate,
  editData,
  isLoading = false,
  teamMode = false
}: PracticeBasicFormProps) {
  // selectedDateの有効性を確保
  const validDate = selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate : new Date()
  
  const [formData, setFormData] = useState<PracticeBasicData>({
    date: format(selectedDate, 'yyyy-MM-dd'),
    title: '',
    place: '',
    note: ''
  })

  // 画像データ
  const [imageData, setImageData] = useState<PracticeImageData>({
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
  const initialFormDataRef = useRef<PracticeBasicData | null>(null)
  // 確認ダイアログの表示状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  // 確認ダイアログのコンテキスト（close: モーダル閉じる, back: ブラウザバック）
  const [confirmContext, setConfirmContext] = useState<'close' | 'back'>('close')
  // 場所の候補一覧
  const [placeSuggestions, setPlaceSuggestions] = useState<string[]>([])
  // popstateイベントをスキップするためのフラグ
  const skipPopstateRef = useRef(false)

  // 場所の候補を取得
  useEffect(() => {
    if (!isOpen) return
    if (!supabase) return

    const client = supabase
    const fetchPlaces = async () => {
      try {
        const practiceAPI = new PracticeAPI(client)
        const places = await practiceAPI.getUniquePlaces()
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
      if (skipPopstateRef.current) {
        skipPopstateRef.current = false
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
    }
  }, [isOpen, hasUnsavedChanges, isSubmitted])

  // selectedDateまたはeditDataが変更された時にフォームを初期化（モーダルが開かれた時だけ）
  useEffect(() => {
    if (!isOpen || isInitialized) return

    let initialData: PracticeBasicData
    if (editData) {
      // 編集モード
      initialData = {
        date: editData.date || format(selectedDate, 'yyyy-MM-dd'),
        title: editData.title || '',
        place: editData.place || '',
        note: editData.note || ''
      }
    } else {
      // 新規作成モード
      initialData = {
        date: format(selectedDate, 'yyyy-MM-dd'),
        title: '',
        place: '',
        note: ''
      }
    }

    setFormData(initialData)
    // 初期値を保存（初期化時の変更を無視するため）
    initialFormDataRef.current = { ...initialData }
    setIsInitialized(true)
  }, [isOpen, selectedDate, editData, isInitialized])

  // 画像の変更ハンドラー
  const handleImagesChange = useCallback((newFiles: PracticeImageFile[], deletedIds: string[]) => {
    setImageData({ newFiles, deletedIds })
  }, [])

  if (!isOpen) return null

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
    setShowConfirmDialog(false)
    onClose()
  }

  const handleConfirmClose = () => {
    if (confirmContext === 'back') {
      // ブラウザバックの場合は履歴を戻す
      // popstateハンドラーが再トリガーされないようにフラグを設定
      skipPopstateRef.current = true
      window.history.back()
    }
    cleanupAndClose()
  }

  const handleCancelClose = () => {
    setShowConfirmDialog(false)
  }

  // 日付が今日以前かどうかを判定
  const isDateTodayOrPast = () => {
    const parsedDate = parseISO(formData.date)
    if (!isValid(parsedDate)) {
      return false
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    parsedDate.setHours(0, 0, 0, 0)
    return parsedDate <= today
  }

  // フォーム送信の共通処理
  const submitForm = async (continueToNext: boolean) => {
    setIsSubmitted(true)
    try {
      const hasImageChanges = imageData.newFiles.length > 0 || imageData.deletedIds.length > 0
      await onSubmit(formData, hasImageChanges ? imageData : undefined, continueToNext)
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error('練習記録の保存に失敗しました:', error)
      setIsSubmitted(false)
    }
  }

  // 保存して終了（次へ進まない）
  const handleSubmitAndClose = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitForm(false)
  }

  // 保存して次へ進む（デフォルトの送信動作）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // 編集モードまたは未来の日付の場合は、continueToNext=falseとして扱う
    // 今日/過去の日付で新規作成の場合のみ、continueToNext=trueとなる
    const shouldContinue = !editData && isDateTodayOrPast()
    await submitForm(shouldContinue)
  }

  // 保存して次へ進む（明示的に次へ進む）
  const handleSubmitAndContinue = async (e: React.FormEvent) => {
    e.preventDefault()
    await submitForm(true)
  }

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto" data-testid="practice-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={handleClose}
        />

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-lg max-h-[90vh] flex flex-col">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '予定を編集' : '予定を作成'}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {validDate ? format(validDate, 'M月d日(E)', { locale: ja }) : '選択された日付'}の練習予定を{editData ? '編集' : '作成'}します
            </p>
            {/* ステッププログレス（新規作成時のみ表示） */}
            {!editData && (
              <div className="mt-4">
                <FormStepper steps={PRACTICE_STEPS} currentStep={0} />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* グリッドレイアウト: 練習日・タイトル・場所 */}
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-4 items-center">
              {/* 練習日 */}
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                練習日 <span className="text-red-500">*</span>
              </label>
              <DatePicker
                value={formData.date}
                onChange={(date) => setFormData({ ...formData, date })}
                required
                placeholder="練習日を選択"
                data-testid="practice-date"
              />

              {/* 練習タイトル */}
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                練習タイトル
              </label>
              <Input
                type="text"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="例: Swim, AM, 16:00"
                data-testid="practice-title"
              />

              {/* 練習場所 */}
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                練習場所
              </label>
              <PlaceCombobox
                value={formData.place}
                onChange={(value) => setFormData({ ...formData, place: value })}
                suggestions={placeSuggestions}
                placeholder="例: 市営プール、学校プール"
                data-testid="practice-place"
              />
            </div>

            {/* メモ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                メモ
              </label>
              <textarea
                value={formData.note}
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="練習に関する特記事項（天候、体調など）"
                data-testid="practice-note"
              />
            </div>

            {/* 画像添付 */}
            <div>
              <PracticeImageUploader
                existingImages={editData?.images}
                onImagesChange={handleImagesChange}
                disabled={isLoading}
              />
            </div>
            </div>

            {/* フッター（固定） */}
            <div className="shrink-0 bg-gray-50 px-4 py-3 sm:px-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                キャンセル
              </Button>

              {/* 編集モード */}
              {editData && (
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                  data-testid="update-practice-button"
                >
                  {isLoading ? '更新中...' : '更新'}
                </Button>
              )}

              {/* 新規作成 - チームモードまたは未来の日付: 保存ボタンのみ */}
              {!editData && (teamMode || !isDateTodayOrPast()) && (
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                  data-testid="save-practice-button"
                >
                  {isLoading ? '保存中...' : '保存'}
                </Button>
              )}

              {/* 新規作成 - 今日/過去の日付（チームモード以外）: 保存して終了 + 保存して次へ */}
              {!editData && !teamMode && isDateTodayOrPast() && (
                <>
                  <Button
                    type="button"
                    onClick={handleSubmitAndClose}
                    variant="outline"
                    disabled={isLoading}
                    className="w-full sm:w-auto"
                    data-testid="save-practice-close-button"
                  >
                    {isLoading ? '保存中...' : '保存して終了'}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmitAndContinue}
                    disabled={isLoading}
                    className="w-full sm:w-auto"
                    data-testid="save-practice-continue-button"
                  >
                    {isLoading ? '保存中...' : '保存して次へ'}
                  </Button>
                </>
              )}
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
