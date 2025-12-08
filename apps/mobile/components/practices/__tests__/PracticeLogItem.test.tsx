// =============================================================================
// PracticeLogItem.test.tsx - 練習ログアイテムコンポーネントのテスト
// =============================================================================

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PracticeLogItem } from '../PracticeLogItem'
import type { PracticeLogWithTags } from '@swim-hub/shared/types/database'

describe('PracticeLogItem', () => {
  const mockLog: PracticeLogWithTags = {
    id: 'log-1',
    user_id: 'user-1',
    practice_id: 'practice-1',
    distance: 100,
    rep_count: 4,
    set_count: 2,
    circle: 90,
    style: 'freestyle',
    note: 'テストメモ',
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-15T10:00:00Z',
    practice_times: [
      {
        id: 'time-1',
        practice_log_id: 'log-1',
        set_number: 1,
        rep_number: 1,
        time: 60.5,
        created_at: '2025-01-15T10:00:00Z',
      },
      {
        id: 'time-2',
        practice_log_id: 'log-1',
        set_number: 1,
        rep_number: 2,
        time: 61.0,
        created_at: '2025-01-15T10:00:00Z',
      },
    ],
    practice_log_tags: [
      {
        id: 'lt-1',
        practice_log_id: 'log-1',
        tag_id: 'tag-1',
        practice_tags: {
          id: 'tag-1',
          name: 'テストタグ',
          color: '#FF0000',
          user_id: 'user-1',
          created_at: '2025-01-15T10:00:00Z',
        },
      },
    ],
  }

  it('練習ログデータが正しく表示される', () => {
    render(<PracticeLogItem log={mockLog} />)
    
    // 種目が表示される
    expect(screen.getByText('freestyle')).toBeTruthy()
    // 距離が表示される
    expect(screen.getByText('100m')).toBeTruthy()
    // セット数×レップ数が表示される
    expect(screen.getByText('2×4')).toBeTruthy()
    // 周回数が表示される
    expect(screen.getByText('90周')).toBeTruthy()
  })

  it('タイム一覧が表示される', () => {
    render(<PracticeLogItem log={mockLog} />)
    
    // タイムラベルが表示される
    expect(screen.getByText('タイム:')).toBeTruthy()
    // タイム値が表示される（フォーマットされた形式）
    expect(screen.getByText('1:00.50')).toBeTruthy() // formatTime(60.5)
    expect(screen.getByText('1:01.00')).toBeTruthy() // formatTime(61.0)
  })

  it('タグが表示される', () => {
    render(<PracticeLogItem log={mockLog} />)
    
    expect(screen.getByText('テストタグ')).toBeTruthy()
  })

  it('タグがない場合、タグが表示されない', () => {
    const logWithoutTags: PracticeLogWithTags = {
      ...mockLog,
      practice_log_tags: [],
    }
    
    render(<PracticeLogItem log={logWithoutTags} />)
    
    expect(screen.queryByText('テストタグ')).toBeNull()
  })

  it('メモが表示される', () => {
    render(<PracticeLogItem log={mockLog} />)
    
    expect(screen.getByText('テストメモ')).toBeTruthy()
  })

  it('メモがnullの場合、メモが表示されない', () => {
    const logWithoutNote: PracticeLogWithTags = {
      ...mockLog,
      note: null,
    }
    
    render(<PracticeLogItem log={logWithoutNote} />)
    
    expect(screen.queryByText('テストメモ')).toBeNull()
  })

  it('タイムがない場合、タイムセクションが表示されない', () => {
    const logWithoutTimes: PracticeLogWithTags = {
      ...mockLog,
      practice_times: [],
    }
    
    render(<PracticeLogItem log={logWithoutTimes} />)
    
    expect(screen.queryByText('タイム:')).toBeNull()
  })

  it('circleがnullの場合、周回数が表示されない', () => {
    const logWithoutCircle: PracticeLogWithTags = {
      ...mockLog,
      circle: null,
    }
    
    render(<PracticeLogItem log={logWithoutCircle} />)
    
    expect(screen.queryByText(/周/)).toBeNull()
  })
})
