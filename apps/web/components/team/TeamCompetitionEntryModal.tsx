'use client'

import React, { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { formatTime } from '@/utils/formatters'
import { TeamAPI } from '@apps/shared/api'
import { useAuth } from '@/contexts/AuthProvider'

interface TeamCompetitionEntryModalProps {
  isOpen: boolean
  onClose: () => void
  competitionId: string
  competitionTitle: string
  teamId: string
}

export default function TeamCompetitionEntryModal({
  isOpen,
  onClose,
  competitionId,
  competitionTitle,
  teamId
}: TeamCompetitionEntryModalProps) {
  const { supabase } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadEntries()
    }
  }, [isOpen, competitionId])

  const loadEntries = async () => {
    try {
      setLoading(true)
      setError(null)
      const teamAPI = new TeamAPI(supabase)
      const result = await teamAPI.getCompetitionEntries(competitionId)
      setData(result)
    } catch (err: any) {
      console.error('エントリー情報の取得に失敗:', err)
      setError(err.message || 'エントリー情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (newStatus: 'before' | 'open' | 'closed') => {
    // 現在のステータスと同じ場合は何もしない
    if (data && data.competition.entry_status === newStatus) {
      return
    }

    try {
      setUpdatingStatus(true)
      const teamAPI = new TeamAPI(supabase)
      await teamAPI.updateCompetitionEntryStatus(competitionId, newStatus)
      await loadEntries() // 再読み込み
      alert(`エントリーステータスを「${getStatusLabel(newStatus)}」に変更しました`)
    } catch (err: any) {
      console.error('ステータス変更に失敗:', err)
      alert(err.message || 'ステータス変更に失敗しました')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const getStatusLabel = (status: 'before' | 'open' | 'closed') => {
    switch (status) {
      case 'before': return '受付前'
      case 'open': return '受付中'
      case 'closed': return '受付終了'
    }
  }

  const getStatusColor = (status: 'before' | 'open' | 'closed') => {
    switch (status) {
      case 'before': return 'bg-gray-100 text-gray-800'
      case 'open': return 'bg-green-100 text-green-800'
      case 'closed': return 'bg-red-100 text-red-800'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  {competitionTitle} - エントリー管理
                </h3>
                {data && (
                  <p className="text-sm text-gray-500 mt-1">
                    合計: {data.totalEntries}件のエントリー
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {loading && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">読み込み中...</p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {!loading && !error && data && (
              <>
                {/* エントリーステータス管理 */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label htmlFor="entry-status" className="block text-sm font-medium text-gray-700 mb-2">
                        エントリーステータス
                      </label>
                      {data.isAdmin ? (
                        <select
                          id="entry-status"
                          value={data.competition.entry_status}
                          onChange={(e) => handleStatusChange(e.target.value as 'before' | 'open' | 'closed')}
                          disabled={updatingStatus}
                          className="block w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="before">受付前</option>
                          <option value="open">受付中</option>
                          <option value="closed">受付終了</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.competition.entry_status)}`}>
                          {getStatusLabel(data.competition.entry_status)}
                        </span>
                      )}
                    </div>
                    
                    <div className="ml-4">
                      <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(data.competition.entry_status)}`}>
                        {getStatusLabel(data.competition.entry_status)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 種目別エントリー一覧 */}
                <div className="space-y-6">
                  {Object.keys(data.entriesByStyle).length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>まだエントリーがありません</p>
                      {data.competition.entry_status === 'open' && (
                        <p className="mt-2 text-sm">メンバーがエントリーを提出すると、ここに表示されます</p>
                      )}
                    </div>
                  )}

                  {Object.entries(data.entriesByStyle).map(([styleId, styleData]: [string, any]) => (
                    <div key={styleId} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* 種目ヘッダー */}
                      <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                        <h4 className="font-semibold text-blue-900">
                          {styleData.style.name_jp} ({styleData.entries.length}件)
                        </h4>
                      </div>

                      {/* エントリー一覧 */}
                      <div className="divide-y divide-gray-200">
                        {styleData.entries.map((entry: any, index: number) => (
                          <div key={entry.id} className="px-4 py-3 hover:bg-gray-50">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">
                                  {index + 1}. {entry.user.name}
                                </p>
                                {entry.entry_time && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    エントリータイム: <span className="font-mono font-semibold">{formatTime(entry.entry_time)}</span>
                                  </p>
                                )}
                                {entry.note && (
                                  <p className="text-sm text-gray-500 mt-1">{entry.note}</p>
                                )}
                              </div>
                              <div className="text-right text-xs text-gray-400">
                                {new Date(entry.created_at).toLocaleDateString('ja-JP', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

