import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import RecordForm from './RecordForm'

// Next.js Router をモック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// ユーティリティ関数をモック
vi.mock('@/utils/formatters', () => ({
  formatTime: vi.fn((time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    const milliseconds = Math.floor((time % 1) * 100)
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`
  }),
}))

describe('RecordForm', () => {
  const mockOnClose = vi.fn()
  const mockOnSubmit = vi.fn()
  const mockStyles = [
    { id: '1', nameJp: '自由形', distance: 50 },
    { id: '2', nameJp: '背泳ぎ', distance: 100 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('レンダリング', () => {
    it('should render form when open', () => {
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      expect(screen.getByText('記録を追加')).toBeInTheDocument()
      expect(screen.getByLabelText('記録日')).toBeInTheDocument()
      expect(screen.getByLabelText('場所')).toBeInTheDocument()
      expect(screen.getByLabelText('大会名')).toBeInTheDocument()
    })

    it('should not render form when closed', () => {
      render(
        <RecordForm
          isOpen={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      expect(screen.queryByText('記録を追加')).not.toBeInTheDocument()
    })
  })

  describe('記録セットの管理', () => {
    it('should add new record set', async () => {
      const user = userEvent.setup()
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      const addButton = screen.getByText('記録を追加')
      await user.click(addButton)

      expect(screen.getByText('記録セット 1')).toBeInTheDocument()
    })

    it('should remove record set', async () => {
      const user = userEvent.setup()
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // 記録セットを追加
      const addButton = screen.getByText('記録を追加')
      await user.click(addButton)

      // 削除ボタンをクリック
      const removeButton = screen.getByRole('button', { name: /削除/i })
      await user.click(removeButton)

      expect(screen.queryByText('記録セット 1')).not.toBeInTheDocument()
    })
  })

  describe('記録入力', () => {
    it('should update record time', async () => {
      const user = userEvent.setup()
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // 記録セットを追加
      const addButton = screen.getByText('記録を追加')
      await user.click(addButton)

      const timeInput = screen.getByLabelText(/タイム/i)
      await user.type(timeInput, '1:30.50')

      expect(timeInput).toHaveValue('1:30.50')
    })

    it('should select style', async () => {
      const user = userEvent.setup()
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // 記録セットを追加
      const addButton = screen.getByText('記録を追加')
      await user.click(addButton)

      const styleSelect = screen.getByLabelText(/種目/i)
      await user.selectOptions(styleSelect, '1')

      expect(styleSelect).toHaveValue('1')
    })

    it('should toggle relay mode', async () => {
      const user = userEvent.setup()
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // 記録セットを追加
      const addButton = screen.getByText('記録を追加')
      await user.click(addButton)

      const relayCheckbox = screen.getByLabelText(/リレー/i)
      await user.click(relayCheckbox)

      expect(relayCheckbox).toBeChecked()
    })
  })

  describe('スプリットタイム', () => {
    it('should add split time', async () => {
      const user = userEvent.setup()
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // 記録セットを追加
      const addButton = screen.getByText('記録を追加')
      await user.click(addButton)

      // リレーモードを有効化
      const relayCheckbox = screen.getByLabelText(/リレー/i)
      await user.click(relayCheckbox)

      const addSplitButton = screen.getByText('スプリットを追加')
      await user.click(addSplitButton)

      expect(screen.getByText('スプリット 1')).toBeInTheDocument()
    })

    it('should remove split time', async () => {
      const user = userEvent.setup()
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // 記録セットを追加
      const addButton = screen.getByText('記録を追加')
      await user.click(addButton)

      // リレーモードを有効化
      const relayCheckbox = screen.getByLabelText(/リレー/i)
      await user.click(relayCheckbox)

      // スプリットを追加
      const addSplitButton = screen.getByText('スプリットを追加')
      await user.click(addSplitButton)

      // スプリットを削除
      const removeSplitButton = screen.getByRole('button', { name: /削除/i })
      await user.click(removeSplitButton)

      expect(screen.queryByText('スプリット 1')).not.toBeInTheDocument()
    })
  })

  describe('フォーム送信', () => {
    it('should call onSubmit with form data', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockResolvedValue(undefined)
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // 基本情報を入力
      const locationInput = screen.getByLabelText('場所')
      const competitionInput = screen.getByLabelText('大会名')
      
      await user.type(locationInput, 'テストプール')
      await user.type(competitionInput, 'テスト大会')

      // 記録セットを追加
      const addButton = screen.getByText('記録を追加')
      await user.click(addButton)

      // 記録を入力
      const timeInput = screen.getByLabelText(/タイム/i)
      await user.type(timeInput, '1:30.50')

      const styleSelect = screen.getByLabelText(/種目/i)
      await user.selectOptions(styleSelect, '1')

      // 送信
      const submitButton = screen.getByRole('button', { name: '保存' })
      await user.click(submitButton)

      expect(mockOnSubmit).toHaveBeenCalledWith({
        recordDate: expect.any(String),
        location: 'テストプール',
        competitionName: 'テスト大会',
        poolType: 0,
        records: expect.arrayContaining([
          expect.objectContaining({
            styleId: '1',
            time: expect.any(Number),
            isRelaying: false,
            splitTimes: [],
            note: '',
          })
        ]),
        note: ''
      })
    })

    it('should show loading state when submitting', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      const submitButton = screen.getByRole('button', { name: '保存' })
      await user.click(submitButton)

      expect(screen.getByText('保存中...')).toBeInTheDocument()
    })
  })

  describe('フォームクローズ', () => {
    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      const closeButton = screen.getByRole('button', { name: /閉じる/i })
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })
})
