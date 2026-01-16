'use client'

import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import { format } from 'date-fns'
import type { Style, Milestone, MilestoneParams, MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams, UpdateMilestoneInput } from '@apps/shared/types'
import MilestoneForm from './forms/MilestoneForm'
import { DEFAULT_TIME_PARAMS, DEFAULT_REPS_TIME_PARAMS, DEFAULT_SET_PARAMS } from './constants'

interface MilestoneEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  milestone: Milestone
  styles: Style[]
  goalCompetitionDate: string
}

/**
 * マイルストーン編集モーダル
 */
export default function MilestoneEditModal({
  isOpen,
  onClose,
  onSuccess,
  milestone,
  styles: _styles,
  goalCompetitionDate
}: MilestoneEditModalProps) {
  const { supabase } = useAuth()
  const [type, setType] = useState<'time' | 'reps_time' | 'set'>('time')
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [params, setParams] = useState<MilestoneParams>(DEFAULT_TIME_PARAMS)
  const [isLoading, setIsLoading] = useState(false)

  const goalAPI = new GoalAPI(supabase)

  // 既存のマイルストーンデータでフォームを初期化
  useEffect(() => {
    if (isOpen && milestone) {
      setType(milestone.type)
      setTitle(milestone.title)
      setDeadline(milestone.deadline ? format(new Date(milestone.deadline), 'yyyy-MM-dd') : '')
      setParams(milestone.params)
    }
  }, [isOpen, milestone])

  // タイプ変更時にパラメータをリセット
  const handleTypeChange = (newType: 'time' | 'reps_time' | 'set') => {
    setType(newType)
    if (newType === 'time') {
      setParams(DEFAULT_TIME_PARAMS)
    } else if (newType === 'reps_time') {
      setParams(DEFAULT_REPS_TIME_PARAMS)
    } else {
      setParams(DEFAULT_SET_PARAMS)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setIsLoading(true)
    try {
      await goalAPI.updateMilestone(milestone.id, {
        type,
        title: title || getDefaultTitle(type, params),
        params,
        deadline: deadline || null
      } as Omit<UpdateMilestoneInput, 'id'>)

      await onSuccess()
    } catch (error) {
      console.error('マイルストーン更新エラー:', error)
      alert('マイルストーンの更新に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const getDefaultTitle = (milestoneType: string, params: MilestoneParams): string => {
    if (milestoneType === 'time') {
      const p = params as MilestoneTimeParams
      return `${p.distance}m × 1本: ${p.target_time}秒`
    } else if (milestoneType === 'reps_time') {
      const p = params as MilestoneRepsTimeParams
      return `${p.distance}m × ${p.reps}本 @${p.target_average_time}秒 平均`
    } else {
      const p = params as MilestoneSetParams
      return `${p.distance}m × ${p.reps}本 × ${p.sets}セット (@${p.circle}秒サークル) 完遂`
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={onClose}
        />
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                マイルストーン編集
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <MilestoneForm
                type={type}
                onTypeChange={handleTypeChange}
                title={title}
                onTitleChange={setTitle}
                params={params}
                onParamsChange={setParams}
                deadline={deadline}
                onDeadlineChange={setDeadline}
                goalCompetitionDate={goalCompetitionDate}
                showTemplateSelector={false}
              />

              {/* ボタン */}
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  キャンセル
                </Button>
                <Button
                  type="submit"
                  loading={isLoading}
                >
                  更新
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
