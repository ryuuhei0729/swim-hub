import { TeamEvent } from '@swim-hub/shared/types'

export interface EventStatusEditState {
  attendanceStatus: 'open' | 'closed' | null
}

export interface EventGroupedByMonth {
  year: number
  month: number
  events: TeamEvent[]
}
