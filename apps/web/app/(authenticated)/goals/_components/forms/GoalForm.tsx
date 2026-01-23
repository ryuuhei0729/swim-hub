'use client'

import React from 'react'
import { Button, Input, DatePicker } from '@/components/ui'
import { format } from 'date-fns'
import type { Style, Competition } from '@apps/shared/types'
import { POOL_TYPES } from '../constants'

interface GoalFormProps {
  // 大会選択
  competitionMode: 'existing' | 'new'
  onCompetitionModeChange: (mode: 'existing' | 'new') => void
  competitions: Competition[]
  selectedCompetitionId: string
  onSelectedCompetitionIdChange: (id: string) => void
  newCompetition: {
    title: string
    date: string
    place: string
    poolType: number
  }
  onNewCompetitionChange: (competition: {
    title: string
    date: string
    place: string
    poolType: number
  }) => void
  // 種目選択
  styles: Style[]
  styleId: string
  onStyleIdChange: (id: string) => void
  // タイム入力
  targetTime: string
  onTargetTimeChange: (time: string) => void
  startTime: string
  onStartTimeChange: (time: string) => void
  useBestTime: boolean
  onGetBestTime: () => void
}

/**
 * 目標フォーム共通コンポーネント
 */
export default function GoalForm({
  competitionMode,
  onCompetitionModeChange,
  competitions,
  selectedCompetitionId,
  onSelectedCompetitionIdChange,
  newCompetition,
  onNewCompetitionChange,
  styles,
  styleId,
  onStyleIdChange,
  targetTime,
  onTargetTimeChange,
  startTime,
  onStartTimeChange,
  useBestTime,
  onGetBestTime
}: GoalFormProps) {
  return (
    <div className="space-y-4">
      {/* 大会選択 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          大会
        </label>
        <div className="flex gap-4 mb-2">
          <label className="flex items-center">
            <input
              type="radio"
              value="existing"
              checked={competitionMode === 'existing'}
              onChange={(e) => onCompetitionModeChange(e.target.value as 'existing' | 'new')}
              className="mr-2"
            />
            既存の大会から選択
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="new"
              checked={competitionMode === 'new'}
              onChange={(e) => onCompetitionModeChange(e.target.value as 'existing' | 'new')}
              className="mr-2"
            />
            新規大会を作成
          </label>
        </div>

        {competitionMode === 'existing' ? (
          <select
            value={selectedCompetitionId}
            onChange={(e) => onSelectedCompetitionIdChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
          >
            <option value="">大会を選択</option>
            {competitions.map((comp) => (
              <option key={comp.id} value={comp.id}>
                {comp.title || '大会'} - {format(new Date(comp.date), 'yyyy/MM/dd')}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-3">
            <Input
              type="text"
              placeholder="大会名"
              value={newCompetition.title}
              onChange={(e) => onNewCompetitionChange({ ...newCompetition, title: e.target.value })}
              required
            />
            <DatePicker
              label="大会日"
              value={newCompetition.date}
              onChange={(date) => onNewCompetitionChange({ ...newCompetition, date })}
              required
            />
            <Input
              type="text"
              placeholder="場所（任意）"
              value={newCompetition.place}
              onChange={(e) => onNewCompetitionChange({ ...newCompetition, place: e.target.value })}
            />
            <select
              value={newCompetition.poolType}
              onChange={(e) => onNewCompetitionChange({ ...newCompetition, poolType: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              required
            >
              {POOL_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 種目選択 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          種目
        </label>
        <select
          value={styleId}
          onChange={(e) => onStyleIdChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          required
        >
          <option value="">種目を選択</option>
          {styles.map((style) => (
            <option key={style.id} value={style.id}>
              {style.name_jp}
            </option>
          ))}
        </select>
      </div>

      {/* 目標タイム */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          目標タイム
        </label>
        <Input
          type="text"
          placeholder="例: 1:23.45 または 83.45"
          value={targetTime}
          onChange={(e) => onTargetTimeChange(e.target.value)}
          required
        />
      </div>

      {/* 初期タイム */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          初期タイム（任意）
        </label>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="例: 1:25.00 または 85.00"
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
            disabled={useBestTime}
          />
          <Button
            type="button"
            variant="outline"
            onClick={onGetBestTime}
            disabled={!styleId}
          >
            ベストタイムから取得
          </Button>
        </div>
      </div>
    </div>
  )
}
