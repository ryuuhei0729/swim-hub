import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { approveMembership, rejectMembership } from '@/app/(authenticated)/teams/_actions/actions'

/**
 * メンバーシップの承認・却下アクションを提供するカスタムフック
 */
export const useMembershipActions = (
  teamId: string,
  onMembershipChange?: () => void
) => {
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleApprove = useCallback(async (membershipId: string) => {
    try {
      setError(null)
      const result = await approveMembership(membershipId, teamId)
      if (result.success) {
        if (onMembershipChange) {
          onMembershipChange()
        }
        router.refresh()
        return true
      } else {
        setError(result.error || '承認に失敗しました')
        return false
      }
    } catch (err) {
      console.error('承認エラー:', err)
      setError('承認に失敗しました')
      return false
    }
  }, [teamId, onMembershipChange, router])

  const handleReject = useCallback(async (membershipId: string) => {
    if (!confirm('この参加申請を拒否しますか？')) {
      return false
    }

    try {
      setError(null)
      const result = await rejectMembership(membershipId, teamId)
      if (result.success) {
        if (onMembershipChange) {
          onMembershipChange()
        }
        router.refresh()
        return true
      } else {
        setError(result.error || '拒否に失敗しました')
        return false
      }
    } catch (err) {
      console.error('拒否エラー:', err)
      setError('拒否に失敗しました')
      return false
    }
  }, [teamId, onMembershipChange, router])

  return {
    handleApprove,
    handleReject,
    error
  }
}
