'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Button from '@/components/ui/Button'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { formatTimeShort, formatTimeAverage } from '@apps/shared/utils/time'
import {
  parseQuickTime,
  QuickTimeContext,
  defaultQuickTimeContext
} from '@apps/shared/utils/quickTimeParser'
import { parseTime } from '@apps/shared/utils/time'

interface TeamMember {
  id: string
  user_id: string
  users: {
    name: string
  }
}

export interface TeamTimeEntry {
  memberId: string
  times: {
    setNumber: number
    repNumber: number
    time: number
    displayValue: string // 表示用の値（個人作成と同じ）
  }[] // セット×本数分のタイム配列（個人作成と同じ構造）
}

interface TeamTimeInputModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (times: TeamTimeEntry[]) => void
  setCount: number
  repCount: number
  teamMembers: TeamMember[]
  menuNumber?: number
  initialTimes?: TeamTimeEntry[] // 編集モード用の初期タイムデータ
}

export default function TeamTimeInputModal({
  isOpen,
  onClose,
  onSubmit,
  setCount,
  repCount,
  teamMembers,
  menuNumber,
  initialTimes
}: TeamTimeInputModalProps) {
  const [teamTimes, setTeamTimes] = useState<TeamTimeEntry[]>([])
  // メンバーごとのクイック入力コンテキスト
  const [memberContexts, setMemberContexts] = useState<Record<string, QuickTimeContext>>({})

  // チームメンバーとタイム入力の初期化
  useEffect(() => {
    if (isOpen && teamMembers.length > 0) {
      if (initialTimes && initialTimes.length > 0) {
        // 編集モード: 既存のタイムデータを使用
        setTeamTimes(initialTimes)
      } else {
        // 新規作成モード: デフォルト値で初期化
        const initialTeamTimes: TeamTimeEntry[] = teamMembers.map(member => {
          const times = []
          for (let set = 1; set <= setCount; set++) {
            for (let rep = 1; rep <= repCount; rep++) {
              times.push({
                setNumber: set,
                repNumber: rep,
                time: 0,
                displayValue: ''
              })
            }
          }
          return {
            memberId: member.id,
            times
          }
        })
        setTeamTimes(initialTeamTimes)
      }
    }
  }, [isOpen, teamMembers, setCount, repCount, initialTimes])

  // 入力中は displayValue のみ更新（パースしない）
  const handleTimeInput = useCallback((memberId: string, timeIndex: number, value: string) => {
    setTeamTimes(prev => prev.map(entry => {
      if (entry.memberId === memberId) {
        const newTimes = [...entry.times]
        newTimes[timeIndex] = {
          ...newTimes[timeIndex],
          displayValue: value
        }
        return { ...entry, times: newTimes }
      }
      return entry
    }))
  }, [])

  // 入力確定時にパース（Enter または フォーカスアウト）
  const handleTimeConfirm = useCallback((memberId: string, timeIndex: number, value: string) => {
    if (!value.trim()) return

    // メンバーのコンテキストを取得
    const prevContext = memberContexts[memberId] ?? defaultQuickTimeContext

    // クイック形式を試す
    const quickResult = parseQuickTime(value, prevContext)

    let time: number
    let displayValue: string

    if (quickResult) {
      time = quickResult.time
      displayValue = quickResult.displayValue
      // コンテキストを更新
      setMemberContexts(prev => ({
        ...prev,
        [memberId]: quickResult.context
      }))
    } else {
      // フォールバック: 従来のparseTime
      time = parseTime(value)
      displayValue = time > 0 ? formatTimeShort(time) : value

      // 従来形式でもコンテキストを更新
      if (time > 0) {
        const totalSeconds = Math.floor(time)
        const seconds = totalSeconds % 60
        const minutes = Math.floor(totalSeconds / 60)
        const tensDigit = Math.floor(seconds / 10)
        setMemberContexts(prev => ({
          ...prev,
          [memberId]: { minutes, tensDigit }
        }))
      }
    }

    setTeamTimes(prev => prev.map(entry => {
      if (entry.memberId === memberId) {
        const newTimes = [...entry.times]
        newTimes[timeIndex] = {
          ...newTimes[timeIndex],
          displayValue: displayValue || value,
          time
        }
        return { ...entry, times: newTimes }
      }
      return entry
    }))
  }, [memberContexts])

  // Enterキーでパース＋次のフィールドへ移動
  const handleKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    currentIndex: number,
    memberId: string,
    timeIndex: number,
    value: string
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTimeConfirm(memberId, timeIndex, value)
      const inputs = document.querySelectorAll<HTMLInputElement>('[data-team-time-input]')
      const nextInput = inputs[currentIndex + 1]
      if (nextInput) {
        nextInput.focus()
      }
    }
  }, [handleTimeConfirm])

  // モーダルが開いた時にコンテキストをリセット
  useEffect(() => {
    if (isOpen) {
      setMemberContexts({})
    }
  }, [isOpen])

  const getMemberTimes = (memberId: string) => {
    const memberEntry = teamTimes.find(entry => entry.memberId === memberId)
    return memberEntry?.times || []
  }

  const getMemberAverage = (memberId: string) => {
    const times = getMemberTimes(memberId)
    const validTimes = times.filter(timeEntry => timeEntry.time > 0)
    if (validTimes.length === 0) return 0
    return validTimes.reduce((sum, timeEntry) => sum + timeEntry.time, 0) / validTimes.length
  }

  const handleSubmit = () => {
    onSubmit(teamTimes)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto" data-testid="team-time-input-modal">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div 
          className="fixed inset-0 bg-black/40 transition-opacity" 
          onClick={onClose}
        ></div>

        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-2xl border-2 border-gray-300 transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full" data-testid="team-time-input-dialog">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {menuNumber ? `メニュー${menuNumber}のチームタイム入力` : 'チームタイム入力'}
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500"
                onClick={onClose}
                data-testid="team-time-input-close-button"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {setCount}セット × {repCount}本 = {setCount * repCount}本のタイムを入力してください
            </p>
          </div>

          {/* タイム入力テーブル */}
          <div className="bg-white px-6 py-4 max-h-96 overflow-y-auto" data-testid="team-time-input-table">
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      メンバー
                    </th>
                    {Array.from({ length: setCount * repCount }, (_, i) => (
                      <th key={i} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {i + 1}本目
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      平均
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {teamMembers.map((member, memberIndex) => {
                    const memberTimes = getMemberTimes(member.id)
                    const average = getMemberAverage(member.id)
                    
                    return (
                      <tr key={member.id} className={memberIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {member.users?.name || 'Unknown User'}
                        </td>
                        {Array.from({ length: setCount * repCount }, (_, timeIndex) => {
                          const globalIndex = memberIndex * (setCount * repCount) + timeIndex
                          return (
                          <td key={timeIndex} className="px-3 py-3 text-center">
                            <input
                              type="text"
                              placeholder="31-2"
                              value={memberTimes[timeIndex]?.displayValue || ''}
                              onChange={(e) => handleTimeInput(member.id, timeIndex, e.target.value)}
                              onBlur={(e) => handleTimeConfirm(member.id, timeIndex, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, globalIndex, member.id, timeIndex, memberTimes[timeIndex]?.displayValue || '')}
                              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              data-testid={`team-time-input-${memberIndex + 1}-${timeIndex + 1}`}
                              data-team-time-input
                            />
                          </td>
                          )
                          })}
                        <td className="px-3 py-3 text-center text-sm font-medium text-blue-600">
                          {average > 0 ? formatTimeAverage(average) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-6 py-3 sm:flex sm:flex-row-reverse">
            <Button
              onClick={handleSubmit}
              className="w-full sm:w-auto sm:ml-3"
              data-testid="team-time-input-save-button"
            >
              保存
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="mt-3 w-full sm:mt-0 sm:w-auto"
              data-testid="team-time-input-cancel-button"
            >
              キャンセル
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
