// =============================================================================
// LoadingSpinner.test.tsx - ローディングスピナーコンポーネントのテスト
// =============================================================================

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LoadingSpinner } from '../LoadingSpinner'

describe('LoadingSpinner', () => {
  it('デフォルトでローディングスピナーが表示される', () => {
    render(<LoadingSpinner />)
    
    // ActivityIndicatorが表示される（テキストで確認）
    const loadingText = screen.getByText('Loading...')
    expect(loadingText).toBeTruthy()
  })

  it('フルスクリーン表示でローディングスピナーが表示される', () => {
    render(<LoadingSpinner fullScreen />)
    
    const loadingText = screen.getByText('Loading...')
    expect(loadingText).toBeTruthy()
  })

  it('メッセージが表示される', () => {
    render(<LoadingSpinner message="読み込み中..." />)
    
    expect(screen.getByText('読み込み中...')).toBeTruthy()
  })

  it('メッセージがない場合は表示されない', () => {
    render(<LoadingSpinner />)
    
    expect(screen.queryByText('読み込み中...')).toBeNull()
  })

  it('smallサイズでローディングスピナーが表示される', () => {
    render(<LoadingSpinner size="small" />)
    
    const loadingText = screen.getByText('Loading...')
    expect(loadingText).toBeTruthy()
  })

  it('largeサイズでローディングスピナーが表示される', () => {
    render(<LoadingSpinner size="large" />)
    
    const loadingText = screen.getByText('Loading...')
    expect(loadingText).toBeTruthy()
  })

  it('カスタムカラーでローディングスピナーが表示される', () => {
    render(<LoadingSpinner color="#FF0000" />)
    
    const loadingText = screen.getByText('Loading...')
    expect(loadingText).toBeTruthy()
  })

  it('フルスクリーン表示とメッセージの両方が表示される', () => {
    render(<LoadingSpinner fullScreen message="データを読み込み中..." />)
    
    expect(screen.getByText('Loading...')).toBeTruthy()
    expect(screen.getByText('データを読み込み中...')).toBeTruthy()
  })
})
