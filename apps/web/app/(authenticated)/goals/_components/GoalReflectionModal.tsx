'use client'

import React, { useState } from 'react'
import { XMarkIcon, TrophyIcon, FlagIcon } from '@heroicons/react/24/outline'
import { Button, Input } from '@/components/ui'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import { format, isValid } from 'date-fns'
import { ja } from 'date-fns/locale'
import { formatTime } from '@/utils/formatters'
import type { GoalWithMilestones } from '@apps/shared/types'

interface GoalReflectionModalProps {
  isOpen: boolean
  onClose: () => void
  goal: GoalWithMilestones
  onSave: () => Promise<void>
}

const REFLECTION_OPTIONS = [
  { id: 'goal_too_high', label: '目標タイムが高すぎた' },
  { id: 'period_too_short', label: '準備期間が短かった' },
  { id: 'practice_insufficient', label: '練習量が足りなかった' },
  { id: 'condition_poor', label: 'コンディション不良' },
  { id: 'other', label: 'その他' }
]

/**
 * 目標期限切れ振り返りモーダル
 */
export default function GoalReflectionModal({
  isOpen,
  onClose,
  goal,
  onSave
}: GoalReflectionModalProps) {
  const { supabase } = useAuth()
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [otherNote, setOtherNote] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isReflectionOpen, setIsReflectionOpen] = useState(false)

  const goalAPI = new GoalAPI(supabase)

  const handleOptionToggle = (optionId: string) => {
    setSelectedOptions(prev => {
      if (prev.includes(optionId)) {
        return prev.filter(id => id !== optionId)
      } else {
        return [...prev, optionId]
      }
    })
  }

  // 達成を記録
  const handleAchieved = async () => {
    setIsLoading(true)
    try {
      await goalAPI.updateGoal(goal.id, {
        status: 'achieved'
      })
      await onSave()
      handleClose()
    } catch (error) {
      console.error('目標更新エラー:', error)
      alert('目標の更新に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  // 未達成として保存（振り返りメモ付き）
  const handleNotAchieved = async () => {
    setIsLoading(true)
    try {
      // 振り返りメモを構築（将来的にDBに保存する際に使用）
      const _reflectionNote = [
        ...selectedOptions.map(id => {
          const option = REFLECTION_OPTIONS.find(o => o.id === id)
          return option?.label || id
        }),
        otherNote ? `その他: ${otherNote}` : ''
      ].filter(Boolean).join('\n')

      // 目標をキャンセル状態に更新
      await goalAPI.updateGoal(goal.id, {
        status: 'cancelled'
      })

      await onSave()
      handleClose()
    } catch (error) {
      console.error('目標更新エラー:', error)
      alert('目標の更新に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setSelectedOptions([])
    setOtherNote('')
    setIsReflectionOpen(false)
    onClose()
  }

  if (!isOpen) return null

  const achievedMilestones = goal.milestones.filter(m => m.status === 'achieved')
  const totalMilestones = goal.milestones.length

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={handleClose}
        />
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                大会目標の振り返り
              </h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                以下の大会目標が期限を迎えました
              </p>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-medium text-gray-900">{goal.competition.title || '大会'}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {goal.style?.name_jp || '種目'} | 目標: {formatTime(goal.target_time)}
                </p>
                {goal.start_time && (
                  <p className="text-xs text-gray-500 mt-1">
                    初期タイム: {formatTime(goal.start_time)}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  大会日: {goal.competition.date && isValid(new Date(goal.competition.date))
                    ? format(new Date(goal.competition.date), 'yyyy年M月d日', { locale: ja })
                    : '未定'}
                </p>
                {totalMilestones > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    マイルストーン達成: {achievedMilestones.length}/{totalMilestones}
                  </p>
                )}
              </div>
            </div>

            {/* 達成したかどうかの選択 */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                目標は達成できましたか？
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={handleAchieved}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  <TrophyIcon className="w-5 h-5" />
                  達成した！
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsReflectionOpen(true)}
                  disabled={isLoading}
                  className="flex items-center justify-center gap-2"
                >
                  <FlagIcon className="w-5 h-5" />
                  達成できなかった
                </Button>
              </div>
            </div>

            {/* 振り返りセクション（未達成時に表示） */}
            {isReflectionOpen && (
            <div className="space-y-4 border-t pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  振り返り（選択式）
                </label>
                <div className="space-y-2">
                  {REFLECTION_OPTIONS.map((option) => (
                    <label key={option.id} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedOptions.includes(option.id)}
                        onChange={() => handleOptionToggle(option.id)}
                        className="mr-2"
                      />
                      <span className="text-sm text-gray-700">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* その他（自由記述） */}
              {selectedOptions.includes('other') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    その他（自由記述）
                  </label>
                  <Input
                    type="text"
                    value={otherNote}
                    onChange={(e) => setOtherNote(e.target.value)}
                    placeholder="詳細を入力してください"
                  />
                </div>
              )}

              {/* 保存ボタン */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isLoading}
                >
                  スキップ
                </Button>
                <Button
                  type="button"
                  onClick={handleNotAchieved}
                  loading={isLoading}
                >
                  保存
                </Button>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
