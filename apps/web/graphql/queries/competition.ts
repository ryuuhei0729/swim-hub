import { gql } from '@apollo/client'

// 大会関連クエリ
export const GET_COMPETITIONS = gql`
  query GetCompetitions {
    competitions {
      id
      title
      date
      place
      note
    }
  }
`

export const GET_MY_COMPETITIONS = gql`
  query GetMyCompetitions {
    myCompetitions {
      id
      title
      date
      place
      poolType
      note
      isPersonal
      entryStatus
      createdAt
      updatedAt
    }
  }
`

export const GET_COMPETITION = gql`
  query GetCompetition($id: ID!) {
    competition(id: $id) {
      id
      title
      date
      place
      note
    }
  }
`