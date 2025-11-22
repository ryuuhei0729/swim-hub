import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import TagInput from '@/components/forms/TagInput'
import { PracticeTag } from '@apps/shared/types/database'

const mockedUseAuth = vi.hoisted(() => vi.fn())

vi.mock('@/contexts', () => ({
  useAuth: mockedUseAuth,
}))

const makeTag = (overrides: Partial<PracticeTag> = {}): PracticeTag => ({
  id: 'tag-default',
  user_id: 'user-1',
  name: 'タグ',
  color: '#93C5FD',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
})

const createSupabaseMock = () => {
  const insertedTag = makeTag({
    id: 'tag-new',
    name: '新タグ',
  })

  const singleMock = vi.fn().mockResolvedValue({ data: insertedTag, error: null })
  const selectMock = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectMock }))

  const updateSecondEqMock = vi.fn().mockResolvedValue({ error: null })
  const updateFirstEqMock = vi.fn().mockImplementation(() => ({
    eq: updateSecondEqMock,
  }))
  const updateMock = vi.fn(() => ({
    eq: updateFirstEqMock,
  }))

  const deleteEqSecondMock = vi.fn().mockImplementation(() => Promise.resolve({ error: null }))
  const deleteEqFirstMock = vi.fn().mockImplementation(() => ({
    eq: deleteEqSecondMock,
  }))
  const deleteMock = vi.fn(() => ({
    eq: deleteEqFirstMock,
  }))

  const fromMock = vi.fn(() => ({
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
  }))

  const getUserMock = vi.fn().mockResolvedValue({
    data: { user: { id: 'user-1' } },
  })

  return {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
    _mocks: {
      insertedTag,
      selectMock,
      insertMock,
      singleMock,
      updateFirstEqMock,
      updateSecondEqMock,
      deleteEqFirstMock,
      deleteEqSecondMock,
    },
  }
}

describe('TagInput', () => {
  beforeEach(() => {
    mockedUseAuth.mockReset()
  })

  it('利用可能なタグをフィルタリングし、選択を切り替えられる', async () => {
    const supabase = createSupabaseMock()
    mockedUseAuth.mockReturnValue({ supabase })

    const onTagsChange = vi.fn()
    const availableTags: PracticeTag[] = [
      makeTag({ id: 'tag-1', name: 'フォーム', color: '#93C5FD' }),
      makeTag({ id: 'tag-2', name: 'キック', color: '#A3E635' }),
    ]

    render(
      <TagInput
        selectedTags={[]}
        availableTags={availableTags}
        onTagsChange={onTagsChange}
        onAvailableTagsUpdate={vi.fn()}
      />
    )

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText('タグを選択または作成')
    await user.click(input)

    const tagOption = await screen.findByText('フォーム')
    await user.click(tagOption)

    expect(onTagsChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'tag-1', name: 'フォーム', color: '#93C5FD' }),
    ])
  })

  it('Enterキーが押されたとき新しいタグを作成する', async () => {
    const supabase = createSupabaseMock()
    mockedUseAuth.mockReturnValue({ supabase })

    const onTagsChange = vi.fn()
    const onAvailableTagsUpdate = vi.fn()

    // 固定カラーを返すために Math.random をモック
    const originalRandom = Math.random
    Math.random = vi.fn().mockReturnValue(0)

    render(
      <TagInput
        selectedTags={[]}
        availableTags={[]}
        onTagsChange={onTagsChange}
        onAvailableTagsUpdate={onAvailableTagsUpdate}
      />
    )

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText('タグを選択または作成')
    await user.type(input, '新タグ')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('practice_tags')
      expect(onAvailableTagsUpdate).toHaveBeenCalledWith([
        supabase._mocks.insertedTag,
      ])
      expect(onTagsChange).toHaveBeenCalledWith([
        supabase._mocks.insertedTag,
      ])
      expect(input).toHaveValue('')
    })

    Math.random = originalRandom
  })

  it('管理モーダルを通じてタグを更新する', async () => {
    const supabase = createSupabaseMock()
    mockedUseAuth.mockReturnValue({ supabase })

    const onTagsChange = vi.fn()
    const onAvailableTagsUpdate = vi.fn()

    const availableTags: PracticeTag[] = [
      makeTag({ id: 'tag-2', name: 'キック', color: '#A3E635' }),
    ]

    render(
      <TagInput
        selectedTags={[]}
        availableTags={availableTags}
        onTagsChange={onTagsChange}
        onAvailableTagsUpdate={onAvailableTagsUpdate}
      />
    )

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText('タグを選択または作成')
    await user.click(input)

    const manageButton = await screen.findByTitle('タグを管理')
    await user.click(manageButton)

    const modalInput = await screen.findByPlaceholderText('タグ名を入力')
    await user.clear(modalInput)
    await user.type(modalInput, '更新タグ')

    const updateButton = screen.getByRole('button', { name: '更新' })
    await user.click(updateButton)

    await waitFor(() => {
      expect(supabase._mocks.updateFirstEqMock).toHaveBeenCalledWith('id', 'tag-2')
      expect(supabase._mocks.updateSecondEqMock).toHaveBeenCalledWith('user_id', 'user-1')
      expect(onAvailableTagsUpdate).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'tag-2', name: '更新タグ', color: '#a3e635' }),
      ])
    })
  })

  it('管理モーダルを通じてタグを削除する', async () => {
    const supabase = createSupabaseMock()
    mockedUseAuth.mockReturnValue({ supabase })

    const onTagsChange = vi.fn()
    const onAvailableTagsUpdate = vi.fn()

    const availableTags: PracticeTag[] = [
      makeTag({ id: 'tag-2', name: 'キック', color: '#A3E635' }),
    ]

    render(
      <TagInput
        selectedTags={[]}
        availableTags={availableTags}
        onTagsChange={onTagsChange}
        onAvailableTagsUpdate={onAvailableTagsUpdate}
      />
    )

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText('タグを選択または作成')
    await user.click(input)

    const manageButton = await screen.findByTitle('タグを管理')
    await user.click(manageButton)

    const deleteButton = screen.getByRole('button', { name: /削除/ })
    await user.click(deleteButton)

    const confirmButtons = await screen.findAllByRole('button', { name: '削除' })
    await user.click(confirmButtons[1])

    await waitFor(() => {
      expect(supabase._mocks.deleteEqFirstMock).toHaveBeenCalledWith('id', 'tag-2')
      expect(supabase._mocks.deleteEqSecondMock).toHaveBeenCalledWith('user_id', 'user-1')
      expect(onAvailableTagsUpdate).toHaveBeenCalledWith([])
      expect(onTagsChange).toHaveBeenCalledWith([])
    })
  })
})