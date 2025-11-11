import { describe, expect, it } from 'vitest'
import {
  TeamAnnouncementsAPI,
  TeamAttendancesAPI,
  TeamCoreAPI,
  TeamMembersAPI,
  TeamPracticesAPI,
  TeamRecordsAPI
} from '../../api/teams'

describe('teams index exports', () => {
  it('API クラスが再エクスポートされている', () => {
    expect(typeof TeamAnnouncementsAPI).toBe('function')
    expect(typeof TeamAttendancesAPI).toBe('function')
    expect(typeof TeamCoreAPI).toBe('function')
    expect(typeof TeamMembersAPI).toBe('function')
    expect(typeof TeamPracticesAPI).toBe('function')
    expect(typeof TeamRecordsAPI).toBe('function')
  })
})


