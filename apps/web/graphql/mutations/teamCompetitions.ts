import { gql } from '@apollo/client'

// 一括大会登録のミューテーション
export const CREATE_BULK_TEAM_COMPETITIONS = gql`
  mutation CreateBulkTeamCompetitions($input: BulkTeamCompetitionsInput!) {
    createBulkTeamCompetitions(input: $input) {
      success
      message
      createdCompetitions {
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
      errors {
        index
        title
        message
      }
    }
  }
`

// チーム大会更新のミューテーション
export const UPDATE_TEAM_COMPETITION = gql`
  mutation UpdateTeamCompetition($id: ID!, $input: UpdateCompetitionInput!) {
    updateTeamCompetition(id: $id, input: $input) {
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

// チーム大会削除のミューテーション
export const DELETE_TEAM_COMPETITION = gql`
  mutation DeleteTeamCompetition($id: ID!) {
    deleteTeamCompetition(id: $id)
  }
`
