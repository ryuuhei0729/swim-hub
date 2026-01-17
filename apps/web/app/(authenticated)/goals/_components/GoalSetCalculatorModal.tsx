'use client'

import React, { useState, useMemo } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts'
import { useUserProfileQuery } from '@apps/shared/hooks/queries/user'
import type { GoalWithMilestones, Style } from '@apps/shared/types'
import {
  calculateGoalSetTargetTime,
  calculateAge,
  getStyleCoefficient
} from '@/utils/goalSetCalculator'
import { formatTime } from '@/utils/formatters'

interface GoalSetCalculatorModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (targetAverageTime: number, practicePoolType: number) => void
  goal: GoalWithMilestones
  style: Style
}

/**
 * ゴールセット目標タイム計算モーダル
 * 100m目標タイムから、50m×6本×3セットで出すべき平均タイムを逆算
 */
export default function GoalSetCalculatorModal({
  isOpen,
  onClose,
  onConfirm,
  goal,
  style
}: GoalSetCalculatorModalProps) {
  const { supabase } = useAuth()
  const [practicePoolType, setPracticePoolType] = useState<number>(0) // デフォルト: 短水路
  const { data: profile, isLoading: isProfileLoading } = useUserProfileQuery(supabase)

  // 年齢を計算
  const age = useMemo(() => {
    if (!profile?.birthday) return null
    return calculateAge(profile.birthday)
  }, [profile?.birthday])

  // 逆算結果を計算
  const calculatedTargetTime = useMemo(() => {
    if (!age) return null

    const Y = goal.target_time // 100m目標タイム
    const X2 = age // 年齢
    const X3 = 3 // 主観的達成度（固定値: 3）
    // データベース: gender 0=男性, 1=女性
    // 計算式: X4 1=男性, 0=女性
    const X4 = profile?.gender === 0 ? 1 : 0 // 性別（男=1, 女=0）
    const X5 = practicePoolType // ゴールセット実施水路（長水路=1, 短水路=0）
    const X6 = goal.competition.pool_type // 競技会の水路（長水路=1, 短水路=0）
    const X7 = getStyleCoefficient(style.style) // 種目係数（自由形=0, バタフライ=0.00001, 背泳ぎ=1.53, 平泳ぎ=2.34）

    const result = calculateGoalSetTargetTime({
      Y,
      X2,
      X3,
      X4,
      X5,
      X6,
      X7
    })

    // 現実的な範囲チェック（20秒未満や60秒超は警告）
    if (result < 20 || result > 60) {
      return { value: result, warning: true }
    }

    return { value: result, warning: false }
  }, [goal.target_time, goal.competition.pool_type, age, profile?.gender, practicePoolType, style.style])

  const handleConfirm = () => {
    if (calculatedTargetTime && calculatedTargetTime.value > 0) {
      onConfirm(calculatedTargetTime.value, practicePoolType)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          className="relative bg-white rounded-lg shadow-xl w-full max-w-md"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                ゴールセット目標タイム計算
              </h3>
              <button
                onClick={onClose}
                aria-label="閉じる"
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* ゴールセットの説明 */}
              <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-600">
                <p className="mb-2">
                  <a
                    href="https://sites.google.com/view/goalset-racetime-prediction/%E3%83%95%E3%82%A3%E3%83%BC%E3%83%89%E3%83%90%E3%83%83%E3%82%AF/%E9%87%8D%E5%9B%9E%E5%B8%B0%E5%BC%8F"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    順天堂大学水泳研究室の重回帰式
                  </a>
                  を使用して、目標タイムを達成するためにゴールセット（50m×6本×3セット）で出すべき平均タイムを逆算します。
                </p>
                <p className="text-gray-500">
                  ※主観的達成度（1〜5段階）は「3」で固定して計算しています。
                </p>
              </div>

              {/* 自動取得情報（確認用） */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  自動取得情報
                </h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">目標:</span>
                    <span className="font-medium">
                      {style.name_jp} {formatTime(goal.target_time)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">大会水路:</span>
                    <span className="font-medium">
                      {goal.competition.pool_type === 1 ? '長水路' : '短水路'}
                    </span>
                  </div>
                  {isProfileLoading ? (
                    <div className="text-gray-500">読み込み中...</div>
                  ) : (
                    <>
                      {age !== null ? (
                        <div className="flex justify-between">
                          <span className="text-gray-600">年齢:</span>
                          <span className="font-medium">{age}歳</span>
                        </div>
                      ) : (
                        <div className="text-red-600 text-xs">
                          年齢が設定されていません。プロフィールで設定してください。
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">性別:</span>
                        <span className="font-medium">
                          {profile?.gender === 1 ? '女子' : '男子'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 入力情報 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ゴールセット実施水路
                </label>
                <select
                  value={practicePoolType}
                  onChange={(e) => setPracticePoolType(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>短水路（25m）</option>
                  <option value={1}>長水路（50m）</option>
                </select>
              </div>

              {/* 計算結果 */}
              {calculatedTargetTime && age !== null ? (
                <div
                  className={`rounded-lg p-4 ${
                    calculatedTargetTime.warning
                      ? 'bg-yellow-50 border-2 border-yellow-300'
                      : 'bg-blue-50 border-2 border-blue-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">ゴールセット目標</div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">
                      {formatTime(calculatedTargetTime.value)}
                    </div>
                    <div className="text-xs text-gray-500">
                      50m平均（50m×6本×3セット）
                    </div>
                    {calculatedTargetTime.warning && (
                      <div className="mt-2 text-xs text-yellow-700">
                        ⚠️ 計算結果が現実的でない可能性があります
                      </div>
                    )}
                  </div>
                </div>
              ) : age === null ? (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                  <div className="text-sm text-red-700">
                    年齢が設定されていないため、計算できません。
                    <br />
                    プロフィール設定で生年月日を入力してください。
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500">計算中...</div>
              )}
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
              >
                キャンセル
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={!calculatedTargetTime || calculatedTargetTime.value <= 0 || age === null}
              >
                この値を使用
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
