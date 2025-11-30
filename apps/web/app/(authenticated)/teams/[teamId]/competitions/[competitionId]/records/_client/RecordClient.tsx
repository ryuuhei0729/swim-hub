'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthProvider'
import { Button } from '@/components/ui'
import { ArrowLeftIcon, PlusIcon, TrashIcon, CalendarDaysIcon, MapPinIcon, UserIcon } from '@heroicons/react/24/outline'
import { Competition, Style } from '@apps/shared/types/database'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { formatTime, parseTimeToSeconds } from '@/utils/formatters'

interface TeamMember {
  id: string
  user_id: string
  role: string
  users: {
    id: string
    name: string
  }
}

interface CompetitionWithDetails extends Competition {
  team: {
    id: string
    name: string
  } | null
}

interface RecordWithDetails {
  id: string
  user_id: string
  style_id: number
  time: number
  video_url: string | null
  note: string | null
  is_relaying: boolean
  pool_type: number | null
  team_id: string | null
  split_times: {
    id: string
    distance: number
    split_time: number
  }[]
  users: {
    id: string
    name: string
  } | null
  styles: {
    id: number
    name_jp: string
    distance: number
  } | null
}

interface SplitTimeEntry {
  id: string
  distance: number | ''
  splitTime: number
  displayValue: string
}

interface RecordEntry {
  id: string
  memberId: string
  memberUserId: string
  memberName: string
  styleId: number | ''
  time: number
  timeDisplayValue: string
  isRelaying: boolean
  videoUrl: string
  note: string
  splitTimes: SplitTimeEntry[]
}

interface RecordClientProps {
  teamId: string
  competitionId: string
  competition: CompetitionWithDetails
  teamName: string
  members: TeamMember[]
  existingRecords: RecordWithDetails[]
  styles: Style[]
}

export default function RecordClient({
  teamId,
  competitionId,
  competition,
  teamName,
  members,
  existingRecords,
  styles
}: RecordClientProps) {
  const router = useRouter()
  const { supabase } = useAuth()
  
  const [saving, setSaving] = useState(false)

  // 既存データからレコードエントリを構築
  const buildRecordsFromExisting = (): RecordEntry[] => {
    if (existingRecords.length === 0) {
      // 新規作成時: メンバーごとに1つの空レコードを作成
      return members.map((member, index) => ({
        id: String(index + 1),
        memberId: member.id,
        memberUserId: member.user_id,
        memberName: member.users.name,
        styleId: '',
        time: 0,
        timeDisplayValue: '',
        isRelaying: false,
        videoUrl: '',
        note: '',
        splitTimes: []
      }))
    }

    // 既存データがある場合
    return existingRecords.map((record, index) => {
      const member = members.find(m => m.user_id === record.user_id)
      return {
        id: record.id || String(index + 1),
        memberId: member?.id || '',
        memberUserId: record.user_id,
        memberName: record.users?.name || member?.users.name || 'Unknown',
        styleId: record.style_id,
        time: record.time,
        timeDisplayValue: formatTime(record.time),
        isRelaying: record.is_relaying,
        videoUrl: record.video_url || '',
        note: record.note || '',
        splitTimes: (record.split_times || []).map((st, stIdx) => ({
          id: st.id || String(stIdx + 1),
          distance: st.distance,
          splitTime: st.split_time,
          displayValue: formatTime(st.split_time)
        }))
      }
    })
  }

  const [records, setRecords] = useState<RecordEntry[]>(buildRecordsFromExisting)
  const isEditMode = existingRecords.length > 0

  const addRecord = (memberId: string) => {
    const member = members.find(m => m.id === memberId)
    if (!member) return

    const newRecord: RecordEntry = {
      id: Date.now().toString(),
      memberId: member.id,
      memberUserId: member.user_id,
      memberName: member.users.name,
      styleId: '',
      time: 0,
      timeDisplayValue: '',
      isRelaying: false,
      videoUrl: '',
      note: '',
      splitTimes: []
    }
    setRecords(prev => [...prev, newRecord])
  }

  const removeRecord = (recordId: string) => {
    setRecords(prev => prev.filter(r => r.id !== recordId))
  }

  const updateRecord = (recordId: string, updates: Partial<RecordEntry>) => {
    setRecords(prev => prev.map(record => 
      record.id === recordId ? { ...record, ...updates } : record
    ))
  }

  const handleTimeChange = (recordId: string, value: string) => {
    updateRecord(recordId, {
      timeDisplayValue: value,
      time: parseTimeToSeconds(value)
    })
  }

  const addSplitTime = (recordId: string) => {
    setRecords(prev => prev.map(record => {
      if (record.id !== recordId) return record
      return {
        ...record,
        splitTimes: [
          ...record.splitTimes,
          {
            id: Date.now().toString(),
            distance: '',
            splitTime: 0,
            displayValue: ''
          }
        ]
      }
    }))
  }

  const removeSplitTime = (recordId: string, splitId: string) => {
    setRecords(prev => prev.map(record => {
      if (record.id !== recordId) return record
      return {
        ...record,
        splitTimes: record.splitTimes.filter(st => st.id !== splitId)
      }
    }))
  }

  const updateSplitTime = (recordId: string, splitId: string, field: 'distance' | 'splitTime', value: string) => {
    setRecords(prev => prev.map(record => {
      if (record.id !== recordId) return record
      return {
        ...record,
        splitTimes: record.splitTimes.map(st => {
          if (st.id !== splitId) return st
          if (field === 'distance') {
            return { ...st, distance: value === '' ? '' : parseInt(value) }
          }
          return {
            ...st,
            displayValue: value,
            splitTime: parseTimeToSeconds(value)
          }
        })
      }
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      // 有効なレコードのみをフィルタリング（種目とタイムが入力されているもの）
      const validRecords = records.filter(r => r.styleId !== '' && r.time > 0)

      if (validRecords.length === 0) {
        alert('少なくとも1つの記録を入力してください')
        setSaving(false)
        return
      }

      // 編集モードの場合は既存データを削除
      if (isEditMode) {
        // 既存のスプリットタイムを削除
        for (const record of existingRecords) {
          if (record.split_times && record.split_times.length > 0) {
            const { error: splitDeleteError } = await supabase
              .from('split_times')
              .delete()
              .eq('record_id', record.id)

            if (splitDeleteError) {
              console.error('スプリットタイム削除エラー:', splitDeleteError)
            }
          }
        }

        // 既存のレコードを削除
        const { error: deleteError } = await supabase
          .from('records')
          .delete()
          .eq('competition_id', competitionId)
          .eq('team_id', teamId)

        if (deleteError) {
          console.error('既存のレコード削除エラー:', deleteError)
          return
        }
      }

      // 新規レコードを作成
      for (const record of validRecords) {
        const { data: newRecord, error: recordError } = await supabase
          .from('records')
          .insert({
            competition_id: competitionId,
            user_id: record.memberUserId,
            team_id: teamId,
            style_id: record.styleId as number,
            time: record.time,
            video_url: record.videoUrl || null,
            note: record.note || null,
            is_relaying: record.isRelaying,
            pool_type: competition.pool_type
          })
          .select('id')
          .single()

        if (recordError) {
          console.error(`Record作成エラー (${record.memberName}):`, recordError)
          continue
        }

        // スプリットタイムを作成
        const validSplitTimes = record.splitTimes.filter(st => st.distance !== '' && st.splitTime > 0)
        if (validSplitTimes.length > 0 && newRecord) {
          const splitTimesData = validSplitTimes.map(st => ({
            record_id: newRecord.id,
            distance: st.distance as number,
            split_time: st.splitTime
          }))

          const { error: splitError } = await supabase
            .from('split_times')
            .insert(splitTimesData)

          if (splitError) {
            console.error(`SplitTime作成エラー (${record.memberName}):`, splitError)
          }
        }
      }

      router.push(`/teams/${teamId}?tab=competitions`)
    } catch (err) {
      console.error('チーム大会記録作成エラー:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    router.push(`/teams/${teamId}?tab=competitions`)
  }

  // メンバーごとにレコードをグループ化
  const recordsByMember = members.map(member => ({
    member,
    records: records.filter(r => r.memberId === member.id)
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            大会一覧に戻る
          </button>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {isEditMode ? 'チーム大会記録を編集' : 'チーム大会記録を追加'}
            </h1>
            <p className="text-gray-600 mb-4">
              {teamName}のメンバー分の大会記録を入力できます
            </p>
            
            {/* 大会情報 */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 border-t pt-4">
              <div className="flex items-center gap-1">
                <span className="font-medium">{competition.title}</span>
              </div>
              <div className="flex items-center gap-1">
                <CalendarDaysIcon className="h-4 w-4" />
                <span>{format(new Date(competition.date + 'T00:00:00'), 'yyyy年M月d日(EEE)', { locale: ja })}</span>
              </div>
              {competition.place && (
                <div className="flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4" />
                  <span>{competition.place}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                  {competition.pool_type === 1 ? '長水路' : '短水路'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {recordsByMember.map(({ member, records: memberRecords }) => (
            <div key={member.id} className="bg-white rounded-lg shadow p-6">
              {/* メンバーヘッダー */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <UserIcon className="h-5 w-5 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    {member.users.name}
                  </h2>
                  {member.role === 'admin' && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                      管理者
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={() => addRecord(member.id)}
                  variant="outline"
                  className="text-sm"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  種目追加
                </Button>
              </div>

              {memberRecords.length === 0 ? (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                  <p>このメンバーの記録はありません</p>
                  <Button
                    type="button"
                    onClick={() => addRecord(member.id)}
                    variant="outline"
                    className="mt-2"
                  >
                    <PlusIcon className="h-4 w-4 mr-1" />
                    記録を追加
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {memberRecords.map((record, index) => (
                    <div key={record.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-gray-700">種目 {index + 1}</h3>
                        <button
                          type="button"
                          onClick={() => removeRecord(record.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        {/* 種目 */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            種目
                          </label>
                          <select
                            value={record.styleId}
                            onChange={(e) => updateRecord(record.id, { styleId: e.target.value === '' ? '' : parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">選択してください</option>
                            {styles.map(style => (
                              <option key={style.id} value={style.id}>
                                {style.name_jp}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* タイム */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            タイム
                          </label>
                          <input
                            type="text"
                            value={record.timeDisplayValue}
                            onChange={(e) => handleTimeChange(record.id, e.target.value)}
                            placeholder="例: 1:30.50"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        {/* リレー */}
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={record.isRelaying}
                              onChange={(e) => updateRecord(record.id, { isRelaying: e.target.checked })}
                              className="rounded border-gray-300"
                            />
                            リレー
                          </label>
                        </div>
                      </div>

                      {/* スプリットタイム */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">スプリットタイム</label>
                          <Button
                            type="button"
                            onClick={() => addSplitTime(record.id)}
                            variant="outline"
                            className="text-xs"
                          >
                            <PlusIcon className="h-3 w-3 mr-1" />
                            追加
                          </Button>
                        </div>
                        {record.splitTimes.length > 0 && (
                          <div className="space-y-2">
                            {record.splitTimes.map((split, splitIdx) => (
                              <div key={split.id} className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={split.distance}
                                  onChange={(e) => updateSplitTime(record.id, split.id, 'distance', e.target.value)}
                                  placeholder="距離 (m)"
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                                <span className="text-gray-500">m:</span>
                                <input
                                  type="text"
                                  value={split.displayValue}
                                  onChange={(e) => updateSplitTime(record.id, split.id, 'splitTime', e.target.value)}
                                  placeholder="例: 30.50"
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeSplitTime(record.id, split.id)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* メモ */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          メモ
                        </label>
                        <input
                          type="text"
                          value={record.note}
                          onChange={(e) => updateRecord(record.id, { note: e.target.value })}
                          placeholder="メモ"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3 pt-6">
            <Button
              type="button"
              onClick={handleBack}
              variant="secondary"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? '保存中...' : (isEditMode ? 'チーム大会記録を更新' : 'チーム大会記録を保存')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

