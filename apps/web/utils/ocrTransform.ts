/**
 * AI OCR解析結果 → PracticeMenu[] 変換ロジック
 */

import type { TeamTimeEntry } from '@/components/team/TeamTimeInputModal'
import { formatTimeShort } from '@apps/shared/utils/time'

// Gemini APIからのレスポンス型
export interface GeminiScanResult {
  menu: {
    distance: number
    repCount: number
    setCount: number
    circle: number | null
    description: string
  }
  swimmers: Array<{
    no: number
    name: string
    style: string
    times: (number | null)[]
  }>
}

interface TeamMember {
  id: string
  user_id: string
  users: {
    id: string
    name: string
  }
}

interface PracticeMenu {
  id: string
  style: string
  swimCategory: 'Swim' | 'Pull' | 'Kick'
  distance: number | ''
  reps: number | ''
  sets: number | ''
  circleMin: number | ''
  circleSec: number | ''
  note: string
  tags: []
  times: TeamTimeEntry[]
  targetUserIds: string[]
}

/**
 * AI解析結果をPracticeMenuの配列に変換する
 *
 * @param scanResult - Gemini APIからの解析結果
 * @param memberAssignments - swimmer.no → user_id のマッピング
 * @param members - チームメンバー一覧 (member.id のルックアップに使用)
 * @param editedTimes - "swimmerNo-timeIndex" → 修正後のタイム値
 */
export function transformScanResultToMenus(
  scanResult: GeminiScanResult,
  memberAssignments: Record<number, string>,
  members: TeamMember[],
  editedTimes: Record<string, number | null>
): PracticeMenu[] {
  // editedTimes を適用した swimmers を作成
  const resolvedSwimmers = scanResult.swimmers.map((swimmer) => {
    const times = swimmer.times.map((time, index) => {
      const key = `${swimmer.no}-${index}`
      return key in editedTimes ? editedTimes[key] : time
    })
    return { ...swimmer, times }
  })

  // style でグルーピング
  const styleGroups = new Map<string, typeof resolvedSwimmers>()
  for (const swimmer of resolvedSwimmers) {
    const style = swimmer.style || 'Fr'
    if (!styleGroups.has(style)) {
      styleGroups.set(style, [])
    }
    styleGroups.get(style)!.push(swimmer)
  }

  const { repCount, setCount } = scanResult.menu

  // 各グループを PracticeMenu に変換
  return Array.from(styleGroups.entries()).map(([style, swimmers], index) => {
    const targetUserIds: string[] = []
    const times: TeamTimeEntry[] = []

    for (const swimmer of swimmers) {
      const userId = memberAssignments[swimmer.no]
      if (!userId) continue

      targetUserIds.push(userId)

      // member.id をルックアップ (TeamTimeEntry.memberId に必要)
      const member = members.find((m) => m.user_id === userId)
      if (!member) continue

      // タイムをセット×本数の構造にマッピング
      // times配列は [set1-rep1, set1-rep2, ..., set2-rep1, set2-rep2, ...] の順
      const timeEntries = swimmer.times
        .map((time, i) => {
          const setNum = Math.floor(i / repCount) + 1
          const repNum = (i % repCount) + 1
          return {
            setNumber: setNum,
            repNumber: repNum,
            time: time ?? 0,
            displayValue: time !== null && time > 0 ? formatTimeShort(time) : '',
          }
        })
        .filter((t) => t.time > 0)

      times.push({
        memberId: member.id,
        times: timeEntries,
      })
    }

    return {
      id: `ocr-${Date.now()}-${index}`,
      style,
      swimCategory: 'Swim' as const,
      distance: scanResult.menu.distance || 50,
      reps: repCount || 1,
      sets: setCount || 1,
      circleMin: scanResult.menu.circle
        ? Math.floor(scanResult.menu.circle / 60)
        : ('' as const),
      circleSec: scanResult.menu.circle
        ? scanResult.menu.circle % 60
        : ('' as const),
      note: scanResult.menu.description || '',
      tags: [] as [],
      times,
      targetUserIds,
    }
  })
}
