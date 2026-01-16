'use client'

import React from 'react'
import { Input } from '@/components/ui'
import type { MilestoneParams } from '@apps/shared/types'
import { isMilestoneTimeParams, isMilestoneRepsTimeParams, isMilestoneSetParams } from '@apps/shared/types/goals'
import { TimeParamsForm, RepsTimeParamsForm, SetParamsForm } from './MilestoneParamsForm'
import DeadlineInput from '../shared/DeadlineInput'
import { MILESTONE_TEMPLATES } from '../templates/milestoneTemplates'

interface MilestoneFormProps {
  type: 'time' | 'reps_time' | 'set'
  onTypeChange: (type: 'time' | 'reps_time' | 'set') => void
  title: string
  onTitleChange: (title: string) => void
  params: MilestoneParams
  onParamsChange: (params: MilestoneParams) => void
  deadline: string
  onDeadlineChange: (deadline: string) => void
  goalCompetitionDate: string
  showTemplateSelector?: boolean
  selectedTemplate?: string
  onTemplateSelect?: (templateId: string) => void
}

/**
 * マイルストーンフォーム共通コンポーネント
 */
export default function MilestoneForm({
  type,
  onTypeChange,
  title,
  onTitleChange,
  params,
  onParamsChange,
  deadline,
  onDeadlineChange,
  goalCompetitionDate,
  showTemplateSelector = false,
  selectedTemplate = '',
  onTemplateSelect
}: MilestoneFormProps) {
  return (
    <div className="space-y-4">
      {/* テンプレート選択（Create時のみ） */}
      {showTemplateSelector && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            テンプレート（任意）
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => {
              if (onTemplateSelect) {
                onTemplateSelect(e.target.value)
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">テンプレートを選択（空欄で手動入力）</option>
            {MILESTONE_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} - {template.description}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* タイプ選択 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          タイプ
        </label>
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value as 'time' | 'reps_time' | 'set')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          required
          disabled={!!selectedTemplate}
        >
          <option value="time">タイム目標</option>
          <option value="reps_time">本数×タイム目標（平均）</option>
          <option value="set">セット完遂型</option>
        </select>
        {selectedTemplate && (
          <p className="text-xs text-gray-500 mt-1">
            テンプレート適用中: タイプは変更できません
          </p>
        )}
      </div>

      {/* タイトル */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          タイトル（任意、空欄の場合は自動生成）
        </label>
        <Input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </div>

      {/* パラメータフォーム */}
      {type === 'time' && isMilestoneTimeParams(params) && (
        <TimeParamsForm
          params={params}
          onChange={(p) => onParamsChange(p)}
        />
      )}

      {type === 'reps_time' && isMilestoneRepsTimeParams(params) && (
        <RepsTimeParamsForm
          params={params}
          onChange={(p) => onParamsChange(p)}
        />
      )}

      {type === 'set' && isMilestoneSetParams(params) && (
        <SetParamsForm
          params={params}
          onChange={(p) => onParamsChange(p)}
        />
      )}

      {/* 期限日 */}
      <DeadlineInput
        value={deadline}
        onChange={onDeadlineChange}
        goalCompetitionDate={goalCompetitionDate}
      />
    </div>
  )
}
