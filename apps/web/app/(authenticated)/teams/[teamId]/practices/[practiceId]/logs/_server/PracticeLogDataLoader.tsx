import { redirect, notFound } from 'next/navigation'
import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import { getServerUser } from '@/lib/supabase-server'
import PracticeLogClient from '../_client/PracticeLogClient'
import { PracticeTag, Practice } from '@apps/shared/types/database'

interface PracticeLogDataLoaderProps {
  teamId: string
  practiceId: string
}

interface TeamMember {
  id: string
  user_id: string
  role: string
  users: {
    id: string
    name: string
  }
}

interface PracticeWithDetails extends Practice {
  team: {
    id: string
    name: string
  } | null
}

interface PracticeLogWithDetails {
  id: string
  user_id: string
  style: string
  swim_category: 'Swim' | 'Pull' | 'Kick'
  distance: number
  rep_count: number
  set_count: number
  circle: number | null
  note: string | null
  practice_log_tags: {
    practice_tags: PracticeTag
  }[]
  practice_times: {
    id: string
    user_id: string
    set_number: number
    rep_number: number
    time: number
  }[]
}

interface AttendanceRecord {
  id: string
  user_id: string
  status: string | null
}

export default async function PracticeLogDataLoader({ teamId, practiceId }: PracticeLogDataLoaderProps) {
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  if (!user) {
    redirect('/login')
  }

  // 並行でデータ取得
  const [membershipResult, practiceResult, membersResult, practiceLogsResult, tagsResult, attendanceResult] = await Promise.all([
    // 現在ユーザーのメンバーシップを取得（admin権限チェック）
    supabase
      .from('team_memberships')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single(),
    
    // 練習情報を取得
    supabase
      .from('practices')
      .select(`
        id,
        user_id,
        team_id,
        date,
        place,
        note,
        created_at,
        team:teams!practices_team_id_fkey (
          id,
          name
        )
      `)
      .eq('id', practiceId)
      .eq('team_id', teamId)
      .single(),
    
    // チームメンバー一覧を取得
    supabase
      .from('team_memberships')
      .select(`
        id,
        user_id,
        role,
        users!team_memberships_user_id_fkey (
          id,
          name
        )
      `)
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('role', { ascending: false }),
    
    // 既存のPractice_Logを取得
    supabase
      .from('practice_logs')
      .select(`
        id,
        user_id,
        style,
        swim_category,
        distance,
        rep_count,
        set_count,
        circle,
        note,
        practice_log_tags (
          practice_tags (
            id,
            name,
            color,
            user_id
          )
        ),
        practice_times (
          id,
          user_id,
          set_number,
          rep_number,
          time
        )
      `)
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: true }),
    
    // 利用可能なタグを取得
    supabase
      .from('practice_tags')
      .select('id, name, color, user_id')
      .order('name'),
    
    // 出席情報を取得
    supabase
      .from('team_attendance')
      .select('id, user_id, status')
      .eq('practice_id', practiceId)
  ])

  // エラーチェック
  const membershipData = membershipResult.data as { id: string; role: string } | null
  if (membershipResult.error || !membershipData) {
    return notFound()
  }

  // admin権限チェック
  if (membershipData.role !== 'admin') {
    return redirect(`/teams/${teamId}?tab=practices`)
  }

  const practiceData = practiceResult.data
  if (practiceResult.error || !practiceData) {
    return notFound()
  }

  if (membersResult.error) {
    throw new Error('チームメンバーの取得に失敗しました')
  }

  const practice = practiceData as unknown as PracticeWithDetails
  const members = (membersResult.data || []) as unknown as TeamMember[]
  const practiceLogs = (practiceLogsResult.data || []) as unknown as PracticeLogWithDetails[]
  const tags = (tagsResult.data || []) as PracticeTag[]
  const attendance = (attendanceResult.data || []) as AttendanceRecord[]

  // 出席しているメンバーのuser_idリストを作成
  const presentUserIds = attendance
    .filter(a => a.status === 'present')
    .map(a => a.user_id)

  return (
    <PracticeLogClient
      teamId={teamId}
      practiceId={practiceId}
      practice={practice}
      teamName={practice.team?.name || 'チーム'}
      members={members}
      existingLogs={practiceLogs}
      availableTags={tags}
      presentUserIds={presentUserIds}
    />
  )
}

