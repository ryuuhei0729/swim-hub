import { gql } from '@apollo/client'

// 記録関連クエリ
export const GET_RECORDS = gql`
  query GetRecords {
    myRecords {
      id
      userId
      competitionId
      styleId
      time
      videoUrl
      note
      isRelaying
      competition {
        id
        title
        date
        place
        poolType
      }
      style {
        id
        nameJp
        name
        stroke
        distance
      }
    }
  }
`

export const GET_RECORD = gql`
  query GetRecord($id: ID!) {
    record(id: $id) {
      id
      userId
      competitionId
      styleId
      time
      videoUrl
      note
      isRelaying
      competition {
        id
        title
        date
        place
        poolType
      }
      style {
        id
        nameJp
        name
        stroke
        distance
      }
      splitTimes {
        id
        recordId
        distance
        splitTime
      }
    }
  }
`

export const GET_RECORDS_BY_USER = gql`
  query GetRecordsByUser($userId: ID!) {
    recordsByUser(userId: $userId) {
      id
      userId
      competitionId
      styleId
      time
      videoUrl
      note
      isRelaying
      competition {
        id
        title
        date
        place
        poolType
      }
      style {
        id
        nameJp
        name
        stroke
        distance
      }
    }
  }
`
