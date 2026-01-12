// =============================================================================
// PracticeItem.test.tsx - 練習記録アイテムコンポーネントのテスト
// =============================================================================

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PracticeItem } from '../PracticeItem'
import { createMockPracticeWithLogs } from '@/__mocks__/supabase'

describe('PracticeItem', () => {
  const mockPractice = createMockPracticeWithLogs({
    date: '2025-01-15',
    title: 'テスト練習',
    place: 'テストプール',
    note: 'テストメモ',
    practice_logs: [
      {
        id: 'log-1',
        practice_id: 'practice-1',
        distance: 100,
        rep_count: 4,
        set_count: 2,
        circle: null,
        style: null,
        note: null,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
        practice_log_tags: [],
      },
      {
        id: 'log-2',
        practice_id: 'practice-1',
        distance: 100,
        rep_count: 4,
        set_count: 2,
        circle: null,
        style: null,
        note: null,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
        practice_log_tags: [],
      },
    ],
  })

  it('練習記録データが正しく表示される', () => {
    render(<PracticeItem practice={mockPractice} />)
    
    // 日付が表示される（M/d形式、例: 1/15）
    expect(screen.getByText(/1\/15/)).toBeTruthy()
    // タイトルが表示される
    expect(screen.getByText('テスト練習')).toBeTruthy()
    // 場所が表示される（アイコンとテキストが含まれる）
    expect(screen.getByText('テストプール')).toBeTruthy()
    expect(screen.getByTestId('icon-map-pin')).toBeTruthy()
    // 練習ログの情報が表示される（距離・本数・セット）
    expect(screen.getByText(/100m × 4本 × 2セット/)).toBeTruthy()
  })

  it('タイトルがnullの場合、「練習」が表示される', () => {
    const practiceWithoutTitle = createMockPracticeWithLogs({
      ...mockPractice,
      title: null,
    })
    
    render(<PracticeItem practice={practiceWithoutTitle} />)
    
    expect(screen.getByText('練習')).toBeTruthy()
  })

  it('練習ログ数が表示される', () => {
    render(<PracticeItem practice={mockPractice} />)
    
    // セット数は「距離m × 本数本 × セット数セット」の形式で表示される
    // デフォルトのモックデータでは set_count: 2 が設定されている
    expect(screen.getByText(/2セット/)).toBeTruthy()
  })

  it('練習ログがない場合、ログ数が表示されない', () => {
    const practiceWithoutLogs = createMockPracticeWithLogs({
      ...mockPractice,
      practice_logs: [],
    })
    
    render(<PracticeItem practice={practiceWithoutLogs} />)
    
    expect(screen.queryByText(/セット/)).toBeNull()
  })

  it('場所がnullの場合、場所が表示されない', () => {
    const practiceWithoutPlace = createMockPracticeWithLogs({
      ...mockPractice,
      place: null,
    })
    
    render(<PracticeItem practice={practiceWithoutPlace} />)
    
    expect(screen.queryByText('テストプール')).toBeNull()
    expect(screen.queryByTestId('icon-map-pin')).toBeNull()
  })

  it('メモがnullの場合、メモが表示されない', () => {
    const practiceWithoutNote = createMockPracticeWithLogs({
      ...mockPractice,
      note: null,
    })
    
    render(<PracticeItem practice={practiceWithoutNote} />)
    
    expect(screen.queryByText('テストメモ')).toBeNull()
  })

  it('onPressが提供された場合、タップでコールバックが呼ばれる', () => {
    const onPress = vi.fn()
    render(<PracticeItem practice={mockPractice} onPress={onPress} />)
    
    // Pressableをタップ（button要素としてレンダリングされる）
    const pressable = screen.getByText('テスト練習').closest('button')
    expect(pressable).not.toBeNull()

    fireEvent.click(pressable!)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledWith(mockPractice)
  })

  it('onPressが提供されない場合でもエラーが発生しない', () => {
    render(<PracticeItem practice={mockPractice} />)
    
    // エラーなくレンダリングされる
    expect(screen.getByText('テスト練習')).toBeTruthy()
  })
})

