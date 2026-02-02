'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
import { formatTimeBest } from '@/utils/formatters'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import type { Goal } from '@apps/shared/types'
import ProgressBar from './ProgressBar'

interface GoalListProps {
  goals: (Goal & { competition?: { title: string | null }; style?: { name_jp: string } })[]
  selectedGoalId: string | null
  onSelectGoal: (goalId: string) => void
  onDeleteGoal: () => Promise<void>
  onEditGoal: (goalId: string) => void
}

/**
 * 大会目標リストコンポーネント
 */
export default function GoalList({
  goals,
  selectedGoalId,
  onSelectGoal,
  onDeleteGoal,
  onEditGoal
}: GoalListProps) {
  const { supabase } = useAuth()
  const [progressMap, setProgressMap] = useState<Record<string, number>>({})
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase])

  // 各目標の達成率を計算
  useEffect(() => {
    const calculateProgresses = async () => {
      const newProgressMap: Record<string, number> = {}
      for (const goal of goals) {
        try {
          const progress = await goalAPI.calculateGoalProgress(goal.id)
          newProgressMap[goal.id] = progress
        } catch (error) {
          console.error(`目標 ${goal.id} の達成率計算エラー:`, error)
          newProgressMap[goal.id] = 0
        }
      }
      setProgressMap(newProgressMap)
    }

    if (goals.length > 0) {
      calculateProgresses()
    }
  }, [goals, supabase, goalAPI])

  const handleDelete = async (e: React.MouseEvent, goalId: string) => {
    e.stopPropagation()
    if (confirm('この目標を削除しますか？')) {
      try {
        await goalAPI.deleteGoal(goalId)
        await onDeleteGoal()
      } catch (error) {
        console.error('目標削除エラー:', error)
        alert('目標の削除に失敗しました')
      }
    }
  }

  const handleEdit = (e: React.MouseEvent, goalId: string) => {
    e.stopPropagation()
    onEditGoal(goalId)
  }

  const getCompetitionName = (goal: Goal & { competition?: { title: string | null } }): string => {
    return goal.competition?.title || '大会'
  }

  const getStyleName = (goal: Goal & { style?: { name_jp: string } }): string => {
    return goal.style?.name_jp || '種目'
  }

  if (goals.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500 text-center py-8">
          目標がありません
          <br />
          右上のボタンから新規作成してください
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {goals.map((goal) => {
        const progress = progressMap[goal.id] || 0
        const isSelected = selectedGoalId === goal.id
        const isAchieved = goal.status === 'achieved'

        return (
          <div
            key={goal.id}
            onClick={() => onSelectGoal(goal.id)}
            className={`
              rounded-lg shadow p-4 cursor-pointer transition-all
              ${isSelected ? 'ring-2 ring-blue-500' : 'hover:shadow-md'}
              ${isAchieved ? 'bg-green-50 border border-green-200' : 'bg-white'}
            `}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 text-sm">
                    {getCompetitionName(goal)}
                  </h3>
                  {isAchieved && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      達成！
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  {getStyleName(goal)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => handleEdit(e, goal.id)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                  title="編集"
                  aria-label="編集"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => handleDelete(e, goal.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                  title="削除"
                  aria-label="削除"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>目標: {formatTimeBest(goal.target_time)}</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <ProgressBar progress={progress} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
