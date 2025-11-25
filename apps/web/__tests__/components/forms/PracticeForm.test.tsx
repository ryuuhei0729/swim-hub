import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import PracticeForm from '../../../components/forms/PracticeForm'

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
    it('フォームが開いているときに表示される', () => {
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

    it('フォームが閉じているときに表示されない', () => {
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
    it('ユーザーが入力したときフォームデータが更新される', async () => {
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

    it('初期日付を指定したときその日付で初期化される', () => {
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

    it('編集データを指定したときそのデータで初期化される', async () => {
      const editData = {
        date: '2025-01-15',
        place: '編集プール',
        note: '編集メモ'
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
      await waitFor(() => {
      expect(screen.getByLabelText('メモ')).toHaveValue('編集メモ')
      })
    })
  })

  describe('フォーム送信', () => {
    it('フォームデータとともにonSubmitが呼ばれる', async () => {
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

    it('送信中はローディング状態が表示される', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      const { rerender } = render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      const placeInput = screen.getByLabelText('練習場所')
      await user.type(placeInput, 'テストプール')

      const submitButton = screen.getByRole('button', { name: '保存' })
      await user.click(submitButton)

      rerender(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          isLoading={true}
        />
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '保存中...' })).toBeInTheDocument()
      })
    })

    it('送信エラーが発生したときエラーを処理できる', async () => {
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

      const placeInput = screen.getByLabelText('練習場所')
      await user.type(placeInput, 'テストプール')

      const submitButton = screen.getByRole('button', { name: '保存' })
      await user.click(submitButton)

      await waitFor(() => {
        // エラーメッセージはコンソールに出力されるが、UIには表示されない
      expect(mockOnSubmit).toHaveBeenCalled()
      })
    })
  })

  describe('フォームクローズ', () => {
    it('閉じるボタンをクリックしたときonCloseが呼ばれる', async () => {
      const user = userEvent.setup()
      
      render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      const closeButton = screen.getByRole('button', { name: '閉じる' })
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('フォームが閉じられたときフォームがリセットされる', async () => {
      const user = userEvent.setup()
      
      const { rerender } = render(
        <PracticeForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      )

      const placeInput = screen.getByLabelText('練習場所')
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
    it('必須項目が空のときエラーが表示される', async () => {
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
