import { useState, useMemo, useCallback } from 'react'
import type { BestTime } from '../../shared/hooks/useMemberBestTimes'
import type { TeamMember } from './useMembers'
import type { MemberGroup } from './useMemberGroupSort'

/**
 * メンバーリストのソート機能を提供するカスタムフック
 *
 * groupFn が渡された場合、グループ内でソートを行い、グループヘッダー情報も返す
 */
export const useMemberSort = (
  members: TeamMember[],
  getBestTimeForMember: (memberId: string, style: string, distance: number) => BestTime | null,
  groupFn?: ((members: TeamMember[]) => MemberGroup[] | null) | null
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

  const { sortedMembers, groupHeaders } = useMemo(() => {
    const compareFn = (a: TeamMember, b: TeamMember): number => {
      if (!sortStyle || sortDistance === null) return 0
      const timeA = getBestTimeForMember(a.id, sortStyle, sortDistance)
      const timeB = getBestTimeForMember(b.id, sortStyle, sortDistance)
      if (!timeA && !timeB) return 0
      if (!timeA) return 1
      if (!timeB) return -1
      const comparison = timeA.time - timeB.time
      return sortOrder === 'asc' ? comparison : -comparison
    }

    // グルーピングが有効な場合
    const grouped = groupFn?.(members)
    if (grouped) {
      const flat: TeamMember[] = []
      const headers = new Map<number, string>()
      for (const g of grouped) {
        headers.set(flat.length, g.groupName)
        flat.push(...[...g.members].sort(compareFn))
      }
      return { sortedMembers: flat, groupHeaders: headers }
    }

    // グルーピングなし（従来の動作）
    return {
      sortedMembers: [...members].sort(compareFn),
      groupHeaders: new Map<number, string>(),
    }
  }, [members, sortStyle, sortDistance, sortOrder, getBestTimeForMember, groupFn])

  return {
    sortStyle,
    sortDistance,
    sortOrder,
    sortedMembers,
    groupHeaders,
    handleSort
  }
}
