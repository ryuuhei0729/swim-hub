'use client'

import React, { useState, useEffect } from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { formatTime } from '@/utils/formatters'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import type { GoalWithMilestones, Style } from '@apps/shared/types'
import ProgressBar from './ProgressBar'
import MilestoneList from './MilestoneList'
import MilestoneCreateModal from './MilestoneCreateModal'

interface GoalDetailProps {
  goal: GoalWithMilestones
  styles: Style[]
  onUpdate: () => Promise<void>
  onDelete: () => Promise<void>
}

/**
 * 目標詳細コンポーネント
 */
export default function GoalDetail({
  goal,
  styles,
  onUpdate,
  onDelete
}: GoalDetailProps) {
  const { supabase } = useAuth()
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false)

  const [progress, setProgress] = useState(0)

  // 達成率を計算
  useEffect(() => {
    const calculateProgress = async () => {
      try {
        const goalAPI = new GoalAPI(supabase)
        const calculatedProgress = await goalAPI.calculateGoalProgress(goal.id)
        setProgress(calculatedProgress)
      } catch (error) {
        console.error('達成率計算エラー:', error)
        setProgress(0)
      }
    }

    calculateProgress()
  }, [goal.id, supabase])
  const milestoneProgress = goal.milestones.length > 0
    ? (goal.milestones.filter(m => m.status === 'achieved').length / goal.milestones.length) * 100
    : 0

  const style = styles.find(s => s.id === goal.style_id)

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      {/* ヘッダー */}
      <div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {goal.competition.title || '大会'}
            </h2>
            <p className="text-gray-600 mt-1">
              {style?.name_jp || '種目'} | {format(new Date(goal.competition.date), 'yyyy年M月d日', { locale: ja })}
            </p>
          </div>
        </div>

        {/* 目標タイム情報 */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-600">目標タイム</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatTime(goal.target_time)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">初期タイム</p>
            <p className="text-lg font-semibold text-gray-900">
              {goal.start_time ? formatTime(goal.start_time) : '未設定'}
            </p>
          </div>
        </div>

        {/* 達成率 */}
        <div>
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>達成率</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <ProgressBar progress={progress} />
        </div>
      </div>

      {/* マイルストーンセクション */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            マイルストーン ({goal.milestones.filter(m => m.status === 'achieved').length}/{goal.milestones.length})
          </h3>
          <button
            onClick={() => setIsMilestoneModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            追加
          </button>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
            <span>マイルストーン達成率</span>
            <span>{milestoneProgress.toFixed(0)}%</span>
          </div>
          <ProgressBar progress={milestoneProgress} />
        </div>

        <MilestoneList
          milestones={goal.milestones}
          styles={styles}
          goalCompetitionDate={goal.competition.date}
          onUpdate={onUpdate}
        />
      </div>

      {/* マイルストーン作成モーダル */}
      <MilestoneCreateModal
        isOpen={isMilestoneModalOpen}
        onClose={() => setIsMilestoneModalOpen(false)}
        onSuccess={onUpdate}
        goalId={goal.id}
        styles={styles}
        goalCompetitionDate={goal.competition.date}
      />
    </div>
  )
}
