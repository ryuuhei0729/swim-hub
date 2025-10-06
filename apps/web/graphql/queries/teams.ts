import { gql } from '@apollo/client'

// チーム一覧取得
export const GET_MY_TEAMS = gql`
  query GetMyTeams {
    myTeams {
      id
      teamId
      userId
      role
      isActive
      team {
        id
        name
        description
        inviteCode
        createdAt
        updatedAt
      }
    }
  }
`

// チーム詳細取得
export const GET_TEAM = gql`
  query GetTeam($id: ID!) {
    team(id: $id) {
      id
      name
      description
      inviteCode
      createdAt
      updatedAt
    }
  }
`

// 招待コードでチーム検索
export const GET_TEAM_BY_INVITE_CODE = gql`
  query GetTeamByInviteCode($inviteCode: String!) {
    teamByInviteCode(inviteCode: $inviteCode) {
      id
      name
      description
      inviteCode
      createdAt
      updatedAt
    }
  }
`

// チームメンバー一覧取得
export const GET_TEAM_MEMBERS = gql`
  query GetTeamMembers($teamId: ID!) {
    teamMembers(teamId: $teamId) {
      id
      teamId
      userId
      role
      joinedAt
      leftAt
      isActive
      user {
        id
        name
        profileImagePath
        bio
      }
    }
  }
`

// チームの練習一覧取得
export const GET_TEAM_PRACTICES = gql`
  query GetTeamPractices($teamId: ID!) {
    teamPractices(teamId: $teamId) {
      id
      userId
      date
      place
      note
      teamId
      isPersonal
      createdAt
      updatedAt
    }
  }
`

// チームの大会一覧取得
export const GET_TEAM_COMPETITIONS = gql`
  query GetTeamCompetitions($teamId: ID!) {
    teamCompetitions(teamId: $teamId) {
      id
      title
      date
      place
      poolType
      note
      teamId
      isPersonal
      entryStatus
      createdAt
      updatedAt
    }
  }
`
