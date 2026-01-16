'use client'

import React, { useState } from 'react'
import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatTime } from '@/utils/formatters'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import type { Milestone, MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams, Style } from '@apps/shared/types'
import { isMilestoneTimeParams, isMilestoneRepsTimeParams, isMilestoneSetParams } from '@apps/shared/types/goals'
import MilestoneEditModal from './MilestoneEditModal'

interface MilestoneListProps {
  milestones: Milestone[]
  styles: Style[]
  goalCompetitionDate: string
  onUpdate: () => Promise<void>
}

/**
 * マイルストーン一覧コンポーネント
 */
export default function MilestoneList({
  milestones,
  styles,
  goalCompetitionDate,
  onUpdate
}: MilestoneListProps) {
  const { supabase } = useAuth()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null)
  const goalAPI = new GoalAPI(supabase)
  const getStatusIcon = (status: Milestone['status']) => {
    switch (status) {
      case 'achieved':
        return <CheckCircleIcon className="w-5 h-5 text-green-600" />
      case 'in_progress':
        return <ClockIcon className="w-5 h-5 text-blue-600" />
      case 'expired':
        return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
      default:
        return <ClockIcon className="w-5 h-5 text-gray-400" />
    }
  }

  const formatMilestoneTitle = (milestone: Milestone): string => {
    if (isMilestoneTimeParams(milestone.params)) {
      return `${milestone.params.distance}m × 1本: ${formatTime(milestone.params.target_time)}`
    } else if (isMilestoneRepsTimeParams(milestone.params)) {
      return `${milestone.params.distance}m × ${milestone.params.reps}本 @${formatTime(milestone.params.target_average_time)} 平均`
    } else if (isMilestoneSetParams(milestone.params)) {
      return `${milestone.params.distance}m × ${milestone.params.reps}本 × ${milestone.params.sets}セット (@${formatTime(milestone.params.circle)}サークル) 完遂`
    }
    return milestone.title
  }

  const handleEdit = (milestone: Milestone) => {
    setEditingMilestone(milestone)
    setIsEditModalOpen(true)
  }

  const handleDelete = async (milestoneId: string) => {
    if (confirm('このマイルストーンを削除しますか？')) {
      try {
        await goalAPI.deleteMilestone(milestoneId)
        await onUpdate()
      } catch (error) {
        console.error('マイルストーン削除エラー:', error)
        alert('マイルストーンの削除に失敗しました')
      }
    }
  }

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>マイルストーンがありません</p>
        <p className="text-sm mt-1">右上の「追加」ボタンから作成してください</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {milestones.map((milestone) => {
        const isAchieved = milestone.status === 'achieved'
        
        return (
          <div
            key={milestone.id}
            className={`
              border rounded-lg p-4 transition-colors
              ${isAchieved 
                ? 'border-green-300 bg-green-50 ring-2 ring-green-200' 
                : 'border-gray-200 hover:bg-gray-50'
              }
            `}
          >
            <div className="flex items-start gap-3">
              {getStatusIcon(milestone.status)}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-gray-900">
                    {milestone.title}
                  </h4>
                  {isAchieved && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      達成！
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {formatMilestoneTitle(milestone)}
                </p>
                {milestone.deadline && (
                  <p className="text-xs text-gray-500 mt-1">
                    期限: {format(new Date(milestone.deadline), 'yyyy年M月d日', { locale: ja })}
                  </p>
                )}
                {isAchieved && milestone.achieved_at && (
                  <p className="text-xs text-green-600 mt-1">
                    達成日: {format(new Date(milestone.achieved_at), 'yyyy年M月d日', { locale: ja })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEdit(milestone)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                  title="編集"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(milestone.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                  title="削除"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {/* マイルストーン編集モーダル */}
      {editingMilestone && (
        <MilestoneEditModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false)
            setEditingMilestone(null)
          }}
          onSuccess={async () => {
            await onUpdate()
            setIsEditModalOpen(false)
            setEditingMilestone(null)
          }}
          milestone={editingMilestone}
          styles={styles}
          goalCompetitionDate={goalCompetitionDate}
        />
      )}
    </div>
  )
}
