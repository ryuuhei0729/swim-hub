'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { BaseModal, Avatar } from '@/components/ui'
import { 
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
    profile_image_path?: string | null
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

  // 静的距離リスト（50m, 100m, 200m, 400m, 800m）
  const DISTANCES = [50, 100, 200, 400, 800]
  
  // 静的種目リスト
  const STYLES = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー']

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
    const seconds = time - minutes * 60
    if (minutes === 0) {
      return seconds.toFixed(2)
    }
    return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP')
  }

  // ベストタイム表コンポーネント
  const BestTimesTable = ({ bestTimes }: { bestTimes: BestTime[] }) => {
    const styleHeaderBgClass: Record<string, string> = {
      '自由形': 'bg-yellow-100',
      '平泳ぎ': 'bg-green-100',
      '背泳ぎ': 'bg-red-100',
      'バタフライ': 'bg-blue-100',
      '個人メドレー': 'bg-pink-100'
    }

    const styleCellBgClass: Record<string, string> = {
      '自由形': 'bg-yellow-50',
      '平泳ぎ': 'bg-green-50',
      '背泳ぎ': 'bg-red-50',
      'バタフライ': 'bg-blue-50',
      '個人メドレー': 'bg-pink-50'
    }

    const isInvalidCombination = (style: string, distance: number): boolean => {
      // ありえない種目/距離の組み合わせ
      if (style === '個人メドレー' && (distance === 50 || distance === 800)) return true
      if ((style === '平泳ぎ' || style === '背泳ぎ' || style === 'バタフライ') && (distance === 400 || distance === 800)) return true
      return false
    }
    const getBestTime = (style: string, distance: number) => {
      // データベースの種目名形式（例：50m自由形）で検索
      const dbStyleName = `${distance}m${style}`
      return bestTimes.find(bt => bt.style.name_jp === dbStyleName)
    }

    return (
      <div className="overflow-x-auto bg-white rounded-xl shadow border border-gray-300">
        <table className="min-w-full table-fixed border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left text-xs md:text-sm font-semibold text-gray-700 border-r border-gray-300 min-w-[64px] w-[72px] h-[44px] tracking-wide">
                距離
              </th>
              {STYLES.map((style) => (
                <th
                  key={style}
                  className={`px-3 py-2 text-center text-xs md:text-sm font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 min-w-[110px] h-[44px] ${styleHeaderBgClass[style]}`}
                >
                  {style}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {DISTANCES.map((distance, rowIdx) => (
              <tr key={distance}>
                <td className={`px-3 py-3 text-xs md:text-sm font-semibold text-gray-900 border-r border-gray-300 bg-gray-50 min-w-[64px] w-[72px] h-[64px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''}`}>
                  {distance}m
                </td>
                {STYLES.map((style) => {
                  const bestTime = getBestTime(style, distance)
                  return (
                    <td
                      key={style}
                      className={`px-3 py-3 text-center text-xs md:text-sm text-gray-900 border-r border-gray-300 last:border-r-0 min-w-[110px] h-[64px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''} ${isInvalidCombination(style, distance) ? 'bg-gray-200' : styleCellBgClass[style]}`}
                    >
                      {bestTime ? (
                        <div className="group relative inline-block pr-6 pt-2">
                          {(() => {
                            const createdAt = new Date(bestTime.created_at)
                            const now = new Date()
                            const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
                            const isNew = diffDays <= 30
                            return isNew ? (
                              <span className="absolute -top-1 -right-3 text-[10px] md:text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full shadow">New</span>
                            ) : null
                          })()}
                          {/* 通常表示：ベストタイムのみ */}
                          <span className={`font-semibold text-base md:text-lg ${(() => {
                            const createdAt = new Date(bestTime.created_at)
                            const now = new Date()
                            const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
                            return diffDays <= 30 ? 'text-red-600' : 'text-gray-900'
                          })()}`}>{formatTime(bestTime.time)}</span>
                          
                          {/* ホバー時の詳細情報 */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-[11px] md:text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                            <div className="flex items-center space-x-1 mb-1">
                              <CalendarIcon className="h-3 w-3" />
                              <span>{formatDate(bestTime.created_at)}</span>
                            </div>
                            {bestTime.competition && (
                              <div className="text-blue-300">
                                {bestTime.competition.title}
                              </div>
                            )}
                            {/* 矢印 */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-block text-gray-300">—</span>
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
              <Avatar
                avatarUrl={member.users?.profile_image_path || null}
                userName={member.users?.name || 'Unknown User'}
                size="xxl"
              />
            </div>
            
            {/* 基本情報 */}
            <div className="flex-1">
              <div className="flex items-center space-x-4 mb-5">
                  <h3 className="text-3xl font-bold text-gray-900">
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
