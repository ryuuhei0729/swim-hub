import { useState, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import type { MemberDetail } from '@/types/member-detail'

export function useMemberDetail(
  supabase: SupabaseClient,
  currentUserId: string,
  onMembershipChange?: () => void
) {
  const [error, setError] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleRoleChange = useCallback(async (
    member: MemberDetail,
    newRole: 'admin' | 'user'
  ) => {
    if (member.role === newRole) {
      return
    }

    try {
      setError(null)

      const { error: updateError } = await supabase
        .from('team_memberships')
        .update({ role: newRole })
        .eq('id', member.id)

      if (updateError) throw updateError

      onMembershipChange?.()
    } catch (err) {
      console.error('権限変更エラー:', err)
      setError('権限の変更に失敗しました')
      throw err
    }
  }, [supabase, onMembershipChange])

  const handleRemoveMember = useCallback(async (member: MemberDetail) => {
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

      const { error: deleteError } = await supabase
        .from('team_memberships')
        .update({ is_active: false })
        .eq('id', member.id)

      if (deleteError) throw deleteError

      onMembershipChange?.()
      return true
    } catch (err) {
      console.error('メンバー削除エラー:', err)
      setError('メンバーの削除に失敗しました')
      return false
    } finally {
      setIsRemoving(false)
    }
  }, [supabase, currentUserId, onMembershipChange])

  return {
    error,
    isRemoving,
    handleRoleChange,
    handleRemoveMember,
    setError
  }
}
