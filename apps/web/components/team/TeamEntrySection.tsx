'use client'

import React, { useState, useEffect } from 'react'
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatTime } from '@/utils/formatters'
import { StyleAPI } from '@apps/shared/api/styles'
import { EntryAPI } from '@apps/shared/api/entries'
import { useAuth } from '@/contexts/AuthProvider'
import type { Style } from '@apps/shared/types/database'

interface TeamEntrySectionProps {
  teamId: string
  isAdmin: boolean
}

interface Competition {
  id: string
  title: string
  date: string
  place: string | null
  pool_type: number
  entry_status: 'before' | 'open' | 'closed'
  note: string | null
}

interface UserEntry {
  id: string
  user_id: string
  style_id: number
  entry_time: number | null
  note: string | null
  created_at: string
  style: Style | null
}

export default function TeamEntrySection({ teamId, isAdmin }: TeamEntrySectionProps) {
  const { supabase } = useAuth()
  const [loading, setLoading] = useState(true)
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [styles, setStyles] = useState<Style[]>([])
  const [expandedCompetitions, setExpandedCompetitions] = useState<Set<string>>(new Set())
  const [userEntries, setUserEntries] = useState<Record<string, UserEntry[]>>({})
  const [submitting, setSubmitting] = useState(false)

  // 各大会のフォーム状態
  const [formData, setFormData] = useState<Record<string, {
    styleId: string
    entryTime: string
    note: string
    editingEntryId: string | null
  }>>({})

  useEffect(() => {
    loadData()
  }, [teamId])

  const loadData = async () => {
    try {
      setLoading(true)
      const styleAPI = new StyleAPI(supabase)

      // エントリー受付中の大会を取得（open のみ）
      const { data: openComps, error: compsError } = await supabase
        .from('competitions')
        .select('*')
        .eq('team_id', teamId)
        .eq('entry_status', 'open')
        .order('date', { ascending: true })
      if (compsError) throw compsError
      setCompetitions(openComps)

      // 種目一覧を取得
      const stylesData = await styleAPI.getStyles()
      setStyles(stylesData)

        // 各大会のユーザーエントリーを取得
        if (openComps.length > 0) {
          const entriesData: Record<string, UserEntry[]> = {}
          const entryAPI = new EntryAPI(supabase)
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) throw new Error('認証が必要です')
          await Promise.all(
            openComps.map(async (comp: Competition) => {
              const entries = await entryAPI.getEntriesByCompetition(comp.id)
              const mine = (entries || []).filter((e: any) => e.user_id === user.id)
              const convertedEntries = mine.map((entry: any) => ({
                ...entry,
                style: Array.isArray(entry.style) ? entry.style[0] : entry.style
              }))
              entriesData[comp.id] = convertedEntries
            })
          )
          setUserEntries(entriesData)

        // デフォルトはすべて閉じた状態
        setExpandedCompetitions(new Set())
      }
    } catch (error) {
      console.error('データの取得に失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleCompetition = (competitionId: string) => {
    const newExpanded = new Set(expandedCompetitions)
    if (newExpanded.has(competitionId)) {
      newExpanded.delete(competitionId)
    } else {
      newExpanded.add(competitionId)
    }
    setExpandedCompetitions(newExpanded)
  }

  const getFormData = (competitionId: string) => {
    return formData[competitionId] || {
      styleId: '',
      entryTime: '',
      note: '',
      editingEntryId: null
    }
  }

  const updateFormData = (competitionId: string, updates: Partial<typeof formData[string]>) => {
    setFormData(prev => ({
      ...prev,
      [competitionId]: {
        ...getFormData(competitionId),
        ...updates
      }
    }))
  }

  const parseTime = (timeStr: string): number | null => {
    if (!timeStr || timeStr.trim() === '') return null
    
    const trimmed = timeStr.trim()
    
    try {
      const parts = trimmed.split(':')
      if (parts.length === 2) {
        const minutesStr = parts[0].trim()
        const secondsStr = parts[1].trim()
        
        const minutes = parseInt(minutesStr, 10)
        const seconds = parseFloat(secondsStr)
        
        // 両方の値が有効な数値であることを確認
        if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || 
            Number.isNaN(minutes) || Number.isNaN(seconds) ||
            minutes < 0 || seconds < 0) {
          return null
        }
        
        return minutes * 60 + seconds
      } else {
        const seconds = parseFloat(trimmed)
        
        // 単一の数値が有効であることを確認
        if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) {
          return null
        }
        
        return seconds
      }
    } catch {
      return null
    }
  }

  const handleSubmitEntry = async (competitionId: string) => {
    const form = getFormData(competitionId)
    
    if (!form.styleId) {
      alert('種目を選択してください')
      return
    }

    try {
      setSubmitting(true)
      const entryAPI = new EntryAPI(supabase)
      
      const entryTime = parseTime(form.entryTime)
      
      // 新規作成用のデータ（competition_id, user_id を含む）
      const entryData = {
        competition_id: competitionId,
        style_id: parseInt(form.styleId),
        entry_time: entryTime,
        note: form.note || null
      }
      
      // 更新用のペイロード（competition_id, user_id を除外）
      const updatePayload = {
        style_id: parseInt(form.styleId),
        entry_time: entryTime,
        note: form.note || null
      }

      // 既存エントリーの重複チェック
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      const existingEntry = await entryAPI.checkExistingEntry(
        competitionId,
        user.id,
        parseInt(form.styleId)
      )

      if (form.editingEntryId) {
        // 編集モード
        await entryAPI.updateEntry(form.editingEntryId, updatePayload)
        alert('エントリーを更新しました')
      } else if (existingEntry) {
        // 既存エントリーがある場合は更新
        await entryAPI.updateEntry(existingEntry.id, updatePayload)
        alert('エントリーを更新しました')
      } else {
        // 新規作成
        await entryAPI.createTeamEntry(teamId, user.id, entryData)
        alert('エントリーを追加しました')
      }

      // フォームをリセット
      updateFormData(competitionId, {
        styleId: '',
        entryTime: '',
        note: '',
        editingEntryId: null
      })

      // エントリー一覧を再読み込み（自分の分のみ）
      const entryAPIRefetch = new EntryAPI(supabase)
      const allEntries = await entryAPIRefetch.getEntriesByCompetition(competitionId)
      const mine = (allEntries || []).filter((e: any) => e.user_id === user.id)
      const convertedEntries = mine.map((entry: any) => ({
        ...entry,
        style: Array.isArray(entry.style) ? entry.style[0] : entry.style
      }))
      setUserEntries(prev => ({
        ...prev,
        [competitionId]: convertedEntries
      }))
    } catch (error: any) {
      console.error('エントリーの送信に失敗:', error)
      alert(error.message || 'エントリーの送信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditEntry = (competitionId: string, entry: UserEntry) => {
    updateFormData(competitionId, {
      styleId: entry.style_id.toString(),
      entryTime: entry.entry_time ? formatTime(entry.entry_time) : '',
      note: entry.note || '',
      editingEntryId: entry.id
    })
  }

  const handleCancelEdit = (competitionId: string) => {
    updateFormData(competitionId, {
      styleId: '',
      entryTime: '',
      note: '',
      editingEntryId: null
    })
  }

  const handleDeleteEntry = async (competitionId: string, entryId: string) => {
    if (!confirm('このエントリーを削除しますか？')) return

    try {
      setSubmitting(true)
      const entryAPI = new EntryAPI(supabase)
      await entryAPI.deleteEntry(entryId)
      
      // エントリー一覧を再読み込み（自分の分のみ）
      const entryAPIRefetch = new EntryAPI(supabase)
      const allEntries = await entryAPIRefetch.getEntriesByCompetition(competitionId)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')
      const mine = (allEntries || []).filter((e: any) => e.user_id === user.id)
      const convertedEntries = mine.map((entry: any) => ({
        ...entry,
        style: Array.isArray(entry.style) ? entry.style[0] : entry.style
      }))
      setUserEntries(prev => ({
        ...prev,
        [competitionId]: convertedEntries
      }))
      
      alert('エントリーを削除しました')
    } catch (error: any) {
      console.error('エントリーの削除に失敗:', error)
      alert(error.message || 'エントリーの削除に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  // エントリー受付中の大会がない場合は何も表示しない
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  if (competitions.length === 0) {
    return null // エントリー受付中の大会がない場合は非表示
  }

  return (
    <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg shadow-md p-6">
      <div className="flex items-center mb-4">
        <span className="text-2xl mr-2">📝</span>
        <h2 className="text-xl font-bold text-orange-900">エントリー受付中の大会</h2>
        <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-200 text-orange-800">
          {competitions.length}件
        </span>
      </div>

      <div className="space-y-4">
        {competitions.map((competition) => {
          const isExpanded = expandedCompetitions.has(competition.id)
          const entries = userEntries[competition.id] || []
          const form = getFormData(competition.id)

          return (
            <div key={competition.id} className="bg-white border border-orange-200 rounded-lg overflow-hidden">
              {/* 大会ヘッダー（クリックで展開/折りたたみ） */}
              <button
                onClick={() => toggleCompetition(competition.id)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-orange-50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xl">🏆</span>
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">{competition.title}</h3>
                    <div className="flex items-center space-x-3 text-sm text-gray-600 mt-1">
                      <span>📅 {new Date(competition.date).toLocaleDateString('ja-JP')}</span>
                      {competition.place && <span>📍 {competition.place}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {entries.length > 0 && (
                    <span className="text-sm text-orange-700 font-medium">
                      {entries.length}件エントリー済み
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </button>

              {/* 展開時のコンテンツ */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-orange-100">
                  {/* 既存エントリー一覧 */}
                  {entries.length > 0 && (
                    <div className="mt-4 mb-4">
                      <h4 className="text-sm font-semibold text-orange-900 mb-2">✅ あなたのエントリー</h4>
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-md border border-orange-100">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">
                                {entry.style?.name_jp || '種目不明'}
                              </p>
                              {entry.entry_time && entry.entry_time > 0 && (
                                <p className="text-sm text-gray-600">
                                  エントリータイム: <span className="font-mono font-semibold">{formatTime(entry.entry_time)}</span>
                                </p>
                              )}
                              {entry.note && (
                                <p className="text-sm text-gray-500 mt-1">{entry.note}</p>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 ml-4">
                              <button
                                onClick={() => handleEditEntry(competition.id, entry)}
                                className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                title="編集"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(competition.id, entry.id)}
                                disabled={submitting}
                                className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                                title="削除"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* エントリーフォーム */}
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-orange-900 mb-3">
                      {form.editingEntryId ? '✏️ エントリーを編集' : '➕ エントリーを追加'}
                    </h4>
                    <div className="space-y-3">
                      {/* 種目選択 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          種目 <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={form.styleId}
                          onChange={(e) => updateFormData(competition.id, { styleId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        >
                          <option value="">選択してください</option>
                          {styles.map((style) => (
                            <option key={style.id} value={style.id}>
                              {style.name_jp}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* エントリータイム */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          エントリータイム（任意）
                        </label>
                        <input
                          type="text"
                          value={form.entryTime}
                          onChange={(e) => updateFormData(competition.id, { entryTime: e.target.value })}
                          placeholder="例: 1:23.45"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          形式: 分:秒.ミリ秒（例: 1:23.45） または 秒.ミリ秒（例: 65.23）
                        </p>
                      </div>

                      {/* メモ */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          メモ（任意）
                        </label>
                        <textarea
                          value={form.note}
                          onChange={(e) => updateFormData(competition.id, { note: e.target.value })}
                          placeholder="補足情報があれば入力してください"
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>

                      {/* 送信ボタン */}
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSubmitEntry(competition.id)}
                          disabled={submitting || !form.styleId}
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 text-white rounded-md hover:from-orange-700 hover:to-amber-700 transition-all shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {submitting ? '送信中...' : form.editingEntryId ? '更新する' : 'エントリーする'}
                        </button>
                        {form.editingEntryId && (
                          <button
                            onClick={() => handleCancelEdit(competition.id)}
                            disabled={submitting}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            キャンセル
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

