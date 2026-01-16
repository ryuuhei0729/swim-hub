'use client'

import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import type { Milestone, MilestoneParams, MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams } from '@apps/shared/types'
import { isMilestoneTimeParams, isMilestoneRepsTimeParams, isMilestoneSetParams } from '@apps/shared/types/goals'

interface MilestoneSelectorModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (milestone: Milestone) => void
}

/**
 * マイルストーン選択モーダル
 */
export default function MilestoneSelectorModal({
  isOpen,
  onClose,
  onSelect
}: MilestoneSelectorModalProps) {
  const { supabase, user } = useAuth()
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const goalAPI = new GoalAPI(supabase)

  // アクティブなマイルストーンを取得
  useEffect(() => {
    if (isOpen && user) {
      setIsLoading(true)
      // アクティブな目標のみ取得
      goalAPI.getGoals({ status: 'active' })
        .then(async (goals) => {
          const allMilestones: Milestone[] = []
          const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD形式
          for (const goal of goals) {
            const goalMilestones = await goalAPI.getMilestones(goal.id, {
              status: ['not_started', 'in_progress'], // 未達成・進行中のマイルストーン
              deadlineAfter: today // 期限切れでないマイルストーンのみ
            })
            allMilestones.push(...goalMilestones)
          }
          setMilestones(allMilestones)
        })
        .catch((error) => {
          console.error('マイルストーン取得エラー:', error)
          setMilestones([])
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [isOpen, user, supabase])

  const formatMilestoneTitle = (milestone: Milestone): string => {
    if (isMilestoneTimeParams(milestone.params)) {
      const p = milestone.params as MilestoneTimeParams
      return `${p.distance}m × 1本: ${p.target_time}秒`
    } else if (isMilestoneRepsTimeParams(milestone.params)) {
      const p = milestone.params as MilestoneRepsTimeParams
      return `${p.distance}m × ${p.reps}本 @${p.target_average_time}秒 平均`
    } else if (isMilestoneSetParams(milestone.params)) {
      const p = milestone.params as MilestoneSetParams
      return `${p.distance}m × ${p.reps}本 × ${p.sets}セット (@${p.circle}秒サークル) 完遂`
    }
    return milestone.title
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={onClose}
        />
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                マイルストーンから作成
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-gray-500">読み込み中...</p>
              </div>
            ) : milestones.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">利用可能なマイルストーンがありません</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {milestones.map((milestone) => (
                  <button
                    key={milestone.id}
                    onClick={() => {
                      onSelect(milestone)
                      onClose()
                    }}
                    className="w-full text-left p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <p className="font-medium text-gray-900">{milestone.title}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {formatMilestoneTitle(milestone)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
