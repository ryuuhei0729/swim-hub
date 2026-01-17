'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import { RecordAPI } from '@apps/shared/api/records'
import { parseTimeToSeconds, formatTime } from '@/utils/formatters'
import type { Style, GoalWithMilestones, Competition, UpdateGoalInput } from '@apps/shared/types'
import { format } from 'date-fns'
import GoalForm from './forms/GoalForm'

interface GoalEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  goal: GoalWithMilestones
  styles: Style[]
}

/**
 * 大会目標編集モーダル
 */
export default function GoalEditModal({
  isOpen,
  onClose,
  onSuccess,
  goal,
  styles
}: GoalEditModalProps) {
  const { supabase, user } = useAuth()
  const [competitionMode, setCompetitionMode] = useState<'existing' | 'new'>('existing')
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('')
  const [newCompetition, setNewCompetition] = useState({
    title: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    place: '',
    poolType: 0
  })
  const [styleId, setStyleId] = useState<string>('')
  const [targetTime, setTargetTime] = useState<string>('')
  const [startTime, setStartTime] = useState<string>('')
  const [useBestTime, setUseBestTime] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase])
  const recordAPI = useMemo(() => new RecordAPI(supabase), [supabase])

  // 大会一覧を取得（未来の大会 + 編集中目標の大会）
  useEffect(() => {
    if (isOpen && competitionMode === 'existing') {
      const today = format(new Date(), 'yyyy-MM-dd')
      const existingCompetitionId = goal?.competition_id

      recordAPI.getCompetitions(today)
        .then(async (futureCompetitions) => {
          // 既存の大会が未来の大会リストに含まれているか確認
          const existingIncluded = futureCompetitions.some(c => c.id === existingCompetitionId)
          
          if (existingCompetitionId && !existingIncluded) {
            // 既存の大会が含まれていない場合、個別に取得してマージ
            const { data: existingCompetition } = await supabase
              .from('competitions')
              .select('*')
              .eq('id', existingCompetitionId)
              .single()
            
            if (existingCompetition) {
              setCompetitions([existingCompetition, ...futureCompetitions])
            } else {
              setCompetitions(futureCompetitions)
            }
          } else {
            setCompetitions(futureCompetitions)
          }
        })
        .catch((error) => {
          console.error('大会一覧取得エラー:', error)
          setCompetitions([])
        })
    }
  }, [isOpen, competitionMode, supabase, recordAPI, goal?.competition_id])

  // 既存の目標データでフォームを初期化
  useEffect(() => {
    if (isOpen && goal) {
      setSelectedCompetitionId(goal.competition_id)
      setCompetitionMode('existing')
      setStyleId(goal.style_id.toString())
      setTargetTime(formatTime(goal.target_time))
      setStartTime(goal.start_time ? formatTime(goal.start_time) : '')
      setUseBestTime(false)
      setValidationError(null)
    }
  }, [isOpen, goal])

  // ベストタイムを取得
  const handleGetBestTime = async () => {
    if (!styleId || !user) return

    try {
      const selectedStyle = styles.find(s => s.id === parseInt(styleId, 10))
      if (!selectedStyle) return

      const bestTimes = await recordAPI.getBestTimes()
      const bestTime = bestTimes.find(bt => bt.style.name_jp === selectedStyle.name_jp)

      if (bestTime) {
        setStartTime(formatTime(bestTime.time))
        setUseBestTime(true)
      } else {
        alert('この種目のベストタイムが見つかりませんでした')
        setUseBestTime(false)
      }
    } catch (error) {
      console.error('ベストタイム取得エラー:', error)
      alert('ベストタイムの取得に失敗しました')
      setUseBestTime(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsLoading(true)
    setValidationError(null)

    try {
      // タイムを秒数に変換
      const targetTimeSeconds = parseTimeToSeconds(targetTime)
      const startTimeSeconds = startTime ? parseTimeToSeconds(startTime) : null
      const parsedStyleId = parseInt(styleId, 10)

      // バリデーション: targetTimeSeconds（必須）
      if (!Number.isFinite(targetTimeSeconds) || Number.isNaN(targetTimeSeconds) || targetTimeSeconds <= 0 || targetTimeSeconds > 3600) {
        setValidationError('目標タイムを正しく入力してください（0秒超〜60分以内）')
        setIsLoading(false)
        return
      }

      // バリデーション: startTimeSeconds（startTimeが提供されている場合のみ）
      if (startTime) {
        if (startTimeSeconds === null || !Number.isFinite(startTimeSeconds) || Number.isNaN(startTimeSeconds) || startTimeSeconds <= 0 || startTimeSeconds > 3600) {
          setValidationError('開始タイムを正しく入力してください（0秒超〜60分以内）')
          setIsLoading(false)
          return
        }
      }

      // バリデーション: styleId（必須）
      if (!Number.isFinite(parsedStyleId) || Number.isNaN(parsedStyleId) || parsedStyleId <= 0) {
        setValidationError('種目が選択されていません。')
        setIsLoading(false)
        return
      }

      // バリデーションが通ったので、大会作成と目標更新を実行
      let competitionId = selectedCompetitionId
      
      // 新規大会を作成する場合
      if (competitionMode === 'new') {
        const newComp = await recordAPI.createCompetition({
          title: newCompetition.title,
          date: newCompetition.date,
          place: newCompetition.place || null,
          pool_type: newCompetition.poolType,
          note: null
        })
        competitionId = newComp.id
      }

      // バリデーション済みの値のみを使用して目標を更新
      await goalAPI.updateGoal(goal.id, {
        competitionId: competitionId,
        styleId: parsedStyleId,
        targetTime: targetTimeSeconds,
        startTime: startTimeSeconds
      } as Omit<UpdateGoalInput, 'id'>)

      await onSuccess()
      handleClose()
    } catch (error) {
      console.error('目標更新エラー:', error)
      alert('目標の更新に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setCompetitionMode('existing')
    setSelectedCompetitionId('')
    setNewCompetition({
      title: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      place: '',
      poolType: 0
    })
    setStyleId('')
    setTargetTime('')
    setStartTime('')
    setUseBestTime(false)
    setValidationError(null)
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
        <div
          role="dialog"
          aria-modal="true"
          className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                目標編集
              </h3>
              <button
                onClick={handleClose}
                aria-label="閉じる"
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {validationError && (
                <div
                  className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md"
                  role="alert"
                >
                  {validationError}
                </div>
              )}
              <GoalForm
                competitionMode={competitionMode}
                onCompetitionModeChange={setCompetitionMode}
                competitions={competitions}
                selectedCompetitionId={selectedCompetitionId}
                onSelectedCompetitionIdChange={setSelectedCompetitionId}
                newCompetition={newCompetition}
                onNewCompetitionChange={setNewCompetition}
                styles={styles}
                styleId={styleId}
                onStyleIdChange={setStyleId}
                targetTime={targetTime}
                onTargetTimeChange={setTargetTime}
                startTime={startTime}
                onStartTimeChange={setStartTime}
                useBestTime={useBestTime}
                onGetBestTime={handleGetBestTime}
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
                  更新
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
