'use client'

import React, { useState } from 'react'
import { useAuth } from '@/contexts'
import type { Goal, Style, GoalWithMilestones } from '@apps/shared/types'
import { useGoalsQuery, useGoalDetailQuery } from '@apps/shared/hooks/queries/goals'
import { GoalAPI } from '@apps/shared/api/goals'
import GoalList from '../_components/GoalList'
import GoalDetail from '../_components/GoalDetail'
import GoalCreateModal from '../_components/GoalCreateModal'
import GoalEditModal from '../_components/GoalEditModal'
import { PlusIcon } from '@heroicons/react/24/outline'

interface GoalsClientProps {
  initialGoals: Goal[]
  styles: Style[]
}

/**
 * 目標管理ページのインタラクティブ部分を担当するClient Component
 */
export default function GoalsClient({
  initialGoals,
  styles
}: GoalsClientProps) {
  const { supabase } = useAuth()
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(
    initialGoals.length > 0 ? initialGoals[0].id : null
  )
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GoalWithMilestones | null>(null)

  // React Query: 目標一覧
  const {
    data: goals = [],
    error: goalsError,
    invalidate: invalidateGoals
  } = useGoalsQuery(supabase, {
    styles,
  })

  // React Query: 選択中の目標詳細
  const {
    data: selectedGoal,
    isLoading,
    error: goalError,
    invalidate: invalidateGoalDetail
  } = useGoalDetailQuery(supabase, selectedGoalId)

  // 目標作成後のコールバック
  const handleGoalCreated = async () => {
    await invalidateGoals()
    setIsCreateModalOpen(false)
  }

  // 目標削除後のコールバック
  const handleGoalDeleted = async () => {
    await invalidateGoals()
    if (selectedGoalId) {
      setSelectedGoalId(null)
    }
  }

  // 目標更新後のコールバック
  const handleGoalUpdated = async () => {
    await Promise.all([invalidateGoals(), invalidateGoalDetail()])
  }

  // 目標編集ボタンが押されたときのハンドラー
  const handleEditGoal = async (goalId: string) => {
    try {
      const goalAPI = new GoalAPI(supabase)
      const goal = await goalAPI.getGoalWithMilestones(goalId)
      setEditingGoal(goal)
      setIsEditModalOpen(true)
    } catch (error) {
      console.error('目標詳細取得エラー:', error)
      alert('目標の詳細を取得できませんでした')
    }
  }

  // 目標編集後のコールバック
  const handleGoalEdited = async () => {
    await Promise.all([invalidateGoals(), invalidateGoalDetail()])
    setIsEditModalOpen(false)
    setEditingGoal(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">目標管理</h1>
            <p className="text-gray-600 mt-1">
              大会目標を設定し、マイルストーンで進捗を管理します
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            新規目標作成
          </button>
        </div>

        {/* メインコンテンツ: リスト+詳細レイアウト */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側: 大会目標リスト */}
          <div className="lg:col-span-1">
            {goalsError ? (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <p className="text-red-600 mb-3">目標一覧の取得に失敗しました</p>
                <button
                  onClick={() => invalidateGoals()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  再読み込み
                </button>
              </div>
            ) : (
              <GoalList
                goals={goals}
                selectedGoalId={selectedGoalId}
                onSelectGoal={setSelectedGoalId}
                onDeleteGoal={handleGoalDeleted}
                onEditGoal={handleEditGoal}
              />
            )}
          </div>

          {/* 右側: 目標詳細 */}
          <div className="lg:col-span-2">
            {goalError ? (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <p className="text-red-600 mb-3">目標詳細の取得に失敗しました</p>
                <button
                  onClick={() => invalidateGoalDetail()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  再読み込み
                </button>
              </div>
            ) : isLoading ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              </div>
            ) : selectedGoal ? (
              <GoalDetail
                goal={selectedGoal}
                styles={styles}
                onUpdate={handleGoalUpdated}
                onDelete={handleGoalDeleted}
              />
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <p className="text-gray-500 text-lg">
                  左側のリストから目標を選択してください
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 目標作成モーダル */}
        <GoalCreateModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleGoalCreated}
          styles={styles}
        />

        {/* 目標編集モーダル */}
        {editingGoal && (
          <GoalEditModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false)
              setEditingGoal(null)
            }}
            onSuccess={handleGoalEdited}
            goal={editingGoal}
            styles={styles}
          />
        )}
      </div>
    </div>
  )
}
