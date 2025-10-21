'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { BaseModal } from '@/components/ui'
import { 
  UserIcon,
  StarIcon,
  TrashIcon,
  XMarkIcon,
  TrophyIcon,
  ClockIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'

export interface MemberDetail {
  id: string
  user_id: string
  role: 'admin' | 'user'
  is_active: boolean
  joined_at: string
  users: {
    id: string
    name: string
    birthday?: string
    bio?: string
  }
}

export interface BestTime {
  id: string
  time: number
  created_at: string
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
}

export interface MemberDetailModalProps {
  isOpen: boolean
  onClose: () => void
  member: MemberDetail | null
  currentUserId: string
  isCurrentUserAdmin: boolean
  onMembershipChange?: () => void
}

export default function MemberDetailModal({
  isOpen,
  onClose,
  member,
  currentUserId,
  isCurrentUserAdmin,
  onMembershipChange
}: MemberDetailModalProps) {
  const [bestTimes, setBestTimes] = useState<BestTime[]>([])
  const [availableStyles, setAvailableStyles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  
  const { supabase } = useAuth()

  useEffect(() => {
    if (isOpen && member) {
      loadAvailableStyles()
      loadBestTimes()
    }
  }, [isOpen, member])

  const loadAvailableStyles = async () => {
    try {
      const { data, error } = await supabase
        .from('styles')
        .select('id, name_jp, distance')
        .order('id')

      if (error) throw error
      setAvailableStyles(data || [])
    } catch (err) {
      console.error('種目情報の取得に失敗:', err)
    }
  }

  const loadBestTimes = async () => {
    if (!member) return

    try {
      setLoading(true)
      setError(null)
      
      const { data, error } = await supabase
        .from('records')
        .select(`
          id,
          time,
          created_at,
          styles!records_style_id_fkey (
            name_jp,
            distance
          ),
          competitions!records_competition_id_fkey (
            title,
            date
          )
        `)
        .eq('user_id', member.user_id)
        .order('time', { ascending: true })

      if (error) throw error

      // 種目ごとのベストタイムを取得
      const bestTimesByStyle = new Map<string, BestTime>()
      
      data?.forEach((record: any) => {
        const styleKey = record.styles?.name_jp || 'Unknown'
        
        if (!bestTimesByStyle.has(styleKey) || record.time < bestTimesByStyle.get(styleKey)!.time) {
          bestTimesByStyle.set(styleKey, {
            id: record.id,
            time: record.time,
            created_at: record.created_at,
            style: {
              name_jp: record.styles?.name_jp || 'Unknown',
              distance: record.styles?.distance || 0
            },
            competition: record.competitions ? {
              title: record.competitions.title,
              date: record.competitions.date
            } : undefined
          })
        }
      })

      setBestTimes(Array.from(bestTimesByStyle.values()))
    } catch (err) {
      console.error('ベストタイム取得エラー:', err)
      setError('ベストタイムの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // 表形式のデータを生成（データベースから取得した種目を使用）
  const generateBestTimesTable = () => {
    // ID順で種目を取得（種目名から距離を除去して基本種目名を取得）
    const baseStyles = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー']
    
    const distances = [...new Set(availableStyles.map((s: any) => s.distance))].sort((a, b) => a - b)
    
    return { styles: baseStyles, distances }
  }

  const handleRoleChange = async (newRole: 'admin' | 'user') => {
    if (!member) return

    try {
      setError(null)
      
      // 既に同じ権限の場合は何もしない
      if (member.role === newRole) {
        return
      }

      const { error } = await (supabase
        .from('team_memberships') as any)
        .update({ role: newRole })
        .eq('id', member.id)

      if (error) throw error

      // ローカル状態を更新
      member.role = newRole
      onMembershipChange?.()
    } catch (err) {
      console.error('権限変更エラー:', err)
      setError('権限の変更に失敗しました')
    }
  }

  const handleRemoveMember = async () => {
    if (!member) return

    try {
      setError(null)
      setIsRemoving(true)
      
      // 自分自身を削除しようとしている場合は拒否
      if (member.user_id === currentUserId) {
        setError('自分自身をチームから削除することはできません')
        return
      }

      // 確認ダイアログ
      if (!confirm(`${member.users?.name}さんをチームから削除しますか？この操作は取り消せません。`)) {
        return
      }

      const { error } = await (supabase
        .from('team_memberships') as any)
        .update({ is_active: false })
        .eq('id', member.id)

      if (error) throw error

      onMembershipChange?.()
      onClose()
    } catch (err) {
      console.error('メンバー削除エラー:', err)
      setError('メンバーの削除に失敗しました')
    } finally {
      setIsRemoving(false)
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = (time % 60).toFixed(2)
    return `${minutes}:${seconds.padStart(5, '0')}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP')
  }

  // ベストタイム表コンポーネント
  const BestTimesTable = ({ bestTimes }: { bestTimes: BestTime[] }) => {
    const { styles, distances } = generateBestTimesTable()
    
    const getBestTime = (style: string, distance: number) => {
      // データベースの種目名形式（例：50m自由形）で検索
      const dbStyleName = `${distance}m${style}`
      return bestTimes.find(bt => bt.style.name_jp === dbStyleName)
    }

    // 記録がない場合でも表を表示する

    return (
      <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-sm font-semibold text-gray-900 border-r border-gray-200 min-w-[100px] h-[50px]">
                種目
              </th>
              {distances.map((distance) => (
                <th key={distance} className="px-3 py-2 text-center text-sm font-semibold text-gray-900 border-r border-gray-200 last:border-r-0 min-w-[120px] h-[50px]">
                  {distance}m
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {styles.map((style) => (
              <tr key={style} className="hover:bg-gray-50 transition-colors duration-150">
                <td className="px-3 py-2 text-sm font-medium text-gray-900 border-r border-gray-200 bg-gray-50 min-w-[100px] h-[80px]">
                  {style}
                </td>
                {distances.map((distance) => {
                  const bestTime = getBestTime(style, distance)
                  return (
                    <td key={distance} className="px-3 py-2 text-center text-sm text-gray-900 border-r border-gray-200 last:border-r-0 min-w-[120px] h-[80px]">
                      {bestTime ? (
                        <div className="flex flex-col items-center space-y-1">
                          <span className="font-bold text-base text-gray-900 bg-yellow-50 px-2 py-1 rounded">
                            {formatTime(bestTime.time)}
                          </span>
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <CalendarIcon className="h-3 w-3" />
                            <span>{formatDate(bestTime.created_at)}</span>
                          </div>
                          {bestTime.competition && (
                            <div className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                              {bestTime.competition.title}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-base">-</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (!member) return null

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="w-full max-w-4xl mx-auto p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-semibold text-gray-900">
            {member.users?.name || 'Unknown User'}の詳細情報
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-8 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  エラーが発生しました
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* プロフィール情報 */}
        <div className="mb-10">
          <div className="flex items-start space-x-8">
            {/* プロフィール画像 */}
            <div className="flex-shrink-0">
              <div className="h-24 w-24 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">
                    {member.users?.name?.charAt(0) || '?'}
                  </span>
              </div>
            </div>
            
            {/* 基本情報 */}
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-4">
                  <h3 className="text-2xl font-bold text-gray-900">
                    {member.users?.name || 'Unknown User'}
                  </h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  member.role === 'admin' 
                    ? 'bg-yellow-100 text-yellow-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {member.role === 'admin' ? '管理者' : 'ユーザー'}
                </span>
                {member.user_id === currentUserId && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    あなた
                  </span>
                )}
                {member.role === 'admin' && (
                  <StarIcon className="h-4 w-4 text-yellow-500" />
                )}
              </div>
              
              <div className="text-sm text-gray-600 mb-4">
                {member.users?.birthday && (
                  <p>生年月日: {new Date(member.users.birthday).toLocaleDateString('ja-JP')}</p>
                )}
              </div>
              
              {/* 自己紹介 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">自己紹介</h4>
                  <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
                    {member.users?.bio || `${member.users?.name || 'Unknown User'}の自己紹介文です。まだ自己紹介が設定されていません。`}
                  </p>
              </div>
            </div>
          </div>
        </div>

        {/* 区切り線 */}
        <div className="border-t border-gray-200 mb-8"></div>

        {/* 管理者機能 */}
        {isCurrentUserAdmin && member.user_id !== currentUserId && (
          <div className="mb-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">管理者機能</h3>
            <div className="flex items-center space-x-4">
              {/* 権限切り替え */}
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => handleRoleChange('user')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    member.role === 'user'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  ユーザー
                </button>
                <button
                  onClick={() => handleRoleChange('admin')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    member.role === 'admin'
                      ? 'bg-yellow-100 text-yellow-800 shadow-sm'
                      : 'text-gray-600 hover:text-yellow-700'
                  }`}
                >
                  管理者
                </button>
              </div>
              
              {/* 削除ボタン */}
              <button
                onClick={handleRemoveMember}
                disabled={isRemoving}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
                <span>{isRemoving ? '削除中...' : 'チームから削除'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ベストタイム */}
        <div>
            <div className="flex items-center space-x-2 mb-4">
              <TrophyIcon className="h-5 w-5 text-yellow-500" />
              <h3 className="text-lg font-medium text-gray-900">Best Time</h3>
            </div>

          {loading ? (
            <div className="animate-pulse">
              <div className="bg-gray-200 rounded-lg h-64"></div>
            </div>
          ) : bestTimes.length > 0 ? (
            <BestTimesTable bestTimes={bestTimes} />
          ) : (
            <div className="text-center py-8">
              <TrophyIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">記録がありません</p>
              <p className="text-sm text-gray-500 mt-1">
                このメンバーはまだ記録を登録していません
              </p>
            </div>
          )}

          {/* 閉じるボタン */}
          <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </BaseModal>
  )
}
