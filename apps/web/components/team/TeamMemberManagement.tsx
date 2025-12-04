'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { Avatar } from '@/components/ui'
import { 
  StarIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'
import { formatTime, formatDate } from '@/utils/formatters'
import { differenceInDays, parseISO } from 'date-fns'

export interface TeamMember {
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


export interface TeamMemberManagementProps {
  teamId: string
  currentUserId: string
  isCurrentUserAdmin: boolean
  onMembershipChange?: () => void
  onMemberClick: (member: TeamMember) => void
}

export default function TeamMemberManagement({ 
  teamId, 
  currentUserId, 
  isCurrentUserAdmin: _isCurrentUserAdmin,
  onMembershipChange: _onMembershipChange,
  onMemberClick
}: TeamMemberManagementProps) {
  const { supabase } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [memberBestTimes, setMemberBestTimes] = useState<Map<string, BestTime[]>>(new Map())
  const [loadingBestTimes, setLoadingBestTimes] = useState(false)
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false)
  const [sortStyle, setSortStyle] = useState<string | null>(null)
  const [sortDistance, setSortDistance] = useState<number | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const loadMembers = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { data, error } = await supabase
        .from('team_memberships')
        .select(`
          id,
          user_id,
          role,
          is_active,
          joined_at,
          users!team_memberships_user_id_fkey (
            id,
            name,
            birthday,
            bio,
            profile_image_path
          )
        `)
        .eq('team_id', teamId)
        .eq('is_active', true)
        .order('role', { ascending: false }) // adminを先に表示

      if (error) throw error
      setMembers((data ?? []) as unknown as TeamMember[])
    } catch (err) {
      console.error('メンバー情報の取得に失敗:', err)
      setError('メンバー情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // メンバーのベストタイムを取得する関数
  const loadBestTimesForMember = async (userId: string): Promise<BestTime[]> => {
    try {
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
        .eq('user_id', userId)
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

      return result
    } catch (err) {
      console.error(`メンバー ${userId} のベストタイム取得エラー:`, err)
      return []
    }
  }

  // 全メンバーのベストタイムを並列取得
  const loadAllBestTimes = async (membersList: TeamMember[]) => {
    try {
      setLoadingBestTimes(true)
      const bestTimesMap = new Map<string, BestTime[]>()
      
      // 並列で全メンバーのベストタイムを取得
      const promises = membersList.map(async (member) => {
        const bestTimes = await loadBestTimesForMember(member.user_id)
        return { memberId: member.id, userId: member.user_id, bestTimes }
      })
      
      const results = await Promise.all(promises)
      results.forEach(({ memberId, bestTimes }) => {
        bestTimesMap.set(memberId, bestTimes)
      })
      
      setMemberBestTimes(bestTimesMap)
    } catch (err) {
      console.error('ベストタイム取得エラー:', err)
    } finally {
      setLoadingBestTimes(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [teamId])

  // メンバーが読み込まれたらベストタイムを取得
  useEffect(() => {
    if (members.length > 0) {
      loadAllBestTimes(members)
    }
  }, [members])

  // 静的距離リスト（50m, 100m, 200m, 400m, 800m）
  const DISTANCES = [50, 100, 200, 400, 800]
  
  // 静的種目リスト
  const STYLES = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー']

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

  // メンバーのベストタイムを取得（ALLタブロジック）
  const getBestTimeForMember = useCallback((memberId: string, style: string, distance: number): BestTime | null => {
    const bestTimes = memberBestTimes.get(memberId) || []
    const dbStyleName = `${distance}m${style}`
    
    // ALLタブ: 短水路と長水路の速い方を選択
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
    
    // 最速のタイムを選択
    return candidates.reduce((best, current) => 
      current.time < best.time ? current : best
    )
  }, [memberBestTimes, includeRelaying])

  // タイム表示用のヘルパー関数
  const getTimeDisplay = (bestTime: BestTime) => {
    const timeStr = formatTime(bestTime.time)
    const suffixes: string[] = []
    
    // ALLタブの場合、長水路ならLを追加
    if (bestTime.pool_type === 1) {
      suffixes.push('L')
    }
    
    // 引き継ぎありのタイムの場合、Rを追加
    if (bestTime.is_relaying) {
      suffixes.push('R')
    }
    
    return {
      main: timeStr,
      suffix: suffixes.join('')
    }
  }

  // 各種目の距離リストを取得
  const getDistancesForStyle = (style: string): number[] => {
    return DISTANCES.filter(distance => !isInvalidCombination(style, distance))
  }

  // ソート処理
  const handleSort = (style: string, distance: number) => {
    if (sortStyle === style && sortDistance === distance) {
      // 同じセルをクリックした場合はソートを解除
      setSortStyle(null)
      setSortDistance(null)
      setSortOrder('asc')
    } else {
      // 新しいセルをクリックした場合は昇順でソート
      setSortStyle(style)
      setSortDistance(distance)
      setSortOrder('asc')
    }
  }

  // ソートされたメンバーリストを取得
  const getSortedMembers = useMemo(() => {
    if (!sortStyle || sortDistance === null) {
      return members
    }

    return [...members].sort((a, b) => {
      const timeA = getBestTimeForMember(a.id, sortStyle, sortDistance)
      const timeB = getBestTimeForMember(b.id, sortStyle, sortDistance)

      // タイムがない場合は最後に配置
      if (!timeA && !timeB) return 0
      if (!timeA) return 1
      if (!timeB) return -1

      // タイムで比較
      const comparison = timeA.time - timeB.time
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [members, sortStyle, sortDistance, sortOrder, getBestTimeForMember])

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6" data-testid="team-member-management">
      {/* ヘッダー */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          メンバー管理
        </h2>
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span data-testid="team-member-count-total">総メンバー: <span className="font-medium text-gray-900">{members.length}人</span></span>
          <span data-testid="team-member-count-admin">管理者: <span className="font-medium text-yellow-600">{members.filter(m => m.role === 'admin').length}人</span></span>
          <span data-testid="team-member-count-user">ユーザー: <span className="font-medium text-gray-700">{members.filter(m => m.role === 'user').length}人</span></span>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4" data-testid="team-member-management-error">
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

      {/* 引き継ぎタイムも含めて表示チェックボックス */}
      <div className="mb-4 flex items-center justify-end">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeRelaying}
            onChange={(e) => setIncludeRelaying(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">引き継ぎタイムも含めて表示</span>
        </label>
      </div>

      {/* ベストタイム表 */}
      {loadingBestTimes ? (
        <div className="animate-pulse">
          <div className="bg-gray-200 rounded-lg h-64"></div>
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-8" data-testid="team-member-empty-state">
          <Avatar
            avatarUrl={null}
            userName="?"
            size="lg"
            className="mx-auto mb-4 opacity-50"
          />
          <p className="text-gray-600">メンバーがいません</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-300">
          <table className="min-w-full table-fixed border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              {/* 1行目：種目名 */}
              <tr>
                <th rowSpan={2} className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r border-gray-300 min-w-[120px] w-[120px] bg-gray-50">
                  メンバー
                </th>
                {STYLES.map((style) => {
                  const distances = getDistancesForStyle(style)
                  return (
                    <th
                      key={style}
                      colSpan={distances.length}
                      className={`px-2 py-2 text-center text-xs font-semibold text-gray-800 border-r border-gray-300 last:border-r-0 ${styleHeaderBgClass[style]}`}
                    >
                      {style}
                    </th>
                  )
                })}
              </tr>
              {/* 2行目：距離 */}
              <tr>
                {STYLES.map((style) => {
                  const distances = getDistancesForStyle(style)
                  return distances.map((distance) => {
                    const isSorted = sortStyle === style && sortDistance === distance
                    return (
                      <th
                        key={`${style}-${distance}`}
                        onClick={() => handleSort(style, distance)}
                        className={`px-2 py-2 text-center text-xs font-semibold text-gray-700 border-r border-gray-300 last:border-r-0 cursor-pointer hover:bg-opacity-80 transition-colors ${styleHeaderBgClass[style]} ${isSorted ? 'ring-2 ring-blue-500' : ''}`}
                        title="クリックでソート"
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span>{distance}m</span>
                          {isSorted && (
                            <span className="text-blue-600">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                    )
                  })
                })}
              </tr>
            </thead>
            <tbody className="bg-white">
              {getSortedMembers.map((member, memberIdx) => {
                return (
                  <tr 
                    key={member.id}
                    onClick={() => onMemberClick(member)}
                    className={`cursor-pointer transition-colors ${
                      member.user_id === currentUserId 
                        ? 'bg-blue-50 hover:bg-blue-100' 
                        : 'hover:bg-gray-50'
                    } ${memberIdx > 0 ? 'border-t border-gray-300' : ''}`}
                    data-testid={`team-member-row-${member.id}`}
                  >
                    {/* メンバー名セル */}
                    <td className={`px-3 py-3 border-r border-gray-300 bg-gray-50 min-w-[120px] w-[120px] ${memberIdx > 0 ? 'border-t border-gray-300' : ''}`}>
                      <div className="flex items-center space-x-2">
                        <Avatar
                          avatarUrl={member.users?.profile_image_path || null}
                          userName={member.users?.name || 'Unknown User'}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1">
                            <p className="text-xs font-medium text-gray-900 truncate">
                              {member.users?.name || 'Unknown User'}
                            </p>
                            {member.role === 'admin' && (
                              <StarIcon className="h-3 w-3 text-yellow-500 shrink-0" />
                            )}
                          </div>
                          {member.user_id === currentUserId && (
                            <span className="text-[10px] text-blue-600">あなた</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* 各種目×距離のセル */}
                    {STYLES.map((style) => {
                      const distances = getDistancesForStyle(style)
                      return distances.map((distance) => {
                        const bestTime = getBestTimeForMember(member.id, style, distance)
                        const createdAt = bestTime ? parseISO(bestTime.created_at) : null
                        const isNew = createdAt ? differenceInDays(new Date(), createdAt) <= 30 : false
                        return (
                          <td
                            key={`${member.id}-${style}-${distance}`}
                            className={`px-2 py-2 text-center text-xs border-r border-gray-300 last:border-r-0 min-w-[80px] ${memberIdx > 0 ? 'border-t border-gray-300' : ''} ${isInvalidCombination(style, distance) ? 'bg-gray-200' : styleCellBgClass[style]}`}
                          >
                            {bestTime ? (
                              <div className={`group relative inline-block pt-1 ${isNew ? 'pr-5' : ''}`}>
                                {isNew && (
                                  <span className="absolute -top-0.5 -right-2.5 text-[9px] bg-red-500 text-white px-1 py-0.5 rounded-full shadow">New</span>
                                )}
                                <span className={`font-semibold text-xs ${isNew ? 'text-red-600' : 'text-gray-900'}`}>
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
                      })
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 注釈 */}
      {members.length > 0 && (
        <div className="mt-3 text-xs text-gray-400 flex items-center justify-end space-x-3">
          <span>※ L: 長水路</span>
          <span>R: 引き継ぎあり</span>
        </div>
      )}
    </div>
  )
}
