// =============================================================================
// practiceFormStore.test.ts - 練習記録フォームストアのユニットテスト
// =============================================================================

import { createMockPractice } from '@/__mocks__/supabase'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePracticeFormStore } from '../practiceFormStore'

describe('practiceFormStore', () => {
  beforeEach(() => {
    // 各テスト前にストアをリセット
    usePracticeFormStore.getState().reset()
  })

  it('初期状態が正しい', () => {
    const state = usePracticeFormStore.getState()

    expect(state.date).toBeDefined()
    expect(state.title).toBeNull()
    expect(state.place).toBeNull()
    expect(state.note).toBeNull()
    expect(state.isLoading).toBe(false)
    expect(state.errors).toEqual({})
  })

  it('setDateで日付を設定できる', () => {
    const { setDate } = usePracticeFormStore.getState()
    const newDate = '2025-01-20'

    setDate(newDate)

    expect(usePracticeFormStore.getState().date).toBe(newDate)
  })

  it('setTitleでタイトルを設定できる', () => {
    const { setTitle } = usePracticeFormStore.getState()
    const newTitle = 'テスト練習'

    setTitle(newTitle)

    expect(usePracticeFormStore.getState().title).toBe(newTitle)
  })

  it('setPlaceで場所を設定できる', () => {
    const { setPlace } = usePracticeFormStore.getState()
    const newPlace = 'テストプール'

    setPlace(newPlace)

    expect(usePracticeFormStore.getState().place).toBe(newPlace)
  })

  it('setNoteでメモを設定できる', () => {
    const { setNote } = usePracticeFormStore.getState()
    const newNote = 'テストメモ'

    setNote(newNote)

    expect(usePracticeFormStore.getState().note).toBe(newNote)
  })

  it('setLoadingでローディング状態を設定できる', () => {
    const { setLoading } = usePracticeFormStore.getState()

    setLoading(true)
    expect(usePracticeFormStore.getState().isLoading).toBe(true)

    setLoading(false)
    expect(usePracticeFormStore.getState().isLoading).toBe(false)
  })

  it('setErrorでエラーを設定できる', () => {
    const { setError } = usePracticeFormStore.getState()

    setError('date', '日付は必須です')
    expect(usePracticeFormStore.getState().errors.date).toBe('日付は必須です')

    setError('title', 'タイトルが長すぎます')
    expect(usePracticeFormStore.getState().errors.title).toBe('タイトルが長すぎます')
    expect(usePracticeFormStore.getState().errors.date).toBe('日付は必須です') // 既存のエラーは保持
  })

  it('clearErrorsでエラーをクリアできる', () => {
    const { setError, clearErrors } = usePracticeFormStore.getState()

    setError('date', '日付は必須です')
    setError('title', 'タイトルが長すぎます')

    clearErrors()

    expect(usePracticeFormStore.getState().errors).toEqual({})
  })

  it('initializeで既存の練習記録を初期化できる', () => {
    const { initialize } = usePracticeFormStore.getState()
    const mockPractice = createMockPractice({
      date: '2025-01-15',
      title: 'テスト練習',
      place: 'テストプール',
      note: 'テストメモ',
    })

    initialize(mockPractice)

    const state = usePracticeFormStore.getState()
    expect(state.date).toBe('2025-01-15')
    expect(state.title).toBe('テスト練習')
    expect(state.place).toBe('テストプール')
    expect(state.note).toBe('テストメモ')
    expect(state.errors).toEqual({})
  })

  it('initializeで空のフォームを初期化できる', () => {
    const { initialize, setTitle, setPlace } = usePracticeFormStore.getState()

    // まず値を設定
    setTitle('テスト')
    setPlace('プール')

    // 空で初期化
    initialize()

    const state = usePracticeFormStore.getState()
    expect(state.title).toBeNull()
    expect(state.place).toBeNull()
    expect(state.note).toBeNull()
    expect(state.errors).toEqual({})
    expect(state.date).toBeDefined() // 日付は今日の日付に設定される
  })

  it('resetでストアをリセットできる', () => {
    const { setTitle, setPlace, setNote, reset } = usePracticeFormStore.getState()

    setTitle('テスト')
    setPlace('プール')
    setNote('メモ')

    reset()

    const state = usePracticeFormStore.getState()
    expect(state.title).toBeNull()
    expect(state.place).toBeNull()
    expect(state.note).toBeNull()
    expect(state.isLoading).toBe(false)
    expect(state.errors).toEqual({})
  })
})
