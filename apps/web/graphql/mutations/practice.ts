import { gql } from '@apollo/client'

// 練習関連ミューテーション
export const CREATE_PRACTICE = gql`
  mutation CreatePractice($input: CreatePracticeInput!) {
    createPractice(input: $input) {
      id
      userId
      date
      place
      note
      practiceLogs {
        id
        practiceId
        style
        repCount
        setCount
        distance
        circle
        note
        times {
          id
          repNumber
          setNumber
          time
        }
        tags {
          id
          name
          color
        }
      }
      createdAt
      updatedAt
    }
  }
`

export const UPDATE_PRACTICE = gql`
  mutation UpdatePractice($id: ID!, $input: UpdatePracticeInput!) {
    updatePractice(id: $id, input: $input) {
      id
      date
      place
      note
    }
  }
`

export const DELETE_PRACTICE = gql`
  mutation DeletePractice($id: ID!) {
    deletePractice(id: $id)
  }
`

// 練習タグ関連ミューテーション
export const CREATE_PRACTICE_TAG = gql`
  mutation CreatePracticeTag($input: CreatePracticeTagInput!) {
    createPracticeTag(input: $input) {
      id
      name
      color
      createdAt
      updatedAt
    }
  }
`

export const UPDATE_PRACTICE_TAG = gql`
  mutation UpdatePracticeTag($id: ID!, $input: UpdatePracticeTagInput!) {
    updatePracticeTag(id: $id, input: $input) {
      id
      name
      color
      createdAt
      updatedAt
    }
  }
`

export const DELETE_PRACTICE_TAG = gql`
  mutation DeletePracticeTag($id: ID!) {
    deletePracticeTag(id: $id)
  }
`

// 練習関連ミューテーション
export const CREATE_PRACTICE_LOG = gql`
  mutation CreatePracticeLog($input: CreatePracticeLogInput!) {
    createPracticeLog(input: $input) {
      id
      userId
      practiceId
      practice {
        id
        date
        place
        note
      }
      style
      repCount
      setCount
      distance
      circle
      note
      times {
        id
        repNumber
        setNumber
        time
      }
      createdAt
      updatedAt
    }
  }
`

export const UPDATE_PRACTICE_LOG = gql`
  mutation UpdatePracticeLog($id: ID!, $input: UpdatePracticeLogInput!) {
    updatePracticeLog(id: $id, input: $input) {
      id
      userId
      practiceId
      practice {
        id
        date
        place
        note
      }
      style
      repCount
      setCount
      distance
      circle
      note
      times {
        id
        repNumber
        setNumber
        time
      }
      createdAt
      updatedAt
    }
  }
`

export const DELETE_PRACTICE_LOG = gql`
  mutation DeletePracticeLog($id: ID!) {
    deletePracticeLog(id: $id)
  }
`

export const CREATE_PRACTICE_TIME = gql`
  mutation CreatePracticeTime($input: CreatePracticeTimeInput!) {
    createPracticeTime(input: $input) {
      id
      userId
      practiceLogId
      repNumber
      setNumber
      time
      createdAt
      updatedAt
    }
  }
`

export const UPDATE_PRACTICE_TIME = gql`
  mutation UpdatePracticeTime($id: ID!, $input: UpdatePracticeTimeInput!) {
    updatePracticeTime(id: $id, input: $input) {
      id
      practiceLogId
      repNumber
      setNumber
      time
    }
  }
`

export const DELETE_PRACTICE_TIME = gql`
  mutation DeletePracticeTime($id: ID!) {
    deletePracticeTime(id: $id) {
      success
    }
  }
`

// 練習ログタグ関連ミューテーション
export const ADD_PRACTICE_LOG_TAG = gql`
  mutation AddPracticeLogTag($practiceLogId: ID!, $practiceTagId: ID!) {
    addPracticeLogTag(practiceLogId: $practiceLogId, practiceTagId: $practiceTagId)
  }
`

export const REMOVE_PRACTICE_LOG_TAG = gql`
  mutation RemovePracticeLogTag($practiceLogId: ID!, $practiceTagId: ID!) {
    removePracticeLogTag(practiceLogId: $practiceLogId, practiceTagId: $practiceTagId)
  }
`