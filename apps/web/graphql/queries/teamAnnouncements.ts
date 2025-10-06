import { gql } from '@apollo/client'

// チームお知らせ一覧取得
export const GET_TEAM_ANNOUNCEMENTS = gql`
  query GetTeamAnnouncements($teamId: ID!) {
    teamAnnouncements(teamId: $teamId) {
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

// チームお知らせ詳細取得
export const GET_TEAM_ANNOUNCEMENT = gql`
  query GetTeamAnnouncement($id: ID!) {
    teamAnnouncement(id: $id) {
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
