// =============================================================================
// SplitTimeItem.test.tsx - スプリットタイムアイテムコンポーネントのテスト
// =============================================================================

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SplitTimeItem } from '../SplitTimeItem'
import type { SplitTime } from '@swim-hub/shared/types/database'

describe('SplitTimeItem', () => {
  const mockSplitTime: SplitTime = {
    id: 'split-1',
    record_id: 'record-1',
    distance: 50,
    split_time: 25.5,
    created_at: '2025-01-15T10:00:00Z',
  }

  it('スプリットタイムデータが正しく表示される', () => {
    render(<SplitTimeItem splitTime={mockSplitTime} index={0} />)
    
    // 距離が表示される
    expect(screen.getByText('50m')).toBeTruthy()
    // タイムが表示される（フォーマットされた形式）
    expect(screen.getByText('25.50')).toBeTruthy() // formatTime(25.5)
  })

  it('異なる距離のスプリットタイムが表示される', () => {
    const splitTime100m: SplitTime = {
      ...mockSplitTime,
      distance: 100,
      split_time: 60.0,
    }
    
    render(<SplitTimeItem splitTime={splitTime100m} index={1} />)
    
    expect(screen.getByText('100m')).toBeTruthy()
    expect(screen.getByText('1:00.00')).toBeTruthy() // formatTime(60.0)
  })

  it('異なるindexで表示される', () => {
    const { rerender } = render(<SplitTimeItem splitTime={mockSplitTime} index={0} />)
    
    expect(screen.getByText('50m')).toBeTruthy()
    
    rerender(<SplitTimeItem splitTime={mockSplitTime} index={1} />)
    
    expect(screen.getByText('50m')).toBeTruthy()
  })
})

