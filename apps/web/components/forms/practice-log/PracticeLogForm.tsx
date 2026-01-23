'use client'

import React, { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button, ConfirmDialog } from '@/components/ui'
import FormStepper from '@/components/ui/FormStepper'
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'

// 練習記録フォームのステップ定義
const PRACTICE_STEPS = [
  { id: 'basic', label: '基本情報', description: '日付・場所' },
  { id: 'log', label: '練習記録', description: 'メニュー・タイム' }
]
import { useAuth } from '@/contexts'
import { PracticeAPI } from '@apps/shared/api/practices'
import MilestoneSelectorModal from '@/app/(authenticated)/goals/_components/MilestoneSelectorModal'
import type {
  MilestoneTimeParams,
  MilestoneRepsTimeParams,
  MilestoneSetParams,
} from '@apps/shared/types'
import {
  isMilestoneTimeParams,
  isMilestoneRepsTimeParams,
  isMilestoneSetParams,
} from '@apps/shared/types/goals'

import { usePracticeLogForm } from './hooks'
import { PracticeMenuItem } from './components'
import type { PracticeLogFormProps, PracticeMenu, Tag } from './types'

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
  const { supabase, user } = useAuth()
  const practiceAPI = new PracticeAPI(supabase)

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
  } = usePracticeLogForm({ isOpen, editData })

  // マイルストーン選択モーダルの状態
  const [isMilestoneSelectorOpen, setIsMilestoneSelectorOpen] = useState(false)
  // 確認ダイアログの表示状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  // 確認ダイアログのコンテキスト
  const [confirmContext, setConfirmContext] = useState<'close' | 'back'>('close')

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = () => {
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
      setShowConfirmDialog(false)
      window.history.back()
      return
    }
    setShowConfirmDialog(false)
    onClose()
  }, [confirmContext, onClose])

  const handleCancelClose = useCallback(() => {
    setShowConfirmDialog(false)
  }, [])

  if (!isOpen) return null

  const handleSubmit = async () => {
    setIsSubmitted(true)
    try {
      await onSubmit(prepareSubmitData())
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error('フォーム送信エラー:', error)
      setIsSubmitted(false)
    }
  }

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleMilestoneSelect = async (milestone: {
    id: string
    title: string
    params: MilestoneTimeParams | MilestoneRepsTimeParams | MilestoneSetParams
  }) => {
    const params = milestone.params
    let newMenu: PracticeMenu

    // milestone tagを取得または作成
    const tagName = `milestone:${milestone.title}`
    const legacyTagName = `milestone:${milestone.id}`
    let milestoneTag: Tag | null = null

    const existingTag = availableTags.find(
      (t) => t.name === tagName || t.name === legacyTagName
    )
    if (existingTag) {
      milestoneTag = existingTag
      if (existingTag.name === legacyTagName && user) {
        try {
          const updatedTag = await practiceAPI.updatePracticeTag(
            existingTag.id,
            tagName,
            existingTag.color
          )
          milestoneTag = updatedTag
          setAvailableTags((prev) =>
            prev.map((t) => (t.id === existingTag.id ? updatedTag : t))
          )
        } catch (error) {
          console.error('milestone tag更新エラー:', error)
        }
      }
    } else if (user) {
      try {
        const createdTag = await practiceAPI.createPracticeTag(tagName, '#3B82F6')
        milestoneTag = createdTag
        setAvailableTags((prev) => [...prev, createdTag])
      } catch (error) {
        console.error('milestone tag作成エラー:', error)
      }
    }

    if (isMilestoneTimeParams(params)) {
      const p = params as MilestoneTimeParams
      newMenu = {
        id: String(Date.now()),
        style: p.style,
        swimCategory: 'Swim',
        distance: p.distance,
        reps: 1,
        sets: 1,
        circleMin: 0,
        circleSec: 0,
        note: '',
        tags: milestoneTag ? [milestoneTag] : [],
        times: [],
      }
    } else if (isMilestoneRepsTimeParams(params)) {
      const p = params as MilestoneRepsTimeParams
      const circleTime = p.circle
      const circleMin = Math.floor(circleTime / 60)
      const circleSec = circleTime % 60
      newMenu = {
        id: String(Date.now()),
        style: p.style,
        swimCategory: p.swim_category,
        distance: p.distance,
        reps: p.reps,
        sets: p.sets,
        circleMin: circleMin,
        circleSec: circleSec,
        note: '',
        tags: milestoneTag ? [milestoneTag] : [],
        times: [],
      }
    } else if (isMilestoneSetParams(params)) {
      const p = params as MilestoneSetParams
      const circleTime = p.circle
      const circleMin = Math.floor(circleTime / 60)
      const circleSec = circleTime % 60
      newMenu = {
        id: String(Date.now()),
        style: p.style,
        swimCategory: p.swim_category,
        distance: p.distance,
        reps: p.reps,
        sets: p.sets,
        circleMin: circleMin,
        circleSec: circleSec,
        note: '',
        tags: milestoneTag ? [milestoneTag] : [],
        times: [],
      }
    } else {
      return
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
                    onClick={() => setIsMilestoneSelectorOpen(true)}
                    variant="outline"
                    className="flex items-center gap-2"
                    disabled={isLoading}
                  >
                    📌 マイルストーンから作成
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
            <div className="flex justify-end gap-3 pt-6 border-t sticky bottom-0 bg-white">
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

      {/* マイルストーン選択モーダル */}
      <MilestoneSelectorModal
        isOpen={isMilestoneSelectorOpen}
        onClose={() => setIsMilestoneSelectorOpen(false)}
        onSelect={handleMilestoneSelect}
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
    </div>
  )
}
