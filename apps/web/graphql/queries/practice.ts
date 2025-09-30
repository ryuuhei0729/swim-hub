import { gql } from '@apollo/client'

// 練習関連クエリ
export const GET_PRACTICES = gql`
  query GetPractices($startDate: Date, $endDate: Date) {
    myPractices(startDate: $startDate, endDate: $endDate) {
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

export const GET_PRACTICE = gql`
  query GetPractice($id: ID!) {
    practice(id: $id) {
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

export const GET_PRACTICES_BY_DATE = gql`
  query GetPracticesByDate($date: Date!) {
    practicesByDate(date: $date) {
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

// 練習タグ関連クエリ
export const GET_MY_PRACTICE_TAGS = gql`
  query GetMyPracticeTags {
    myPracticeTags {
      id
      name
      color
      createdAt
      updatedAt
    }
  }
`

// 練習記録一覧用クエリ（表形式表示用）
export const GET_PRACTICE_LOGS = gql`
  query GetPracticeLogs($startDate: Date, $endDate: Date) {
    myPracticeLogs(startDate: $startDate, endDate: $endDate) {
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
      tags {
        id
        name
        color
      }
      createdAt
      updatedAt
    }
  }
`

export const GET_PRACTICE_LOG = gql`
  query GetPracticeLog($id: ID!) {
    practiceLog(id: $id) {
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
      tags {
        id
        name
        color
      }
    }
  }
`

export const GET_PRACTICE_LOGS_BY_USER = gql`
  query GetPracticeLogsByUser {
    myPracticeLogs {
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
    }
  }
`