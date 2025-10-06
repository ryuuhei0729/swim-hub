import { gql } from '@apollo/client'

// チームお知らせ作成
export const CREATE_TEAM_ANNOUNCEMENT = gql`
  mutation CreateTeamAnnouncement($input: CreateTeamAnnouncementInput!) {
    createTeamAnnouncement(input: $input) {
      id
      teamId
      title
      content
      createdBy
      isPublished
      publishedAt
      createdAt
      updatedAt
    }
  }
`

// チームお知らせ更新
export const UPDATE_TEAM_ANNOUNCEMENT = gql`
  mutation UpdateTeamAnnouncement($id: ID!, $input: UpdateTeamAnnouncementInput!) {
    updateTeamAnnouncement(id: $id, input: $input) {
      id
      teamId
      title
      content
      createdBy
      isPublished
      publishedAt
      createdAt
      updatedAt
    }
  }
`

// チームお知らせ削除
export const DELETE_TEAM_ANNOUNCEMENT = gql`
  mutation DeleteTeamAnnouncement($id: ID!) {
    deleteTeamAnnouncement(id: $id)
  }
`
