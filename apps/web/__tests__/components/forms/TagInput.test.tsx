import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import TagInput from '../../../components/forms/TagInput'

// Supabase クライアントをモック
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'new-tag', name: '新規タグ' }, error: null }))
        }))
      }))
    }))
  }))
}))

// TagManagementModal をモック
vi.mock('./TagManagementModal', () => ({
  default: function MockTagManagementModal({ isOpen, onClose, onSave }: any) {
    return isOpen ? (
      <div data-testid="tag-management-modal">
        <button onClick={onClose}>閉じる</button>
        <button onClick={() => onSave({ id: 'edited-tag', name: '編集済みタグ' })}>保存</button>
      </div>
    ) : null
  }
}))

describe.skip('TagInput', () => {
  const mockOnTagsChange = vi.fn()
  const mockOnAvailableTagsUpdate = vi.fn()
  
  const mockAvailableTags = [
    { id: '1', name: 'フリー', color: '#3B82F6', user_id: 'user-1', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
    { id: '2', name: 'バック', color: '#10B981', user_id: 'user-1', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
    { id: '3', name: 'ブレ', color: '#F59E0B', user_id: 'user-1', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  ]

  const mockSelectedTags = [
    { id: '1', name: 'フリー', color: '#3B82F6', user_id: 'user-1', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('レンダリング', () => {
    it('should render selected tags', () => {
      render(
        <TagInput
          selectedTags={mockSelectedTags}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      expect(screen.getByText('フリー')).toBeInTheDocument()
    })

    it('should render placeholder when no tags selected', () => {
      render(
        <TagInput
          selectedTags={[]}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      expect(screen.getByText('タグを選択または作成')).toBeInTheDocument()
    })
  })

  describe('ドロップダウン', () => {
    it('should open dropdown when clicked', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={[]}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const input = screen.getByRole('textbox')
      await user.click(input)

      expect(screen.getByText('フリー')).toBeInTheDocument()
      expect(screen.getByText('バック')).toBeInTheDocument()
      expect(screen.getByText('ブレ')).toBeInTheDocument()
    })

    it('should close dropdown when clicking outside', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={[]}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const input = screen.getByRole('textbox')
      await user.click(input)

      expect(screen.getByText('フリー')).toBeInTheDocument()

      // 外部をクリック
      await user.click(document.body)

      expect(screen.queryByText('フリー')).not.toBeInTheDocument()
    })
  })

  describe('タグ選択', () => {
    it('should add tag when clicked', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={[]}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const input = screen.getByRole('textbox')
      await user.click(input)

      const tagButton = screen.getByText('フリー')
      await user.click(tagButton)

      expect(mockOnTagsChange).toHaveBeenCalledWith([mockAvailableTags[0]])
    })

    it('should not show already selected tags', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={mockSelectedTags}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const input = screen.getByRole('textbox')
      await user.click(input)

      // 既に選択されているタグは表示されない
      expect(screen.queryByText('フリー')).not.toBeInTheDocument()
      expect(screen.getByText('バック')).toBeInTheDocument()
      expect(screen.getByText('ブレ')).toBeInTheDocument()
    })
  })

  describe('タグ削除', () => {
    it('should remove tag when X button is clicked', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={mockSelectedTags}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const removeButton = screen.getByRole('button', { name: /削除/i })
      await user.click(removeButton)

      expect(mockOnTagsChange).toHaveBeenCalledWith([])
    })
  })

  describe('タグ検索', () => {
    it('should filter tags based on input', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={[]}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.type(input, 'フ')

      expect(screen.getByText('フリー')).toBeInTheDocument()
      expect(screen.queryByText('バック')).not.toBeInTheDocument()
      expect(screen.queryByText('ブレ')).not.toBeInTheDocument()
    })

    it('should show "新規作成" option when no matching tags', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={[]}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.type(input, '新しいタグ')

      expect(screen.getByText('「新しいタグ」を新規作成')).toBeInTheDocument()
    })
  })

  describe('新規タグ作成', () => {
    it('should create new tag when "新規作成" is clicked', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={[]}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.type(input, '新しいタグ')

      const createButton = screen.getByText('「新しいタグ」を新規作成')
      await user.click(createButton)

      await waitFor(() => {
        expect(mockOnTagsChange).toHaveBeenCalledWith([
          expect.objectContaining({ name: '新規タグ' })
        ])
      })
    })
  })

  describe('タグ管理', () => {
    it('should open tag management modal', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={mockSelectedTags}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const manageButton = screen.getByRole('button', { name: /管理/i })
      await user.click(manageButton)

      expect(screen.getByTestId('tag-management-modal')).toBeInTheDocument()
    })

    it('should close tag management modal', async () => {
      const user = userEvent.setup()
      
      render(
        <TagInput
          selectedTags={mockSelectedTags}
          availableTags={mockAvailableTags}
          onTagsChange={mockOnTagsChange}
          onAvailableTagsUpdate={mockOnAvailableTagsUpdate}
        />
      )

      const manageButton = screen.getByRole('button', { name: /管理/i })
      await user.click(manageButton)

      const closeButton = screen.getByText('閉じる')
      await user.click(closeButton)

      expect(screen.queryByTestId('tag-management-modal')).not.toBeInTheDocument()
    })
  })
})
