import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import RecordForm from '../../../components/forms/RecordForm'

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
    it('フォームが開いているときに表示される', () => {
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      expect(screen.getByText('大会記録を追加')).toBeInTheDocument()
      // DatePickerはbutton要素を使用しているため、getByLabelTextではなくgetByTextでラベルを確認
      expect(screen.getByText('大会日')).toBeInTheDocument()
      expect(screen.getByLabelText('開催地')).toBeInTheDocument()
      expect(screen.getByLabelText('大会名')).toBeInTheDocument()
    })

    it('フォームが閉じているときに表示されない', () => {
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
    it('新しい記録セットを追加できる', async () => {
      const user = userEvent.setup()
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      const addButton = screen.getByText('種目を追加')
      await user.click(addButton)

      expect(screen.getByText('種目 2')).toBeInTheDocument()
    })

    it('記録セットを削除できる', async () => {
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
      const addButton = screen.getByText('種目を追加')
      await user.click(addButton)

      // 削除ボタンをクリック
      const removeButtons = screen.getAllByRole('button', { name: '種目を削除' })
      await user.click(removeButtons[1])

      expect(screen.queryByText('種目 2')).not.toBeInTheDocument()
    })
  })

  describe('記録入力', () => {
    it('記録タイムを更新できる', async () => {
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
      const addButton = screen.getByText('種目を追加')
      await user.click(addButton)

      const timeInputs = screen.getAllByLabelText('タイム')
      const timeInput = timeInputs[timeInputs.length - 1]
      await user.type(timeInput, '1:30.50')

      expect(timeInput).toHaveValue('1:30.50')
    })

    it('種目を選択できる', async () => {
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
      const addButton = screen.getByText('種目を追加')
      await user.click(addButton)

      const styleSelects = screen.getAllByLabelText('種目')
      const styleSelect = styleSelects[styleSelects.length - 1]
      await user.selectOptions(styleSelect, '1')

      expect(styleSelect).toHaveValue('1')
    })

    it('リレーモードを切り替えられる', async () => {
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
      const addButton = screen.getByText('種目を追加')
      await user.click(addButton)

      const relayCheckboxes = screen.getAllByLabelText('リレー')
      const relayCheckbox = relayCheckboxes[relayCheckboxes.length - 1]
      await user.click(relayCheckbox)

      expect(relayCheckbox).toBeChecked()
    })
  })

  describe('スプリットタイム', () => {
    it('スプリットタイムを追加できる', async () => {
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
      const addButton = screen.getByText('種目を追加')
      await user.click(addButton)

      // リレーモードを有効化
      const relayCheckboxes = screen.getAllByLabelText('リレー')
      const relayCheckbox = relayCheckboxes[relayCheckboxes.length - 1]
      await user.click(relayCheckbox)

      const addSplitButtons = screen.getAllByText('スプリットを追加')
      await user.click(addSplitButtons[addSplitButtons.length - 1])

      expect(screen.getAllByPlaceholderText('距離 (m)')).toHaveLength(1)
    })

    it('スプリットタイムを削除できる', async () => {
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
      const addButton = screen.getByText('種目を追加')
      await user.click(addButton)

      // リレーモードを有効化
      const relayCheckboxes = screen.getAllByLabelText('リレー')
      const relayCheckbox = relayCheckboxes[relayCheckboxes.length - 1]
      await user.click(relayCheckbox)

      // スプリットを追加
      const addSplitButtons = screen.getAllByText('スプリットを追加')
      await user.click(addSplitButtons[addSplitButtons.length - 1])

      const removeSplitButton = screen.getByRole('button', { name: 'スプリットを削除' })
      await user.click(removeSplitButton)

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('距離 (m)')).toBeNull()
      })
    })
  })

  describe('フォーム送信', () => {
    it('フォームデータとともにonSubmitが呼ばれる', async () => {
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
      const locationInput = screen.getByLabelText('開催地')
      const competitionInput = screen.getByLabelText('大会名')
      
      await user.type(locationInput, 'テストプール')
      await user.type(competitionInput, 'テスト大会')

      // 記録を入力
      const timeInputs = screen.getAllByLabelText('タイム')
      const timeInput = timeInputs[0]
      await user.type(timeInput, '1:30.50')

      const styleSelects = screen.getAllByLabelText('種目')
      const styleSelect = styleSelects[0]
      await user.selectOptions(styleSelect, '1')

      // 送信
      const submitButton = screen.getByRole('button', { name: '保存' })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalled()
      })

      // 実際の呼び出し引数を確認（sanitizedDataが送られる）
      const callArgs = mockOnSubmit.mock.calls[0][0]
      expect(callArgs).toMatchObject({
        recordDate: expect.any(String),
        place: 'テストプール',
        competitionName: 'テスト大会',
        poolType: 0,
        records: expect.arrayContaining([
          expect.objectContaining({
            styleId: '1',
            time: expect.any(Number),
            isRelaying: false,
            note: '',
          })
        ]),
        note: ''
      })
      // splitTimesは配列であることを確認（空でもOK）
      expect(Array.isArray(callArgs.records[0].splitTimes)).toBe(true)
    })

    it('送信中はローディング状態が表示される', async () => {
      const user = userEvent.setup()
      mockOnSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
          isLoading={true}
        />
      )

      const submitButton = screen.getByRole('button', { name: '保存中...' })
      await user.click(submitButton)

      expect(screen.getByRole('button', { name: '保存中...' })).toBeInTheDocument()
    })
  })

  describe('フォームクローズ', () => {
    it('変更がない状態で閉じるボタンをクリックしたときonCloseが呼ばれる', async () => {
      const user = userEvent.setup()

      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      const closeButton = screen.getByRole('button', { name: 'キャンセル' })
      await user.click(closeButton)

      // 初期状態では変更がないので直接閉じる、または確認ダイアログが表示される
      // 確認ダイアログが表示された場合は「閉じる」をクリック
      const dialog = screen.queryByRole('dialog')
      if (dialog) {
        const confirmCloseButton = within(dialog).getByRole('button', { name: '閉じる' })
        await user.click(confirmCloseButton)
      }

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('未保存の変更がある場合は確認ダイアログが表示される', async () => {
      const user = userEvent.setup()

      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // フォームに変更を加える
      const locationInput = screen.getByLabelText('開催地')
      await user.type(locationInput, 'テストプール')

      // キャンセルボタンをクリック
      const closeButton = screen.getByRole('button', { name: 'キャンセル' })
      await user.click(closeButton)

      // 確認ダイアログが表示される
      await waitFor(() => {
        expect(screen.getByText('入力内容が保存されていません')).toBeInTheDocument()
      })
    })

    it('確認ダイアログで「閉じる」を選択するとフォームが閉じる', async () => {
      const user = userEvent.setup()

      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // フォームに変更を加える
      const locationInput = screen.getByLabelText('開催地')
      await user.type(locationInput, 'テストプール')

      // キャンセルボタンをクリック
      const closeButton = screen.getByRole('button', { name: 'キャンセル' })
      await user.click(closeButton)

      // 確認ダイアログで「閉じる」をクリック
      await waitFor(() => {
        expect(screen.getByText('入力内容が保存されていません')).toBeInTheDocument()
      })

      // 確認ダイアログ内の「閉じる」ボタンを取得（role="dialog"の中）
      const dialog = screen.getByRole('dialog')
      const confirmCloseButton = within(dialog).getByRole('button', { name: '閉じる' })
      await user.click(confirmCloseButton)

      expect(mockOnClose).toHaveBeenCalled()
    })

    it('確認ダイアログで「編集を続ける」を選択するとダイアログが閉じる', async () => {
      const user = userEvent.setup()

      render(
        <RecordForm
          isOpen={true}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          styles={mockStyles}
        />
      )

      // フォームに変更を加える
      const locationInput = screen.getByLabelText('開催地')
      await user.type(locationInput, 'テストプール')

      // キャンセルボタンをクリック
      const closeButton = screen.getByRole('button', { name: 'キャンセル' })
      await user.click(closeButton)

      // 確認ダイアログで「編集を続ける」をクリック
      await waitFor(() => {
        expect(screen.getByText('入力内容が保存されていません')).toBeInTheDocument()
      })

      const continueEditButton = screen.getByRole('button', { name: '編集を続ける' })
      await user.click(continueEditButton)

      // ダイアログが閉じる
      await waitFor(() => {
        expect(screen.queryByText('入力内容が保存されていません')).not.toBeInTheDocument()
      })

      // onCloseは呼ばれていない
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })
})
