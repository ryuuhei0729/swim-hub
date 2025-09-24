import { gql } from '@apollo/client'

// 記録関連ミューテーション
export const CREATE_RECORD = gql`
  mutation CreateRecord($input: CreateRecordInput!) {
    createRecord(input: $input) {
      id
      userId
      styleId
      time
      videoUrl
      note
      isRelaying
      competitionId
      style {
        id
        nameJp
        name
        distance
        stroke
      }
      competition {
        id
        title
        date
        place
        poolType
      }
    }
  }
`

export const UPDATE_RECORD = gql`
  mutation UpdateRecord($id: ID!, $input: UpdateRecordInput!) {
    updateRecord(id: $id, input: $input) {
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

export const DELETE_RECORD = gql`
  mutation DeleteRecord($id: ID!) {
    deleteRecord(id: $id)
  }
`

export const CREATE_SPLIT_TIME = gql`
  mutation CreateSplitTime($input: CreateSplitTimeInput!) {
    createSplitTime(input: $input) {
      id
      recordId
      distance
      splitTime
    }
  }
`

export const UPDATE_SPLIT_TIME = gql`
  mutation UpdateSplitTime($id: ID!, $input: UpdateSplitTimeInput!) {
    updateSplitTime(id: $id, input: $input) {
      id
      recordId
      distance
      splitTime
    }
  }
`

export const DELETE_SPLIT_TIME = gql`
  mutation DeleteSplitTime($id: ID!) {
    deleteSplitTime(id: $id)
  }
`
