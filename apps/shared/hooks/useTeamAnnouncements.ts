import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import type {
  CreateTeamAnnouncementInput,
  TeamAnnouncement,
  TeamAnnouncementInsert,
  UpdateTeamAnnouncementInput
} from '../types/database'

// チームお知らせ一覧取得フック
export const useTeamAnnouncements = (supabase: SupabaseClient, teamId: string) => {
  const [announcements, setAnnouncements] = useState<TeamAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadAnnouncements = useCallback(async () => {
    if (!teamId) return

    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('announcements')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      if (!data) throw new Error('データが取得できませんでした')

      setAnnouncements(data as TeamAnnouncement[])
    } catch (err) {
      console.error('お知らせの取得に失敗:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase])

  useEffect(() => {
    loadAnnouncements()
  }, [loadAnnouncements])

  // リアルタイム購読
  useEffect(() => {
    if (!teamId) return

    const channel = supabase
      .channel(`team-announcements-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'announcements',
          filter: `team_id=eq.${teamId}`
        },
        () => {
          loadAnnouncements()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [teamId, loadAnnouncements, supabase])

  return {
    announcements,
    loading,
    error,
    refetch: loadAnnouncements
  }
}

// チームお知らせ詳細取得フック
export const useTeamAnnouncement = (supabase: SupabaseClient, id: string) => {
  const [announcement, setAnnouncement] = useState<TeamAnnouncement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!id) return

    const loadAnnouncement = async () => {
      try {
        setLoading(true)
        setError(null)

        const { data, error: fetchError } = await supabase
          .from('announcements')
          .select('*')
          .eq('id', id)
          .single()

        if (fetchError) throw fetchError
        if (!data) throw new Error('データが取得できませんでした')

        setAnnouncement(data as TeamAnnouncement)
      } catch (err) {
        console.error('お知らせ詳細の取得に失敗:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadAnnouncement()
  }, [id, supabase])

  return {
    announcement,
    loading,
    error
  }
}

// チームお知らせ作成フック
export const useCreateTeamAnnouncement = (supabase: SupabaseClient) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const create = async (input: CreateTeamAnnouncementInput): Promise<TeamAnnouncement> => {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      const insertData: TeamAnnouncementInsert = {
        team_id: input.teamId,
        title: input.title,
        content: input.content,
        created_by: user.id,
        is_published: input.isPublished || false,
        published_at: input.publishedAt || null
      }

      const { data, error: createError } = await supabase
        .from('announcements')
        .insert(insertData)
        .select()
        .single()

      if (createError) throw createError
      if (!data) throw new Error('データが作成できませんでした')

      return data as TeamAnnouncement
    } catch (err) {
      console.error('お知らせ作成エラー:', err)
      setError(err as Error)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    create,
    loading,
    error
  }
}

// チームお知らせ更新フック
export const useUpdateTeamAnnouncement = (supabase: SupabaseClient) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const update = async (id: string, input: UpdateTeamAnnouncementInput): Promise<TeamAnnouncement> => {
    try {
      setLoading(true)
      setError(null)

      const updateData: Partial<TeamAnnouncementInsert> = {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.content !== undefined && { content: input.content }),
        ...(input.isPublished !== undefined && { is_published: input.isPublished }),
        ...(input.publishedAt !== undefined && { published_at: input.publishedAt })
      }

      const { data, error: updateError } = await supabase
        .from('announcements')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError
      if (!data) throw new Error('データが更新できませんでした')

      return data as TeamAnnouncement
    } catch (err) {
      console.error('お知らせ更新エラー:', err)
      setError(err as Error)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    update,
    loading,
    error
  }
}

// チームお知らせ削除フック
export const useDeleteTeamAnnouncement = (supabase: SupabaseClient) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const remove = async (id: string): Promise<boolean> => {
    try {
      setLoading(true)
      setError(null)

      const { error: deleteError } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      return true
    } catch (err) {
      console.error('お知らせ削除エラー:', err)
      setError(err as Error)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    remove,
    loading,
    error
  }
}
