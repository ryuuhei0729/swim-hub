import { gql } from '@apollo/client'

export const CREATE_TEAM_PRACTICE = gql`
  mutation CreateTeamPractice($input: CreateTeamPracticeInput!) {
    createTeamPractice(input: $input) {
      id
      userId
      date
      place
      note
      teamId
      isPersonal
      practiceLogs {
        id
        userId
        practiceId
        style
        styleId
        time
        repCount
        setCount
        distance
        circle
        note
        times {
          id
          userId
          practiceLogId
          repNumber
          setNumber
          time
          createdAt
          updatedAt
        }
        tags {
          id
          name
          color
        }
        createdAt
        updatedAt
      }
      createdAt
      updatedAt
    }
  }
`
