import { gql } from '@apollo/client'

// チーム作成
export const CREATE_TEAM = gql`
  mutation CreateTeam($input: CreateTeamInput!) {
    createTeam(input: $input) {
      id
      name
      description
      inviteCode
      createdAt
      updatedAt
    }
  }
`

// チーム更新
export const UPDATE_TEAM = gql`
  mutation UpdateTeam($id: ID!, $input: UpdateTeamInput!) {
    updateTeam(id: $id, input: $input) {
      id
      name
      description
      inviteCode
      createdAt
      updatedAt
    }
  }
`

// チーム削除
export const DELETE_TEAM = gql`
  mutation DeleteTeam($id: ID!) {
    deleteTeam(id: $id)
  }
`

// チーム参加
export const JOIN_TEAM = gql`
  mutation JoinTeam($input: JoinTeamInput!) {
    joinTeam(input: $input) {
      id
      teamId
      userId
      role
      isActive
      createdAt
      updatedAt
    }
  }
`

// チーム脱退
export const LEAVE_TEAM = gql`
  mutation LeaveTeam($teamId: ID!) {
    leaveTeam(teamId: $teamId)
  }
`

// チームメンバーシップ更新
export const UPDATE_TEAM_MEMBERSHIP = gql`
  mutation UpdateTeamMembership($id: ID!, $input: UpdateTeamMembershipInput!) {
    updateTeamMembership(id: $id, input: $input) {
      id
      teamId
      userId
      role
      isActive
      createdAt
      updatedAt
    }
  }
`

// チームメンバー削除
export const REMOVE_TEAM_MEMBER = gql`
  mutation RemoveTeamMember($membershipId: ID!) {
    removeTeamMember(membershipId: $membershipId)
  }
`
