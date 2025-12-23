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
      { id: 'log-1', practice_id: 'practice-1' } satisfies { id: string; practice_id: string },
      { id: 'log-2', practice_id: 'practice-1' } satisfies { id: string; practice_id: string },
    ],
  })

  it('練習記録データが正しく表示される', () => {
    render(<PracticeItem practice={mockPractice} />)
    
    // 日付が表示される（フォーマットされた形式）
    expect(screen.getByText(/2025年1月15日/)).toBeTruthy()
    // タイトルが表示される
    expect(screen.getByText('テスト練習')).toBeTruthy()
    // 場所が表示される（アイコンとテキストが含まれる）
    expect(screen.getByText('テストプール')).toBeTruthy()
    expect(screen.getByTestId('icon-map-pin')).toBeTruthy()
    // メモが表示される
    expect(screen.getByText('テストメモ')).toBeTruthy()
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
    
    expect(screen.getByText('2セット')).toBeTruthy()
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

