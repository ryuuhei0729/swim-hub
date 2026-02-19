'use client'

import React from 'react'
import Avatar from '@/components/ui/Avatar'
import { StarIcon, CalendarIcon } from '@heroicons/react/24/outline'
import { formatTimeBest, formatDate } from '@/utils/formatters'
import { differenceInDays, parseISO } from 'date-fns'
import type { BestTime } from '../../shared/hooks/useMemberBestTimes'
import type { TeamMember } from '../hooks/useMembers'

interface MembersTimeTableProps {
  members: TeamMember[]
  currentUserId: string
  includeRelaying: boolean
  sortStyle: string | null
  sortDistance: number | null
  sortOrder: 'asc' | 'desc'
  isLoading: boolean
  onSort: (style: string, distance: number) => void
  onMemberClick: (member: TeamMember) => void
  getBestTimeForMember: (memberId: string, style: string, distance: number) => BestTime | null
}

// 静的距離リスト
const DISTANCES = [50, 100, 200, 400, 800]

// 静的種目リスト
const STYLES = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー']

// 種目ヘッダーの背景色
const styleHeaderBgClass: Record<string, string> = {
  '自由形': 'bg-yellow-100',
  '平泳ぎ': 'bg-green-100',
  '背泳ぎ': 'bg-red-100',
  'バタフライ': 'bg-blue-100',
  '個人メドレー': 'bg-pink-100'
}

// セルの背景色
const styleCellBgClass: Record<string, string> = {
  '自由形': 'bg-yellow-50',
  '平泳ぎ': 'bg-green-50',
  '背泳ぎ': 'bg-red-50',
  'バタフライ': 'bg-blue-50',
  '個人メドレー': 'bg-pink-50'
}

/**
 * ありえない種目/距離の組み合わせかチェック
 */
const isInvalidCombination = (style: string, distance: number): boolean => {
  if (style === '個人メドレー' && (distance === 50 || distance === 800)) return true
  if ((style === '平泳ぎ' || style === '背泳ぎ' || style === 'バタフライ') && (distance === 400 || distance === 800)) return true
  return false
}

/**
 * 各種目の有効な距離リストを取得
 */
const getDistancesForStyle = (style: string): number[] => {
  return DISTANCES.filter(distance => !isInvalidCombination(style, distance))
}

/**
 * タイム表示用のヘルパー関数
 */
const getTimeDisplay = (bestTime: BestTime, _includeRelaying: boolean) => {
  const timeStr = formatTimeBest(bestTime.time)
  const suffixes: string[] = []

  // 長水路ならLを追加
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

/**
 * メンバーのベストタイム一覧テーブル
 */
export const MembersTimeTable: React.FC<MembersTimeTableProps> = ({
  members,
  currentUserId,
  includeRelaying,
  sortStyle,
  sortDistance,
  sortOrder,
  isLoading,
  onSort,
  onMemberClick,
  getBestTimeForMember
}) => {
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="bg-gray-200 rounded-lg h-64"></div>
      </div>
    )
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-8" data-testid="team-member-empty-state">
        <Avatar
          avatarUrl={null}
          userName="?"
          size="lg"
          className="mx-auto mb-4 opacity-50"
        />
        <p className="text-gray-600">メンバーがいません</p>
      </div>
    )
  }

  return (
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
                    className={`p-0 border-r border-gray-300 last:border-r-0 ${styleHeaderBgClass[style]}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(style, distance)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSort(style, distance)
                        }
                      }}
                      className={`w-full px-2 py-2 text-center text-xs font-semibold text-gray-700 cursor-pointer hover:bg-opacity-80 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${isSorted ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
                      title="クリックでソート"
                      aria-label={`${style} ${distance}m でソート${isSorted ? (sortOrder === 'asc' ? '（昇順）' : '（降順）') : ''}`}
                    >
                      <div className="flex items-center justify-center space-x-1">
                        <span>{distance}m</span>
                        {isSorted && (
                          <span className="text-blue-600">
                            {sortOrder === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>
                    </button>
                  </th>
                )
              })
            })}
          </tr>
        </thead>
        <tbody className="bg-white">
          {members.map((member, memberIdx) => {
            return (
              <tr
                key={member.id}
                onClick={() => onMemberClick(member)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onMemberClick(member)
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${member.users?.name || 'Unknown User'} の詳細を表示`}
                className={`cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
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
                    // 一括登録（competition なし）は New 表示対象外
                    const isNew = bestTime?.competition && createdAt ? differenceInDays(new Date(), createdAt) <= 30 : false
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
                                const display = getTimeDisplay(bestTime, includeRelaying)
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
  )
}
