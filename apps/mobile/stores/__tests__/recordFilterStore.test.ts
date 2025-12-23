// =============================================================================
// recordFilterStore.test.ts - 大会記録フィルターストアのユニットテスト
// =============================================================================

import { beforeEach, describe, expect, it } from 'vitest'
import { useRecordFilterStore } from '../recordFilterStore'

describe('recordFilterStore', () => {
  beforeEach(() => {
    // 各テスト前にストアをリセット
    useRecordFilterStore.getState().reset()
  })

  it('初期状態が正しい', () => {
    const state = useRecordFilterStore.getState()

    expect(state.filterStyleId).toBeNull()
    expect(state.filterFiscalYear).toBe('')
    expect(state.filterPoolType).toBeNull()
    expect(state.sortBy).toBe('date')
    expect(state.sortOrder).toBe('desc')
  })

  it('setFilterStyleIdで種目IDを設定できる', () => {
    const { setFilterStyleId } = useRecordFilterStore.getState()

    setFilterStyleId(1)
    expect(useRecordFilterStore.getState().filterStyleId).toBe(1)

    setFilterStyleId(null)
    expect(useRecordFilterStore.getState().filterStyleId).toBeNull()
  })

  it('setFilterFiscalYearで年度を設定できる', () => {
    const { setFilterFiscalYear } = useRecordFilterStore.getState()

    setFilterFiscalYear('2024')
    expect(useRecordFilterStore.getState().filterFiscalYear).toBe('2024')

    setFilterFiscalYear('')
    expect(useRecordFilterStore.getState().filterFiscalYear).toBe('')
  })

  it('setFilterPoolTypeでプールタイプを設定できる', () => {
    const { setFilterPoolType } = useRecordFilterStore.getState()

    setFilterPoolType(0)
    expect(useRecordFilterStore.getState().filterPoolType).toBe(0)

    setFilterPoolType(1)
    expect(useRecordFilterStore.getState().filterPoolType).toBe(1)

    setFilterPoolType(null)
    expect(useRecordFilterStore.getState().filterPoolType).toBeNull()
  })

  it('setSortByでソート基準を設定できる', () => {
    const { setSortBy } = useRecordFilterStore.getState()

    setSortBy('date')
    expect(useRecordFilterStore.getState().sortBy).toBe('date')

    setSortBy('time')
    expect(useRecordFilterStore.getState().sortBy).toBe('time')
  })

  it('setSortOrderでソート順を設定できる', () => {
    const { setSortOrder } = useRecordFilterStore.getState()

    setSortOrder('asc')
    expect(useRecordFilterStore.getState().sortOrder).toBe('asc')

    setSortOrder('desc')
    expect(useRecordFilterStore.getState().sortOrder).toBe('desc')
  })

  it('resetでストアをリセットできる', () => {
    const {
      setFilterStyleId,
      setFilterFiscalYear,
      setFilterPoolType,
      setSortBy,
      setSortOrder,
      reset,
    } = useRecordFilterStore.getState()

    setFilterStyleId(1)
    setFilterFiscalYear('2024')
    setFilterPoolType(0)
    setSortBy('time')
    setSortOrder('asc')

    reset()

    const state = useRecordFilterStore.getState()
    expect(state.filterStyleId).toBeNull()
    expect(state.filterFiscalYear).toBe('')
    expect(state.filterPoolType).toBeNull()
    expect(state.sortBy).toBe('date')
    expect(state.sortOrder).toBe('desc')
  })
})
