'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createBrowserClient } from '@supabase/ssr'
import { Button, ConfirmDialog, Input } from '@/components/ui'
import FormStepper from '@/components/ui/FormStepper'
import { XMarkIcon, PlusIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { useCreatePracticeLogTemplateMutation } from '@swim-hub/shared/hooks'
import type { CreatePracticeLogTemplateInput } from '@swim-hub/shared/types'

// 練習記録フォームのステップ定義
const PRACTICE_STEPS = [
  { id: 'basic', label: '基本情報', description: '日付・場所' },
  { id: 'log', label: '練習記録', description: 'メニュー・タイム' }
]
import { PracticeLogTemplateSelectModal } from '@/components/practice-log-templates/PracticeLogTemplateSelectModal'
import type { PracticeLogTemplate } from '@swim-hub/shared/types'

import { usePracticeLogForm } from './hooks'
import { PracticeMenuItem } from './components'
import type { PracticeLogFormProps, PracticeMenu } from './types'

// TimeInputModalを動的インポート（バンドルサイズ削減）
const TimeInputModal = dynamic(() => import('../TimeInputModal'), { ssr: false })

/**
 * 練習記録入力フォーム
 *
 * フェーズ3リファクタリングにより、854行から約200行に削減
 * - 状態管理: usePracticeLogForm フック
 * - メニュー入力: PracticeMenuItem コンポーネント
 */
export default function PracticeLogForm({
  isOpen,
  onClose,
  onSubmit,
  practiceId: _practiceId,
  editData,
  isLoading = false,
  availableTags,
  setAvailableTags,
  styles: _styles = [],
}: PracticeLogFormProps) {
  const {
    menus,
    setMenus,
    showTimeModal,
    setShowTimeModal,
    currentMenuId,
    setCurrentMenuId,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    isSubmitted,
    setIsSubmitted,
    addMenu,
    removeMenu,
    updateMenu,
    handleTagsChange,
    openTimeModal,
    handleTimeSave,
    getCurrentMenu,
    prepareSubmitData,
  } = usePracticeLogForm({ isOpen, editData, availableTags })

  // テンプレート選択モーダルの状態
  const [isTemplateSelectorOpen, setIsTemplateSelectorOpen] = useState(false)
  // 確認ダイアログの表示状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  // 確認ダイアログのコンテキスト
  const [confirmContext, setConfirmContext] = useState<'close' | 'back'>('close')
  // プログラム的なナビゲーション中はpopstateを無視するフラグ
  const isNavigatingBack = useRef(false)

  // テンプレートとして保存するチェックボックスの状態
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  // テンプレート保存モーダルの状態
  const [showTemplateSaveModal, setShowTemplateSaveModal] = useState(false)
  // テンプレート名
  const [templateName, setTemplateName] = useState('')
  // テンプレート保存中フラグ
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  // Supabaseクライアント
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const createTemplateMutation = useCreatePracticeLogTemplateMutation(supabase)

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = () => {
      // プログラム的なナビゲーション中は無視し、フラグをリセット
      if (isNavigatingBack.current) {
        isNavigatingBack.current = false
        return
      }
      if (hasUnsavedChanges && !isSubmitted) {
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

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext('close')
      setShowConfirmDialog(true)
      return
    }
    onClose()
  }, [hasUnsavedChanges, isSubmitted, onClose])

  const handleConfirmClose = useCallback(() => {
    if (confirmContext === 'back') {
      // popstateリスナーが再度ダイアログを開かないようにフラグを設定
      isNavigatingBack.current = true
      setHasUnsavedChanges(false)
      setShowConfirmDialog(false)
      window.history.back()
      return
    }
    setShowConfirmDialog(false)
    onClose()
  }, [confirmContext, onClose, setHasUnsavedChanges])

  const handleCancelClose = useCallback(() => {
    setShowConfirmDialog(false)
  }, [])

  if (!isOpen) return null

  const handleSubmit = async () => {
    // テンプレート保存チェックがONの場合、テンプレート保存モーダルを表示
    if (saveAsTemplate) {
      setShowTemplateSaveModal(true)
      return
    }

    await executeSubmit()
  }

  const executeSubmit = async () => {
    setIsSubmitted(true)
    try {
      await onSubmit(prepareSubmitData())
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error('フォーム送信エラー:', error)
    } finally {
      setIsSubmitted(false)
    }
  }

  const handleTemplateSave = async () => {
    if (!templateName.trim()) return

    setIsSavingTemplate(true)
    try {
      // 最初のメニューをテンプレートとして保存
      const firstMenu = menus[0]
      if (!firstMenu) return

      const circleTime =
        (Number(firstMenu.circleMin) || 0) * 60 + (Number(firstMenu.circleSec) || 0)

      const templateInput: CreatePracticeLogTemplateInput = {
        name: templateName.trim(),
        style: firstMenu.style,
        swim_category: firstMenu.swimCategory,
        distance: Number(firstMenu.distance) || 0,
        rep_count: Number(firstMenu.reps) || 1,
        set_count: Number(firstMenu.sets) || 1,
        circle: circleTime > 0 ? circleTime : null,
        note: firstMenu.note || null,
        tag_ids: firstMenu.tags.map((tag) => tag.id),
      }

      await createTemplateMutation.mutateAsync(templateInput)

      // モーダルを閉じてリセット
      setShowTemplateSaveModal(false)
      setTemplateName('')
      setSaveAsTemplate(false)

      // 練習記録も保存
      await executeSubmit()
    } catch (error) {
      console.error('テンプレート保存エラー:', error)
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleTemplateSelect = (template: PracticeLogTemplate) => {
    // テンプレートからメニューを作成
    const circleTime = template.circle || 0
    const circleMin = Math.floor(circleTime / 60)
    const circleSec = circleTime % 60

    // テンプレートのtag_idsからタグを取得
    const templateTags = template.tag_ids
      ? availableTags.filter((tag) => template.tag_ids.includes(tag.id))
      : []

    const newMenu: PracticeMenu = {
      id: String(Date.now()),
      style: template.style,
      swimCategory: template.swim_category,
      distance: template.distance,
      reps: template.rep_count,
      sets: template.set_count,
      circleMin: circleMin,
      circleSec: circleSec,
      note: template.note || '',
      tags: templateTags,
      times: [],
    }

    setMenus([newMenu])
  }

  return (
    <div
      className="fixed inset-0 z-70 overflow-y-auto"
      data-testid="practice-log-form-modal"
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={handleClose}
        />

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '練習記録を編集' : '練習記録を追加'}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label="練習記録を閉じる"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            {/* ステッププログレス（新規作成時のみ表示） */}
            {!editData && (
              <div className="mt-4">
                <FormStepper steps={PRACTICE_STEPS} currentStep={1} />
              </div>
            )}
          </div>

          <form onSubmit={handleFormSubmit} className="p-6 space-y-6">
            {/* メニューセクション */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">練習メニュー</h4>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => setIsTemplateSelectorOpen(true)}
                    variant="outline"
                    className="flex items-center gap-2"
                    disabled={isLoading}
                  >
                    <ClipboardDocumentListIcon className="h-5 w-5" />
                    テンプレートから作成
                  </Button>
                  <Button
                    type="button"
                    onClick={addMenu}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                    disabled={isLoading}
                    data-testid="add-menu-button"
                  >
                    <PlusIcon className="h-4 w-4" />
                    メニューを追加
                  </Button>
                </div>
              </div>

              {menus.map((menu, index) => (
                <PracticeMenuItem
                  key={menu.id}
                  menu={menu}
                  menuIndex={index}
                  canRemove={menus.length > 1}
                  availableTags={availableTags}
                  isLoading={isLoading}
                  onRemove={() => removeMenu(menu.id)}
                  onUpdate={(field, value) => updateMenu(menu.id, field, value)}
                  onTagsChange={(tags) => handleTagsChange(menu.id, tags)}
                  onAvailableTagsUpdate={setAvailableTags}
                  onOpenTimeModal={() => openTimeModal(menu.id)}
                />
              ))}
            </div>

            {/* ボタン */}
            <div className="flex items-center justify-between pt-6 border-t sticky bottom-0 bg-white">
              {/* テンプレート保存チェックボックス（新規作成時のみ表示） */}
              {!editData ? (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="save-as-template"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                    disabled={isLoading}
                  />
                  <label
                    htmlFor="save-as-template"
                    className="ml-2 text-sm text-gray-700 cursor-pointer select-none"
                  >
                    テンプレートとして保存する
                  </label>
                </div>
              ) : (
                <div />
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={handleClose}
                  variant="secondary"
                  disabled={isLoading}
                  data-testid="practice-log-cancel-button"
                >
                  キャンセル
                </Button>
                <Button
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleSubmit()}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid={
                    editData ? 'update-practice-log-button' : 'save-practice-log-button'
                  }
                >
                  {isLoading
                    ? editData
                      ? '更新中...'
                      : '保存中...'
                    : editData
                      ? '練習記録を更新'
                      : '練習記録を保存'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* タイム入力モーダル */}
      {currentMenuId && (
        <TimeInputModal
          isOpen={showTimeModal}
          onClose={() => {
            setShowTimeModal(false)
            setCurrentMenuId(null)
          }}
          onSubmit={handleTimeSave}
          setCount={Number(getCurrentMenu()?.sets) || 1}
          repCount={Number(getCurrentMenu()?.reps) || 1}
          initialTimes={
            (getCurrentMenu()?.times || []) as Array<{
              id: string
              setNumber: number
              repNumber: number
              time: number
              displayValue?: string
            }>
          }
          menuNumber={menus.findIndex((m) => m.id === currentMenuId) + 1}
        />
      )}

      {/* テンプレート選択モーダル */}
      <PracticeLogTemplateSelectModal
        isOpen={isTemplateSelectorOpen}
        onClose={() => setIsTemplateSelectorOpen(false)}
        onSelect={handleTemplateSelect}
      />

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

      {/* テンプレート保存確認モーダル */}
      {showTemplateSaveModal && (
        <div
          className="fixed inset-0 z-80 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-save-modal-title"
        >
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* オーバーレイ */}
            <div
              className="fixed inset-0 bg-black/40 transition-opacity"
              onClick={() => setShowTemplateSaveModal(false)}
              aria-hidden="true"
            />

            {/* モーダルコンテンツ */}
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
              {/* ヘッダー */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3
                  id="template-save-modal-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  テンプレートとして保存
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTemplateSaveModal(false)}
                  className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
                  aria-label="閉じる"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* コンテンツ */}
              <div className="p-4">
                <label
                  htmlFor="template-name"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  テンプレート名
                </label>
                <Input
                  id="template-name"
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="例: 100m × 10本 Fr"
                  className="w-full"
                  autoFocus
                />
              </div>

              {/* フッター */}
              <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowTemplateSaveModal(false)}
                  disabled={isSavingTemplate}
                >
                  キャンセル
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleTemplateSave()}
                  disabled={!templateName.trim() || isSavingTemplate}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSavingTemplate ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
