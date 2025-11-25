import { render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { CalendarProvider, useCalendar } from '@/app/(authenticated)/dashboard/_providers/CalendarProvider'
import type { CalendarItem } from '@apps/shared/types/ui'

const mockUseAuth = vi.hoisted(() => vi.fn())

vi.mock('@/contexts', () => ({
  useAuth: mockUseAuth,
}))

const mockGetCalendarEntries = vi.fn()
const mockGetMonthlySummary = vi.fn()

vi.mock('@apps/shared/api/dashboard', () => ({
  DashboardAPI: class {
    constructor() {}
    getCalendarEntries = mockGetCalendarEntries
    getMonthlySummary = mockGetMonthlySummary
  },
}))

const CalendarConsumer = ({ onReady }: { onReady: (value: ReturnType<typeof useCalendar>) => void }) => {
  const value = useCalendar()
  onReady(value)
  return null
}

describe('CalendarProvider', () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
    mockGetCalendarEntries.mockReset()
    mockGetMonthlySummary.mockReset()
  })

  it('uses initial data when provided for current month', () => {
    const initialItems: CalendarItem[] = [
      { id: '1', type: 'practice', date: '2025-01-10', title: '朝練', place: '市営プール', note: '', metadata: {}, editData: {} },
    ]
    const initialSummary = { practiceCount: 3, recordCount: 1 }

    mockUseAuth.mockReturnValue({
      supabase: {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      },
    })

    let contextValue: ReturnType<typeof useCalendar> | null = null

    render(
      <CalendarProvider
        initialCalendarItems={initialItems}
        initialMonthlySummary={initialSummary}
        initialDate={new Date(2025, 0, 5)}
      >
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>
    )

    expect(mockGetCalendarEntries).not.toHaveBeenCalled()
    expect(contextValue).not.toBeNull()
    const value = contextValue!
    expect(value.calendarItems).toEqual(initialItems)
    expect(value.monthlySummary).toEqual(initialSummary)
  })

  it('初期データが不足しているときカレンダーデータを取得し、楽観的更新をサポートする', async () => {
    const supabaseMock = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    }
    mockUseAuth.mockReturnValue({ supabase: supabaseMock })

    const fetchedItems: CalendarItem[] = [
      { id: '2', type: 'record', date: '2025-02-03', title: '大会', place: '国立プール', note: '', metadata: {}, editData: {} },
    ]
    const fetchedSummary = { practiceCount: 1, recordCount: 2 }

    mockGetCalendarEntries.mockResolvedValue(fetchedItems)
    mockGetMonthlySummary.mockResolvedValue(fetchedSummary)

    let contextValue: ReturnType<typeof useCalendar> | undefined

    render(
      <CalendarProvider initialDate={new Date(2025, 1, 1)}>
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>
    )

    await waitFor(() => {
      expect(mockGetCalendarEntries).toHaveBeenCalled()
      expect(contextValue?.calendarItems).toEqual(fetchedItems)
      expect(contextValue?.monthlySummary).toEqual(fetchedSummary)
    })

    const currentCallCount = mockGetCalendarEntries.mock.calls.length

    // 同じ月への setCurrentDate は再取得しない
    act(() => {
      contextValue?.setCurrentDate(new Date(2025, 1, 15))
    })
    expect(mockGetCalendarEntries).toHaveBeenCalledTimes(currentCallCount)

    // 別月に移動すると再取得
    mockGetCalendarEntries.mockResolvedValue([
      { id: '3', type: 'practice', date: '2025-03-01', title: '合宿', place: '海浜', note: '', metadata: {}, editData: {} },
    ] as CalendarItem[])
    mockGetMonthlySummary.mockResolvedValue({ practiceCount: 5, recordCount: 0 })

    await act(async () => {
      contextValue?.setCurrentDate(new Date(2025, 2, 1))
      await waitFor(() => {
        expect(mockGetCalendarEntries).toHaveBeenCalledTimes(currentCallCount + 1)
      })
    })

    // 楽観的操作の検証
    act(() => {
      contextValue?.addItem({ id: '4', type: 'practice', date: '2025-03-05', title: '自主練', place: '市民プール', note: '', metadata: {}, editData: {} })
      contextValue?.updateItem('4', { title: '自主練（更新）' })
      contextValue?.removeItem('4')
    })

    expect(contextValue?.calendarItems).not.toContainEqual(expect.objectContaining({ id: '4' }))
  })

  it('refetch resets state when user is not authenticated', async () => {
    const getUserMock = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: { id: 'user-1' } } })
      .mockResolvedValue({ data: { user: null } })

    mockUseAuth.mockReturnValue({
      supabase: {
        auth: {
          getUser: getUserMock,
        },
      },
    })

    mockGetCalendarEntries.mockResolvedValue([
      { id: '5', type: 'practice', date: '2025-04-01', title: '朝練', place: '学校プール', note: '', metadata: {}, editData: {} },
    ] as CalendarItem[])
    mockGetMonthlySummary.mockResolvedValue({ practiceCount: 2, recordCount: 0 })

    let contextValue: ReturnType<typeof useCalendar> | undefined

    render(
      <CalendarProvider initialDate={new Date(2025, 3, 1)}>
        <CalendarConsumer onReady={(value) => (contextValue = value)} />
      </CalendarProvider>
    )

    await waitFor(() => expect(contextValue?.calendarItems).toHaveLength(1))

    await act(async () => {
      await contextValue?.refetch(new Date(2025, 4, 1))
    })

    await waitFor(() => {
      expect(contextValue?.calendarItems).toEqual([])
    })
    expect(contextValue?.monthlySummary).toEqual({ practiceCount: 0, recordCount: 0 })
  })
})


