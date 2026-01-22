import type { ParsedPracticeData } from '@/utils/practiceExcel'
import type { ParsedCompetitionData } from '@/utils/competitionExcel'

export type ParsedData = {
  type: 'practice'
  data: ParsedPracticeData
} | {
  type: 'competition'
  data: ParsedCompetitionData
}

export interface RegisterResult {
  practicesCreated: number
  competitionsCreated: number
  errors: string[]
}
