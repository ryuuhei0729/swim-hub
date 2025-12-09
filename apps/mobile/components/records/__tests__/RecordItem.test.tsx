// =============================================================================
// RecordItem.test.tsx - 大会記録アイテムコンポーネントのテスト
// =============================================================================

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { RecordItem } from '../RecordItem'
import {
  createMockRecordWithDetails,
  createMockCompetition,
  createMockStyle,
} from '@/__mocks__/supabase'

describe('RecordItem', () => {
  const mockRecord = createMockRecordWithDetails({
    time: 60.5,
    competition: {
      ...createMockCompetition(),
      id: 'comp-1',
      title: 'テスト大会',
      date: '2025-01-15',
      place: 'テスト会場',
      pool_type: 1,
    },
    style: {
      ...createMockStyle(),
      id: 1,
      name_jp: '自由形',
      distance: 100,
    },
  })

  it('大会記録データが正しく表示される', () => {
    render(<RecordItem record={mockRecord} />)
    
    // 日付が表示される（フォーマットされた形式）
    expect(screen.getByText(/2025年1月15日/)).toBeTruthy()
    // 大会名が表示される
    expect(screen.getByText('テスト大会')).toBeTruthy()
    // 種目・距離が表示される
    expect(screen.getByText('自由形 100m')).toBeTruthy()
    // プールタイプが表示される
    expect(screen.getByText('長水路')).toBeTruthy()
  })

  it('大会名がnullの場合、「大会」が表示される', () => {
    const recordWithoutTitle = createMockRecordWithDetails({
      ...mockRecord,
      competition: {
        ...mockRecord.competition!,
        title: null,
      },
    })
    
    render(<RecordItem record={recordWithoutTitle} />)
    
    expect(screen.getByText('大会')).toBeTruthy()
  })

  it('タイムが正しくフォーマットされて表示される', () => {
    render(<RecordItem record={mockRecord} />)
    
    // formatTime(60.5) = "1:00.50"
    expect(screen.getByText('1:00.50')).toBeTruthy()
  })

  it('短水路の場合、プールタイプが「短水路」と表示される', () => {
    const shortCourseRecord = createMockRecordWithDetails({
      ...mockRecord,
      competition: {
        ...mockRecord.competition!,
        pool_type: 0,
      },
    })
    
    render(<RecordItem record={shortCourseRecord} />)
    
    expect(screen.getByText('短水路')).toBeTruthy()
  })

  it('場所がnullの場合、場所が表示されない', () => {
    const recordWithoutPlace = createMockRecordWithDetails({
      ...mockRecord,
      competition: {
        ...mockRecord.competition!,
        place: null,
      },
    })
    
    render(<RecordItem record={recordWithoutPlace} />)
    
    expect(screen.queryByText(/📍/)).toBeNull()
  })

  it('onPressが提供された場合、タップでコールバックが呼ばれる', () => {
    const onPress = vi.fn()
    render(<RecordItem record={mockRecord} onPress={onPress} />)
    
    // Pressableをタップ（button要素としてレンダリングされる）
    const pressable = screen.getByText('テスト大会').closest('button')
    expect(pressable).not.toBeNull()

    fireEvent.click(pressable!)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledWith(mockRecord)
  })

  it('onPressが提供されない場合でもエラーが発生しない', () => {
    render(<RecordItem record={mockRecord} />)
    
    // エラーなくレンダリングされる
    expect(screen.getByText('テスト大会')).toBeTruthy()
  })
})

