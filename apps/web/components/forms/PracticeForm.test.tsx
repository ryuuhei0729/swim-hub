import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import PracticeForm from './PracticeForm'

// Next.js Router をモック
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

describe('PracticeForm', () => {
  const mockOnClose = vi.fn()
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('レンダリング', () => {
    it('should render form when open', () => {
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      expect(screen.getByText('練習記録を追加')).toBeInTheDocument()
      expect(screen.getByLabelText('練習日')).toBeInTheDocument()
      expect(screen.getByLabelText('練習場所')).toBeInTheDocument()
      expect(screen.getByLabelText('メモ')).toBeInTheDocument()
    })

    it('should not render form when closed', () => {
      render(
        <PracticeForm
          isOpen={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      expect(screen.queryByText('練習記録を追加')).not.toBeInTheDocument()
    })
  })

  describe('フォーム入力', () => {
    it('should update form data when user types', async () => {
      const user = userEvent.setup()
      
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      const placeInput = screen.getByLabelText('練習場所')
      const noteInput = screen.getByLabelText('メモ')

      await user.type(placeInput, 'テストプール')
      await user.type(noteInput, 'テスト練習')

      expect(placeInput).toHaveValue('テストプール')
      expect(noteInput).toHaveValue('テスト練習')
    })

    it('should initialize with initialDate', () => {
      const initialDate = new Date('2025-01-15')
      
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          initialDate={initialDate}
        />
      )

      const dateInput = screen.getByLabelText('練習日')
      expect(dateInput).toHaveValue('2025-01-15')
    })

    it('should initialize with editData', () => {
      const editData = {
        date: '2025-01-15',
        place: '編集プール',
        memo: '編集メモ'
      }
      
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          editData={editData}
        />
      )

      expect(screen.getByLabelText('練習日')).toHaveValue('2025-01-15')
      expect(screen.getByLabelText('練習場所')).toHaveValue('編集プール')
      expect(screen.getByLabelText('メモ')).toHaveValue('編集メモ')
    })
  })

  describe('フォーム送信', () => {
    it('should call onSubmit with form data', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockResolvedValue(undefined)
      
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      const placeInput = screen.getByLabelText('練習場所')
      const noteInput = screen.getByLabelText('メモ')
      const submitButton = screen.getByRole('button', { name: '保存' })

      await user.type(placeInput, 'テストプール')
      await user.type(noteInput, 'テスト練習')
      await user.click(submitButton)

      expect(mockOnSubmit).toHaveBeenCalledWith({
        practiceDate: expect.any(String),
        place: 'テストプール',
        note: 'テスト練習'
      })
    })

    it('should show loading state when submitting', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      const submitButton = screen.getByRole('button', { name: '保存' })
      await user.click(submitButton)

      expect(screen.getByText('保存中...')).toBeInTheDocument()
    })

    it('should handle submission error', async () => {
      const user = userEvent.setup()
      const error = new Error('保存に失敗しました')
      mockOnSubmit.mockRejectedValue(error)
      
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      const submitButton = screen.getByRole('button', { name: '保存' })
      await user.click(submitButton)

      await waitFor(() => {
        // エラーメッセージはコンソールに出力されるが、UIには表示されない
      expect(mockOnSubmit).toHaveBeenCalled()
      })
    })
  })

  describe('フォームクローズ', () => {
    it('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      // XMarkIcon ボタンを探す（aria-label がないので role で探す）
      const closeButton = screen.getByRole('button', { name: '' })
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should reset form when closed', async () => {
      const user = userEvent.setup()
      
      const { rerender } = render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      const placeInput = screen.getByLabelText('場所')
      await user.type(placeInput, 'テストプール')

      // フォームを閉じて再度開く
      rerender(
        <PracticeForm
          isOpen={false}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      rerender(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      expect(screen.getByLabelText('練習場所')).toHaveValue('')
    })
  })

  describe('バリデーション', () => {
    it('should show error for empty required fields', async () => {
      const user = userEvent.setup()
      
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      const dateInput = screen.getByLabelText('練習日')
      await user.clear(dateInput)
      
      const submitButton = screen.getByRole('button', { name: '保存' })
      await user.click(submitButton)

      // HTML5のバリデーションが動作することを確認
      expect(dateInput).toBeInvalid()
    })
  })
})
