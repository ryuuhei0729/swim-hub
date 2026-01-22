import { useState, useMemo, useCallback } from 'react'
import type { BestTime } from '../../shared/hooks/useMemberBestTimes'
import type { TeamMember } from './useMembers'

/**
 * メンバーリストのソート機能を提供するカスタムフック
 */
export const useMemberSort = (
  members: TeamMember[],
  getBestTimeForMember: (memberId: string, style: string, distance: number) => BestTime | null
) => {
  const [sortStyle, setSortStyle] = useState<string | null>(null)
  const [sortDistance, setSortDistance] = useState<number | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleSort = useCallback((style: string, distance: number) => {
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
  }, [sortStyle, sortDistance])

  const sortedMembers = useMemo(() => {
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

  return {
    sortStyle,
    sortDistance,
    sortOrder,
    sortedMembers,
    handleSort
  }
}
