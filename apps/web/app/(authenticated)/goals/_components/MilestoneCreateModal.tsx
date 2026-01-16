'use client'

import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import type { Style, MilestoneParams, MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams } from '@apps/shared/types'
import { MILESTONE_TEMPLATES } from './templates/milestoneTemplates'
import MilestoneForm from './forms/MilestoneForm'
import { DEFAULT_TIME_PARAMS, DEFAULT_REPS_TIME_PARAMS, DEFAULT_SET_PARAMS } from './constants'

interface MilestoneCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  goalId: string
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

  const goalAPI = new GoalAPI(supabase)

  // テンプレート適用
  const handleTemplateSelect = (templateId: string) => {
    const template = MILESTONE_TEMPLATES.find(t => t.id === templateId)
    if (!template) {
      setSelectedTemplate('')
      return
    }

    setType(template.type)
    setSelectedTemplate(templateId)
    setParams(template.defaultParams)
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
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                マイルストーン作成
              </h3>
              <button
                onClick={handleClose}
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
              />

              {/* ボタン */}
              <div className="flex justify-end gap-3 pt-4">
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
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
