import {
  CREATE_TEAM_ANNOUNCEMENT,
  DELETE_TEAM_ANNOUNCEMENT,
  GET_TEAM_ANNOUNCEMENT,
  GET_TEAM_ANNOUNCEMENTS,
  UPDATE_TEAM_ANNOUNCEMENT
} from '@/graphql'
import type {
  CreateTeamAnnouncementInput,
  TeamAnnouncement,
  UpdateTeamAnnouncementInput
} from '@/types'
import { useMutation, useQuery } from '@apollo/client/react'

// チームお知らせ一覧取得フック
export const useTeamAnnouncements = (teamId: string) => {
  const { data, loading, error, refetch } = useQuery(GET_TEAM_ANNOUNCEMENTS, {
    variables: { teamId },
    skip: !teamId,
    fetchPolicy: 'cache-and-network'
  })

  return {
    announcements: (data as any)?.teamAnnouncements || [],
    loading,
    error,
    refetch
  }
}

// チームお知らせ詳細取得フック
export const useTeamAnnouncement = (id: string) => {
  const { data, loading, error } = useQuery(GET_TEAM_ANNOUNCEMENT, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network'
  })

  return {
    announcement: (data as any)?.teamAnnouncement,
    loading,
    error
  }
}

// チームお知らせ作成フック
export const useCreateTeamAnnouncement = () => {
  const [createAnnouncement, { loading, error }] = useMutation(CREATE_TEAM_ANNOUNCEMENT, {
    refetchQueries: ['GetTeamAnnouncements'],
    awaitRefetchQueries: true
  })

  const create = async (input: CreateTeamAnnouncementInput) => {
    try {
      const { data } = await createAnnouncement({
        variables: { input }
      })
      return (data as any)?.createTeamAnnouncement as TeamAnnouncement
    } catch (err) {
      console.error('お知らせ作成エラー:', err)
      throw err
    }
  }

  return {
    create,
    loading,
    error
  }
}

// チームお知らせ更新フック
export const useUpdateTeamAnnouncement = () => {
  const [updateAnnouncement, { loading, error }] = useMutation(UPDATE_TEAM_ANNOUNCEMENT, {
    refetchQueries: ['GetTeamAnnouncements'],
    awaitRefetchQueries: true
  })

  const update = async (id: string, input: UpdateTeamAnnouncementInput) => {
    try {
      const { data } = await updateAnnouncement({
        variables: { id, input }
      })
      return (data as any)?.updateTeamAnnouncement as TeamAnnouncement
    } catch (err) {
      console.error('お知らせ更新エラー:', err)
      throw err
    }
  }

  return {
    update,
    loading,
    error
  }
}

// チームお知らせ削除フック
export const useDeleteTeamAnnouncement = () => {
  const [deleteAnnouncement, { loading, error }] = useMutation(DELETE_TEAM_ANNOUNCEMENT, {
    refetchQueries: ['GetTeamAnnouncements'],
    awaitRefetchQueries: true
  })

  const remove = async (id: string) => {
    try {
      await deleteAnnouncement({
        variables: { id }
      })
      return true
    } catch (err) {
      console.error('お知らせ削除エラー:', err)
      throw err
    }
  }

  return {
    remove,
    loading,
    error
  }
}
