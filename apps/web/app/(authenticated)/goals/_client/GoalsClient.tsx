'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import { RecordAPI } from '@apps/shared/api/records'
import type { Goal, Style, GoalWithMilestones, Competition } from '@apps/shared/types'
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
  const [goals, setGoals] = useState<(Goal & { competition?: { title: string | null }; style?: { name_jp: string } })[]>(initialGoals as (Goal & { competition?: { title: string | null }; style?: { name_jp: string } })[])
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [selectedGoal, setSelectedGoal] = useState<GoalWithMilestones | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GoalWithMilestones | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const goalAPI = new GoalAPI(supabase)
  const recordAPI = new RecordAPI(supabase)

  // 初期目標を選択（1つ以上ある場合）
  useEffect(() => {
    if (initialGoals.length > 0 && !selectedGoalId) {
      setSelectedGoalId(initialGoals[0].id)
    }
  }, []) // 初回マウント時のみ実行

  // 選択された目標の詳細を取得
  useEffect(() => {
    if (selectedGoalId) {
      setIsLoading(true)
      goalAPI.getGoalWithMilestones(selectedGoalId)
        .then((goal) => {
          setSelectedGoal(goal)
          setIsLoading(false)
        })
        .catch((error) => {
          console.error('目標詳細取得エラー:', error)
          setSelectedGoal(null)
          setIsLoading(false)
        })
    } else {
      setSelectedGoal(null)
    }
  }, [selectedGoalId, supabase])

  // 目標一覧を再取得
  const refreshGoals = async () => {
    try {
      const [updatedGoals, competitions] = await Promise.all([
        goalAPI.getGoals(),
        recordAPI.getCompetitions()
      ])
      
      // goalsにcompetitionとstyle情報を追加
      const goalsWithDetails = updatedGoals.map(goal => {
        const competition = competitions.find(c => c.id === goal.competition_id)
        const style = styles.find(s => s.id === goal.style_id)
        return {
          ...goal,
          competition: competition ? { title: competition.title } : undefined,
          style: style ? { name_jp: style.name_jp } : undefined
        }
      })
      
      setGoals(goalsWithDetails)
    } catch (error) {
      console.error('目標一覧取得エラー:', error)
    }
  }

  // 目標作成後のコールバック
  const handleGoalCreated = async () => {
    await refreshGoals()
    setIsCreateModalOpen(false)
  }

  // 目標削除後のコールバック
  const handleGoalDeleted = async () => {
    await refreshGoals()
    if (selectedGoalId) {
      setSelectedGoalId(null)
      setSelectedGoal(null)
    }
  }

  // 目標更新後のコールバック
  const handleGoalUpdated = async () => {
    await refreshGoals()
    if (selectedGoalId) {
      // 選択中の目標も更新
      const updatedGoal = await goalAPI.getGoalWithMilestones(selectedGoalId)
      setSelectedGoal(updatedGoal)
    }
  }

  // 目標編集ボタンが押されたときのハンドラー
  const handleEditGoal = async (goalId: string) => {
    try {
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
    await refreshGoals()
    setIsEditModalOpen(false)
    setEditingGoal(null)
    if (selectedGoalId) {
      // 選択中の目標も更新
      const updatedGoal = await goalAPI.getGoalWithMilestones(selectedGoalId)
      setSelectedGoal(updatedGoal)
    }
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
            <GoalList
              goals={goals}
              selectedGoalId={selectedGoalId}
              onSelectGoal={setSelectedGoalId}
              onDeleteGoal={handleGoalDeleted}
              onEditGoal={handleEditGoal}
            />
          </div>

          {/* 右側: 目標詳細 */}
          <div className="lg:col-span-2">
            {isLoading ? (
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
