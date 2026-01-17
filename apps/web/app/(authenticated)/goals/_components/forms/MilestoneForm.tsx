'use client'

import React from 'react'
import { Input } from '@/components/ui'
import type { MilestoneParams } from '@apps/shared/types'
import { isMilestoneTimeParams, isMilestoneRepsTimeParams, isMilestoneSetParams } from '@apps/shared/types/goals'
import { TimeParamsForm, RepsTimeParamsForm, SetParamsForm } from './MilestoneParamsForm'
import DeadlineInput from '../shared/DeadlineInput'
import { MILESTONE_TEMPLATES, type MilestoneTemplate } from '../templates/milestoneTemplates'

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
  availableTemplates?: MilestoneTemplate[]
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
  onTemplateSelect,
  availableTemplates = MILESTONE_TEMPLATES
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
            {availableTemplates.map((template) => (
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
        <div
          role="radiogroup"
          aria-label="マイルストーンタイプ選択"
          className="flex gap-3"
        >
          {[
            {
              value: 'time' as const,
              label: 'タイム目標',
              description: '練習及びタイムトライアルで出したいタイムをマイルストーンに置く。前半のタイムを一旦目標に置くのもおすすめ'
            },
            {
              value: 'reps_time' as const,
              label: '練習平均タイム目標',
              description: '本数×セット数の平均タイムをマイルストーンに置く。100m以上の種目におすすめ'
            },
            {
              value: 'set' as const,
              label: 'サークルイン目標',
              description: '＠サークル で回れる本数、セット数をマイルストーンに置く。200m以上の種目におすすめ'
            }
          ].map((option) => (
            <div
              key={option.value}
              className="relative flex-1 group"
            >
              <label
                className={`
                  flex items-center justify-center px-4 py-3 border-2 rounded-md cursor-pointer transition-all
                  ${type === option.value
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                  }
                  ${selectedTemplate ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <input
                  type="radio"
                  name="milestone-type"
                  value={option.value}
                  checked={type === option.value}
                  onChange={(e) => {
                    if (!selectedTemplate) {
                      onTypeChange(e.target.value as 'time' | 'reps_time' | 'set')
                    }
                  }}
                  disabled={!!selectedTemplate}
                  required
                  className="sr-only"
                  aria-describedby={`type-description-${option.value}`}
                />
                <span className="text-sm font-medium text-center">
                  {option.label}
                </span>
              </label>
              {/* ツールチップ（ホバー時に表示） */}
              <div
                id={`type-description-${option.value}`}
                className="absolute z-10 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-200 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-md shadow-lg pointer-events-none"
                role="tooltip"
              >
                {option.description}
                {/* ツールチップの矢印 */}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                  <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
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
