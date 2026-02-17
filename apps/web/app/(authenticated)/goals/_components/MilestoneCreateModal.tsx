'use client'

import React, { useState, useMemo } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import Button from '@/components/ui/Button'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import { PracticeLogTemplateAPI } from '@swim-hub/shared/api'
import type { GoalWithMilestones, Style, MilestoneParams, MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams, MilestoneGoalSetParams } from '@apps/shared/types'
import { MILESTONE_TEMPLATES } from './templates/milestoneTemplates'
import MilestoneForm from './forms/MilestoneForm'
import GoalSetCalculatorModal from './GoalSetCalculatorModal'
import { DEFAULT_TIME_PARAMS, DEFAULT_REPS_TIME_PARAMS, DEFAULT_SET_PARAMS } from './constants'

interface MilestoneCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  goalId: string
  goal: GoalWithMilestones
  styles: Style[]
  goalCompetitionDate: string
}

/**
 * マイルストーン作成モーダル
 */
export default function MilestoneCreateModal({
  isOpen,
  onClose,
  onSuccess,
  goalId,
  goal,
  styles: _styles,
  goalCompetitionDate
}: MilestoneCreateModalProps) {
  const { supabase } = useAuth()
  const [type, setType] = useState<'time' | 'reps_time' | 'set'>('time')
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [params, setParams] = useState<MilestoneParams>(DEFAULT_TIME_PARAMS)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoalSetModalOpen, setIsGoalSetModalOpen] = useState(false)
  const [addToTemplate, setAddToTemplate] = useState(false)

  const goalAPI = new GoalAPI(supabase)
  const templateAPI = new PracticeLogTemplateAPI(supabase)

  // Goalが100m種目かどうかをチェック
  const is100mGoal = useMemo(() => {
    return goal.style.distance === 100
  }, [goal.style.distance])

  // 100m種目の場合のみゴールセットテンプレートを表示
  const availableTemplates = useMemo(() => {
    if (is100mGoal) {
      return MILESTONE_TEMPLATES
    }
    return MILESTONE_TEMPLATES.filter(t => t.id !== 'goalset_50m_6x3')
  }, [is100mGoal])

  // テンプレート適用
  const handleTemplateSelect = (templateId: string) => {
    const template = availableTemplates.find(t => t.id === templateId)
    if (!template) {
      setSelectedTemplate('')
      return
    }

    // ゴールセットテンプレートが選択された場合、計算モーダルを表示
    if (templateId === 'goalset_50m_6x3') {
      setIsGoalSetModalOpen(true)
      return
    }

    // タイムトライアルテンプレートが選択された場合、goalから値を取得
    if (templateId === 'time_trial') {
      const styleMap: Record<string, string> = {
        'fr': 'Fr',
        'br': 'Br',
        'ba': 'Ba',
        'fly': 'Fly',
        'im': 'Im'
      }
      const styleValue = styleMap[goal.style.style] || 'Fr'

      const timeTrialParams: MilestoneTimeParams = {
        distance: goal.style.distance,
        target_time: Math.round((goal.target_time * 1.01) * 100) / 100,
        style: styleValue,
        swim_category: 'Swim'
      }

      setType('time')
      setSelectedTemplate('time_trial')
      setParams(timeTrialParams)
      setTitle(template.name) // タイトルを自動設定
      return
    }

    setType(template.type)
    setSelectedTemplate(templateId)
    setParams(template.defaultParams)
    setTitle(template.name) // タイトルを自動設定
  }

  // ゴールセット計算結果を適用
  const handleGoalSetConfirm = (targetAverageTime: number, practicePoolType: number) => {
    // style.styleは'fr' | 'br' | 'ba' | 'fly' | 'im'の形式
    // MilestoneGoalSetParamsのstyleは'Fr' | 'Br' | 'Ba' | 'Fly' | 'Im'の形式（先頭大文字）
    const styleMap: Record<string, string> = {
      'fr': 'Fr',
      'br': 'Br',
      'ba': 'Ba',
      'fly': 'Fly',
      'im': 'Im'
    }
    const styleValue = styleMap[goal.style.style] || 'Fr'

    const goalSetParams: MilestoneGoalSetParams = {
      distance: 50,
      reps: 6,
      sets: 3,
      target_average_time: targetAverageTime,
      style: styleValue,
      swim_category: 'Swim',
      circle: 90,
      practice_pool_type: practicePoolType
    }

    setType('reps_time')
    setSelectedTemplate('goalset_50m_6x3')
    setParams(goalSetParams)
    setTitle('ゴールセット') // タイトルを自動設定
    setIsGoalSetModalOpen(false)
  }

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
      await goalAPI.createMilestone({
        goalId,
        title: title || getDefaultTitle(type, params),
        type,
        params,
        deadline: deadline || null
      })

      // テンプレートにも追加する場合
      if (addToTemplate && (type === 'reps_time' || type === 'set')) {
        const milestoneTitle = title || getDefaultTitle(type, params)
        const p = params as MilestoneRepsTimeParams | MilestoneSetParams

        await templateAPI.createTemplate({
          name: milestoneTitle,
          style: p.style || 'Fr',
          swim_category: (p.swim_category as 'Swim' | 'Pull' | 'Kick') || 'Swim',
          distance: p.distance,
          rep_count: p.reps,
          set_count: 'sets' in p ? p.sets : 1,
          circle: p.circle || null,
        })
      }

      await onSuccess()
      handleClose()
    } catch (error) {
      console.error('マイルストーン作成エラー:', error)
      alert('マイルストーンの作成に失敗しました')
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

  const handleClose = () => {
    setType('time')
    setTitle('')
    setDeadline('')
    setSelectedTemplate('')
    setParams(DEFAULT_TIME_PARAMS)
    setAddToTemplate(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={handleClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                マイルストーン作成
              </h3>
              <button
                onClick={handleClose}
                aria-label="閉じる"
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
                showTemplateSelector={true}
                selectedTemplate={selectedTemplate}
                onTemplateSelect={handleTemplateSelect}
                availableTemplates={availableTemplates}
              />

              {/* ボタン行（チェックボックス含む） */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                {/* テンプレートにも追加するチェックボックス（reps_timeまたはsetタイプの場合のみ） */}
                {(type === 'reps_time' || type === 'set') ? (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addToTemplate}
                      onChange={(e) => setAddToTemplate(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        テンプレートにも追加
                      </span>
                      <span className="text-xs text-gray-500 ml-1">
                        (練習作成時に使用)
                      </span>
                    </div>
                  </label>
                ) : (
                  <div />
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isLoading}
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="submit"
                    loading={isLoading}
                  >
                    作成
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ゴールセット計算モーダル */}
      <GoalSetCalculatorModal
        isOpen={isGoalSetModalOpen}
        onClose={() => setIsGoalSetModalOpen(false)}
        onConfirm={handleGoalSetConfirm}
        goal={goal}
        style={goal.style}
      />
    </div>
  )
}
