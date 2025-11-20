import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TagManagementModal from '@/components/forms/TagManagementModal'
import { PracticeTag } from '@apps/shared/types/database'

const mockTag = {
  id: 'tag-1',
  user_id: 'user-1',
  name: 'ストローク',
  color: '#abc',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
} satisfies PracticeTag

const baseProps = () => ({
  isOpen: true,
  onClose: vi.fn(),
  tag: { ...mockTag },
  onUpdateTag: vi.fn().mockResolvedValue(undefined),
  onDeleteTag: vi.fn().mockResolvedValue(undefined),
})

describe('TagManagementModal', () => {
  it('カスタムカラーが正規化され、開いているときに表示される', () => {
    const props = baseProps()
    render(<TagManagementModal {...props} />)

    // 3桁HEXは6桁に正規化されて表示される
    const normalizedColorButton = screen.getByTitle('#aabbcc')
    expect(normalizedColorButton).toBeInTheDocument()

    // プレビューにタグ名が表示される
    expect(screen.getByText('ストローク')).toBeInTheDocument()
  })

  it('正規化されたカラーとともにonUpdateTagが呼ばれ、モーダルが閉じられる', async () => {
    const user = userEvent.setup()
    const props = baseProps()
    render(<TagManagementModal {...props} />)

    // タグ名を更新
    const nameInput = screen.getByPlaceholderText('タグ名を入力')
    await user.clear(nameInput)
    await user.type(nameInput, 'フォームテスト')

    // 別の色を選択
    const colorButton = screen.getByTitle('#93c5fd')
    await user.click(colorButton)

    // 更新ボタンをクリック
    const updateButton = screen.getByRole('button', { name: '更新' })
    await user.click(updateButton)

    await waitFor(() => {
      expect(props.onUpdateTag).toHaveBeenCalledWith('tag-1', 'フォームテスト', '#93c5fd')
      expect(props.onClose).toHaveBeenCalled()
    })
  })

  it('削除確認モーダルが開き、削除が実行される', async () => {
    const user = userEvent.setup()
    const props = baseProps()
    render(<TagManagementModal {...props} />)

    // 削除フローを開始
    const deleteButton = screen.getByRole('button', { name: /削除/ })
    await user.click(deleteButton)

    // 確認モーダルの削除ボタンを押下
    const deleteButtons = await screen.findAllByRole('button', { name: '削除' })
    await user.click(deleteButtons[1])

    await waitFor(() => {
      expect(props.onDeleteTag).toHaveBeenCalledWith('tag-1')
      expect(props.onClose).toHaveBeenCalled()
    })
  })

  it('閉じているとき何も表示されない', () => {
    const props = baseProps()
    render(<TagManagementModal {...props} isOpen={false} />)

    expect(screen.queryByText('タグの管理')).not.toBeInTheDocument()
  })
})


