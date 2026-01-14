'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { BaseModal, Avatar, Tabs } from '@/components/ui'
import { 
  StarIcon,
  TrashIcon,
  TrophyIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'
import { differenceInDays, parseISO } from 'date-fns'
import { formatTime, formatDate } from '@/utils/formatters'

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
  pool_type: number // 0: 短水路, 1: 長水路
  is_relaying: boolean
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
  // 引き継ぎありのタイム（オプショナル）
  relayingTime?: {
    id: string
    time: number
    created_at: string
    competition?: {
      title: string
      date: string
    }
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
  const [_availableStyles, setAvailableStyles] = useState<Array<{ id: number; name_jp: string; distance: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [showRoleChangeConfirm, setShowRoleChangeConfirm] = useState<'admin' | 'user' | null>(null)
  const [isChangingRole, setIsChangingRole] = useState(false)
  
  const { supabase } = useAuth()

  useEffect(() => {
    if (isOpen && member) {
      loadAvailableStyles()
      loadBestTimes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          pool_type,
          is_relaying,
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

      // 引き継ぎなしのベストタイム（種目、プール種別ごと）
      const bestTimesByStyleAndPool = new Map<string, BestTime>()
      // 引き継ぎありのベストタイム（種目、プール種別ごと）
      const relayingBestTimesByStyleAndPool = new Map<string, {
        id: string
        time: number
        created_at: string
        competition?: {
          title: string
          date: string
        }
      }>()

      if (data && Array.isArray(data)) {
        data.forEach((record: {
          id: string
          time: number
          created_at: string
          pool_type: number
          is_relaying: boolean
          styles?: { name_jp: string; distance: number } | null | { name_jp: string; distance: number }[]
          competitions?: { title: string; date: string } | null | { title: string; date: string }[]
        }) => {
          const style = Array.isArray(record.styles) ? record.styles[0] : record.styles
          const competition = Array.isArray(record.competitions) ? record.competitions[0] : record.competitions
          const styleKey = style?.name_jp || 'Unknown'
          const poolType = record.pool_type ?? 0
          const key = `${styleKey}_${poolType}`

          if (record.is_relaying) {
            // 引き継ぎありのタイム
            if (!relayingBestTimesByStyleAndPool.has(key) || 
                record.time < relayingBestTimesByStyleAndPool.get(key)!.time) {
              relayingBestTimesByStyleAndPool.set(key, {
                id: record.id,
                time: record.time,
                created_at: record.created_at,
                competition: competition ? {
                  title: competition.title,
                  date: competition.date
                } : undefined
              })
            }
          } else {
            // 引き継ぎなしのタイム
            if (!bestTimesByStyleAndPool.has(key) || 
                record.time < bestTimesByStyleAndPool.get(key)!.time) {
              bestTimesByStyleAndPool.set(key, {
                id: record.id,
                time: record.time,
                created_at: record.created_at,
                pool_type: poolType,
                is_relaying: false,
                style: {
                  name_jp: style?.name_jp || 'Unknown',
                  distance: style?.distance || 0
                },
                competition: competition ? {
                  title: competition.title,
                  date: competition.date
                } : undefined
              })
            }
          }
        })
      }

      // 引き継ぎなしのタイムに、引き継ぎありのタイムを紐付ける
      const result: BestTime[] = []
      bestTimesByStyleAndPool.forEach((bestTime, key) => {
        const relayingTime = relayingBestTimesByStyleAndPool.get(key)
        result.push({
          ...bestTime,
          relayingTime: relayingTime
        })
      })

      // 引き継ぎありのみのタイム（引き継ぎなしがない場合）も追加
      relayingBestTimesByStyleAndPool.forEach((relayingTime, key) => {
        if (!bestTimesByStyleAndPool.has(key)) {
          const [styleName, poolTypeStr] = key.split('_')
          const poolType = parseInt(poolTypeStr, 10)

          const record = data?.find((r: {
            id: string
            pool_type: number
            is_relaying: boolean
            styles?: { name_jp: string; distance: number } | null | { name_jp: string; distance: number }[]
          }) => {
            const style = Array.isArray(r.styles) ? r.styles[0] : r.styles
            return (style?.name_jp || 'Unknown') === styleName &&
              (r.pool_type ?? 0) === poolType &&
              r.is_relaying &&
              r.id === relayingTime.id
          })

          if (record) {
            const style = Array.isArray(record.styles) ? record.styles[0] : record.styles
            result.push({
              id: relayingTime.id,
              time: relayingTime.time,
              created_at: relayingTime.created_at,
              pool_type: poolType,
              is_relaying: true,
              style: {
                name_jp: styleName,
                distance: style?.distance || 0
              },
              competition: relayingTime.competition
            })
          }
        }
      })

      setBestTimes(result)
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

  const handleRoleChangeClick = (newRole: 'admin' | 'user') => {
    if (!member) return
    
    // 既に同じ権限の場合は何もしない
    if (member.role === newRole) {
      return
    }
    
    // 確認モーダルを表示
    setShowRoleChangeConfirm(newRole)
  }

  const handleRoleChangeConfirm = async () => {
    if (!member || !showRoleChangeConfirm) return

    try {
      setError(null)
      setIsChangingRole(true)

      const { error } = await (supabase
        .from('team_memberships'))
        .update({ role: showRoleChangeConfirm })
        .eq('id', member.id)

      if (error) throw error

      // ローカル状態を更新
      member.role = showRoleChangeConfirm
      onMembershipChange?.()
      
      // 確認モーダルを閉じる
      setShowRoleChangeConfirm(null)
    } catch (err) {
      console.error('権限変更エラー:', err)
      setError('権限の変更に失敗しました')
    } finally {
      setIsChangingRole(false)
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
        .from('team_memberships'))
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


  // ベストタイム表コンポーネント
  const BestTimesTable = ({ bestTimes }: { bestTimes: BestTime[] }) => {
    type TabType = 'all' | 'short' | 'long'
    const [activeTab, setActiveTab] = useState<TabType>('all')
    const [includeRelaying, setIncludeRelaying] = useState<boolean>(false)

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

    // タブごとにフィルタリングされたベストタイムを取得
    const filteredBestTimes = useMemo(() => {
      if (activeTab === 'short') {
        return bestTimes.filter(bt => bt.pool_type === 0)
      } else if (activeTab === 'long') {
        return bestTimes.filter(bt => bt.pool_type === 1)
      } else {
        return bestTimes
      }
    }, [bestTimes, activeTab])

    const getBestTime = (style: string, distance: number): BestTime | null => {
      const dbStyleName = `${distance}m${style}`
      
      if (activeTab === 'all') {
        const candidates: BestTime[] = []
        
        // 短水路のタイムを取得
        const shortCourseTimes = bestTimes.filter(bt => 
          bt.style.name_jp === dbStyleName && 
          bt.pool_type === 0
        )
        
        shortCourseTimes.forEach(bt => {
          if (!bt.is_relaying) {
            candidates.push(bt)
            if (includeRelaying && bt.relayingTime) {
              candidates.push({
                ...bt,
                id: bt.relayingTime.id,
                time: bt.relayingTime.time,
                created_at: bt.relayingTime.created_at,
                is_relaying: true,
                competition: bt.relayingTime.competition
              })
            }
          } else {
            if (includeRelaying) {
              candidates.push(bt)
            }
          }
        })
        
        // 長水路のタイムを取得
        const longCourseTimes = bestTimes.filter(bt => 
          bt.style.name_jp === dbStyleName && 
          bt.pool_type === 1
        )
        
        longCourseTimes.forEach(bt => {
          if (!bt.is_relaying) {
            candidates.push(bt)
            if (includeRelaying && bt.relayingTime) {
              candidates.push({
                ...bt,
                id: bt.relayingTime.id,
                time: bt.relayingTime.time,
                created_at: bt.relayingTime.created_at,
                is_relaying: true,
                competition: bt.relayingTime.competition
              })
            }
          } else {
            if (includeRelaying) {
              candidates.push(bt)
            }
          }
        })
        
        if (candidates.length === 0) return null
        return candidates.reduce((best, current) => 
          current.time < best.time ? current : best
        )
      } else {
        const candidates: BestTime[] = []
        const matchingTimes = filteredBestTimes.filter(bt => bt.style.name_jp === dbStyleName)
        
        matchingTimes.forEach(bt => {
          if (!bt.is_relaying) {
            candidates.push(bt)
            if (includeRelaying && bt.relayingTime) {
              candidates.push({
                ...bt,
                id: bt.relayingTime.id,
                time: bt.relayingTime.time,
                created_at: bt.relayingTime.created_at,
                is_relaying: true,
                competition: bt.relayingTime.competition
              })
            }
          } else {
            if (includeRelaying) {
              candidates.push(bt)
            }
          }
        })
        
        if (candidates.length === 0) return null
        return candidates.reduce((best, current) => 
          current.time < best.time ? current : best
        )
      }
    }

    // タイム表示用のヘルパー関数
    const getTimeDisplay = (bestTime: BestTime) => {
      const timeStr = formatTime(bestTime.time)
      const suffixes: string[] = []
      
      if (activeTab === 'all' && bestTime.pool_type === 1) {
        suffixes.push('L')
      }
      
      if (bestTime.is_relaying) {
        suffixes.push('R')
      }
      
      return {
        main: timeStr,
        suffix: suffixes.join('')
      }
    }

    const tabs = [
      { id: 'all', label: 'ALL' },
      { id: 'short', label: '短水路' },
      { id: 'long', label: '長水路' }
    ]

    if (bestTimes.length === 0) {
      return (
        <div className="text-center py-6">
          <TrophyIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600">記録がありません</p>
          <p className="text-xs text-gray-500 mt-1">
            このメンバーはまだ記録を登録していません
          </p>
        </div>
      )
    }

    return (
      <div>
        {/* タブとチェックボックス */}
        <div className="mb-3 flex items-center justify-between">
          <Tabs
            tabs={tabs}
            activeTabId={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as TabType)}
          />
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeRelaying}
              onChange={(e) => setIncludeRelaying(e.target.checked)}
              className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-xs text-gray-700">引き継ぎタイムも含めて表示</span>
          </label>
        </div>

        <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-300">
          <table className="min-w-full table-fixed border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[48px] w-[56px] h-[36px] tracking-wide">
                  距離
                </th>
                {STYLES.map((style) => (
                  <th
                    key={style}
                    className={`px-2 py-1.5 text-center text-xs font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 min-w-[90px] h-[36px] ${styleHeaderBgClass[style]}`}
                  >
                    {style}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white">
              {DISTANCES.map((distance, rowIdx) => (
                <tr key={distance}>
                  <td className={`px-2 py-2 text-xs font-semibold text-gray-600 border-r border-gray-300 bg-gray-50 min-w-[48px] w-[56px] h-[48px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''}`}>
                    {distance}m
                  </td>
                  {STYLES.map((style) => {
                    const bestTime = getBestTime(style, distance)
                    const createdAt = bestTime ? parseISO(bestTime.created_at) : null
                    const isNew = createdAt ? differenceInDays(new Date(), createdAt) <= 30 : false
                    return (
                      <td
                        key={style}
                        className={`px-2 py-2 text-center text-xs text-gray-900 border-r border-gray-300 last:border-r-0 min-w-[90px] h-[48px] ${rowIdx > 0 ? 'border-t border-gray-300' : ''} ${isInvalidCombination(style, distance) ? 'bg-gray-200' : styleCellBgClass[style]}`}
                      >
                        {bestTime ? (
                          <div className={`group relative inline-block pt-1 ${isNew ? 'pr-5' : ''}`}>
                            {isNew && (
                              <span className="absolute -top-0.5 -right-2.5 text-[9px] bg-red-500 text-white px-1 py-0.5 rounded-full shadow">New</span>
                            )}
                            <span className={`font-semibold text-sm ${isNew ? 'text-red-600' : 'text-gray-900'}`}>
                              {(() => {
                                const display = getTimeDisplay(bestTime)
                                return (
                                  <>
                                    {display.main}
                                    {display.suffix && (
                                      <span className="text-[10px] ml-0.5">{display.suffix}</span>
                                    )}
                                  </>
                                )
                              })()}
                            </span>
                            
                            {/* ホバー時の詳細情報 */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-gray-900 text-white text-[10px] rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                              <div className="flex items-center space-x-1 mb-1">
                                <CalendarIcon className="h-2.5 w-2.5" />
                                <span>{formatDate(bestTime.created_at)}</span>
                              </div>
                              {bestTime.competition && (
                                <div className="text-blue-300">
                                  {bestTime.competition.title}
                                </div>
                              )}
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
        
        {/* 注釈 */}
        <div className="mt-2 text-xs text-gray-400 flex items-center justify-end space-x-3">
          <span>※ L: 長水路</span>
          <span>R: 引き継ぎあり</span>
        </div>
      </div>
    )
  }

  if (!member) return null

  return (
    <>
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="w-full max-w-4xl mx-auto p-6" data-testid="team-member-detail-modal">
        {/* エラー表示 */}
        {error && (
          <div className="mb-8 rounded-md bg-red-50 p-4" data-testid="team-member-detail-error">
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
            <div className="shrink-0">
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
                <div className="flex items-center bg-gray-100 rounded-lg p-1" data-testid="team-member-role-toggle">
                <button
                  onClick={() => handleRoleChangeClick('user')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    member.role === 'user'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                    data-testid="team-member-role-user-button"
                >
                  ユーザー
                </button>
                <button
                  onClick={() => handleRoleChangeClick('admin')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    member.role === 'admin'
                      ? 'bg-yellow-100 text-yellow-800 shadow-sm'
                      : 'text-gray-600 hover:text-yellow-700'
                  }`}
                    data-testid="team-member-role-admin-button"
                >
                  管理者
                </button>
              </div>
              
              {/* 削除ボタン */}
              <button
                onClick={handleRemoveMember}
                disabled={isRemoving}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  data-testid="team-member-remove-button"
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
              data-testid="team-member-detail-close-button"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </BaseModal>

    {/* ロール変更確認モーダル */}
    {showRoleChangeConfirm && (
      <div className="fixed inset-0 z-90 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={() => setShowRoleChangeConfirm(null)} />
          
          <div className="relative bg-white rounded-lg shadow-2xl border-2 border-yellow-300 w-full max-w-lg" data-testid="role-change-confirm-modal">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mx-auto shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 sm:mx-0 sm:h-10 sm:w-10">
                  <StarIcon className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    ロールを変更
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500">
                      {member?.users?.name || 'このメンバー'}さんを{showRoleChangeConfirm === 'admin' ? '管理者' : 'ユーザー'}に変更しますか？
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleRoleChangeConfirm}
                disabled={isChangingRole}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-yellow-600 text-base font-medium text-white hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                data-testid="confirm-role-change-button"
              >
                {isChangingRole ? '変更中...' : '変更'}
              </button>
              <button
                type="button"
                onClick={() => setShowRoleChangeConfirm(null)}
                disabled={isChangingRole}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                data-testid="cancel-role-change-button"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
  )
}
