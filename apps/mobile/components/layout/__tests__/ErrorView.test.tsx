// =============================================================================
// ErrorView.test.tsx - エラー表示コンポーネントのテスト
// =============================================================================

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ErrorView } from '../ErrorView'

describe('ErrorView', () => {
  it('エラーメッセージが表示される', () => {
    render(<ErrorView message="エラーが発生しました" />)
    
    expect(screen.getByText('エラーが発生しました')).toBeTruthy()
  })

  it('デフォルトでアイコンが表示される', () => {
    render(<ErrorView message="エラー" />)
    
    expect(screen.getByText('⚠️')).toBeTruthy()
  })

  it('showIcon=falseの場合、アイコンが表示されない', () => {
    render(<ErrorView message="エラー" showIcon={false} />)
    
    expect(screen.queryByText('⚠️')).toBeNull()
  })

  it('onRetryが提供された場合、リトライボタンが表示される', () => {
    const onRetry = vi.fn()
    render(<ErrorView message="エラー" onRetry={onRetry} />)
    
    const retryButton = screen.getByText('再試行')
    expect(retryButton).toBeTruthy()
  })

  it('onRetryが提供されない場合、リトライボタンが表示されない', () => {
    render(<ErrorView message="エラー" />)
    
    expect(screen.queryByText('再試行')).toBeNull()
  })

  it('リトライボタンをタップするとonRetryが呼ばれる', () => {
    const onRetry = vi.fn()
    render(<ErrorView message="エラー" onRetry={onRetry} />)
    
    const retryButton = screen.getByText('再試行')
    fireEvent.click(retryButton)
    
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('フルスクリーン表示でエラービューが表示される', () => {
    render(<ErrorView message="エラー" fullScreen />)
    
    expect(screen.getByText('エラー')).toBeTruthy()
  })

  it('フルスクリーン表示とリトライボタンの両方が表示される', () => {
    const onRetry = vi.fn()
    render(<ErrorView message="エラー" fullScreen onRetry={onRetry} />)
    
    expect(screen.getByText('エラー')).toBeTruthy()
    expect(screen.getByText('再試行')).toBeTruthy()
  })
})

