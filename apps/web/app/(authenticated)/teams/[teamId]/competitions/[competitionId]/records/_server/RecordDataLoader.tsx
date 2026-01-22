import { redirect, notFound } from 'next/navigation'
import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import { getServerUser } from '@/lib/supabase-server'
import RecordClient from '../_client/RecordClient'
import { Competition, Style } from '@apps/shared/types'

interface RecordDataLoaderProps {
  teamId: string
  competitionId: string
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

interface CompetitionWithDetails extends Competition {
  team: {
    id: string
    name: string
  } | null
}

interface RecordWithDetails {
  id: string
  user_id: string
  style_id: number
  time: number
  video_url: string | null
  note: string | null
  is_relaying: boolean
  pool_type: number | null
  team_id: string | null
  split_times: {
    id: string
    distance: number
    split_time: number
  }[]
  users: {
    id: string
    name: string
  } | null
  styles: {
    id: number
    name_jp: string
    distance: number
  } | null
}

export default async function RecordDataLoader({ teamId, competitionId }: RecordDataLoaderProps) {
  const [user, supabase] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient()
  ])

  if (!user) {
    redirect('/login')
  }

  // 並行でデータ取得
  const [membershipResult, competitionResult, membersResult, recordsResult, stylesResult] = await Promise.all([
    // 現在ユーザーのメンバーシップを取得（admin権限チェック）
    supabase
      .from('team_memberships')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single(),
    
    // 大会情報を取得
    supabase
      .from('competitions')
      .select(`
        id,
        user_id,
        team_id,
        title,
        date,
        end_date,
        place,
        pool_type,
        note,
        created_at,
        team:teams!competitions_team_id_fkey (
          id,
          name
        )
      `)
      .eq('id', competitionId)
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
    
    // 既存のRecordを取得
    supabase
      .from('records')
      .select(`
        id,
        user_id,
        style_id,
        time,
        video_url,
        note,
        is_relaying,
        pool_type,
        team_id,
        split_times (
          id,
          distance,
          split_time
        ),
        users!records_user_id_fkey (
          id,
          name
        ),
        styles!records_style_id_fkey (
          id,
          name_jp,
          distance
        )
      `)
      .eq('competition_id', competitionId)
      .eq('team_id', teamId)
      .order('created_at', { ascending: true }),
    
    // 種目マスタを取得
    supabase
      .from('styles')
      .select('id, name_jp, distance')
      .order('id')
  ])

  // エラーチェック
  const membershipData = membershipResult.data as { id: string; role: string } | null
  if (membershipResult.error || !membershipData) {
    return notFound()
  }

  // admin権限チェック
  if (membershipData.role !== 'admin') {
    return redirect(`/teams/${teamId}?tab=competitions`)
  }

  const competitionData = competitionResult.data
  if (competitionResult.error || !competitionData) {
    return notFound()
  }

  if (membersResult.error) {
    throw new Error('チームメンバーの取得に失敗しました')
  }

  const competition = competitionData as unknown as CompetitionWithDetails
  const members = (membersResult.data || []) as unknown as TeamMember[]
  const records = (recordsResult.data || []) as unknown as RecordWithDetails[]
  const styles = (stylesResult.data || []) as Style[]

  return (
    <RecordClient
      teamId={teamId}
      competitionId={competitionId}
      competition={competition}
      teamName={competition.team?.name || 'チーム'}
      members={members}
      existingRecords={records}
      styles={styles}
    />
  )
}

