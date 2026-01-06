// =============================================================================
// 出欠状況グループ化フック - Swim Hub共通パッケージ
// =============================================================================

'use client'

import { useMemo } from 'react'
import { TeamAttendanceWithDetails } from '../types/database'
import { TeamMember } from '../utils/team'

/**
 * 出欠状況を4つのグループに分類するフック
 * 
 * @param attendanceData - 出欠情報の配列
 * @param teamMembers - チームメンバーの配列
 * @returns 出席、欠席、その他、未回答の4つのグループ
 */
export function useAttendanceGrouping(
  attendanceData: TeamAttendanceWithDetails[],
  teamMembers: TeamMember[]
) {
  return useMemo(() => {
    // 回答済みのユーザーIDセット
    const answeredUserIds = new Set(
      attendanceData.map(a => a.user_id)
    )
    
    // 未回答のメンバー（チームメンバー全員から回答済みを除外）
    const unansweredMembers = teamMembers.filter(
      m => !answeredUserIds.has(m.id)
    )

    // グループ化
    const presentMembers = attendanceData
      .filter(a => a.status === 'present')
      .map(a => ({ 
        id: a.user_id, 
        name: a.user?.name || 'Unknown User' 
      }))
      .filter(m => m.name !== 'Unknown User')
    
    const absentMembers = attendanceData
      .filter(a => a.status === 'absent')
      .map(a => ({ 
        id: a.user_id, 
        name: a.user?.name || 'Unknown User' 
      }))
      .filter(m => m.name !== 'Unknown User')
    
    const otherMembers = attendanceData
      .filter(a => a.status === 'other')
      .map(a => ({ 
        id: a.user_id, 
        name: a.user?.name || 'Unknown User' 
      }))
      .filter(m => m.name !== 'Unknown User')

    return {
      presentMembers,
      absentMembers,
      otherMembers,
      unansweredMembers
    }
  }, [attendanceData, teamMembers])
}

