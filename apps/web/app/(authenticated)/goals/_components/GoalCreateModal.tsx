'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import { useAuth } from '@/contexts'
import { GoalAPI } from '@apps/shared/api/goals'
import { RecordAPI } from '@apps/shared/api/records'
import { parseTimeToSeconds, formatTime } from '@/utils/formatters'
import type { Style, Competition } from '@apps/shared/types'
import { format } from 'date-fns'
import GoalForm from './forms/GoalForm'

interface GoalCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => Promise<void>
  styles: Style[]
}

/**
 * 大会目標作成モーダル
 */
export default function GoalCreateModal({
  isOpen,
  onClose,
  onSuccess,
  styles
}: GoalCreateModalProps) {
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

  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase])
  const recordAPI = useMemo(() => new RecordAPI(supabase), [supabase])

  // 大会一覧を取得（未来の日付のみ）
  useEffect(() => {
    if (isOpen && competitionMode === 'existing') {
      const today = format(new Date(), 'yyyy-MM-dd')
      recordAPI.getCompetitions(today)
        .then(setCompetitions)
        .catch((error) => {
          console.error('大会一覧取得エラー:', error)
          setCompetitions([])
        })
    }
  }, [isOpen, competitionMode, supabase, recordAPI])

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
    try {
      const targetTimeSeconds = parseTimeToSeconds(targetTime)
      const startTimeSeconds = startTime ? parseTimeToSeconds(startTime) : null

      await goalAPI.createGoal({
        userId: user.id,
        competitionId: competitionMode === 'existing' ? selectedCompetitionId : undefined,
        competitionData: competitionMode === 'new' ? {
          title: newCompetition.title,
          date: newCompetition.date,
          place: newCompetition.place || null,
          poolType: newCompetition.poolType
        } : undefined,
        styleId: parseInt(styleId, 10),
        targetTime: targetTimeSeconds,
        startTime: startTimeSeconds
      })

      await onSuccess()
      handleClose()
    } catch (error) {
      console.error('目標作成エラー:', error)
      alert('目標の作成に失敗しました')
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
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                新規目標作成
              </h3>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                  作成
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
