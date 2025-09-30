import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useMutation, useQuery } from '@apollo/client/react'
import { CREATE_PRACTICE_TAG, UPDATE_PRACTICE_TAG, DELETE_PRACTICE_TAG } from '@/graphql/mutations'
import { GET_MY_PRACTICE_TAGS } from '@/graphql/queries'

interface PracticeTag {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

interface PracticeTagFormProps {
  isOpen: boolean
  onClose: () => void
  onTagSelect?: (tag: PracticeTag) => void
  selectedTags?: string[]
  mode?: 'create' | 'edit' | 'select'
  editTag?: PracticeTag
}

// プリセットカラー
const PRESET_COLORS = [
  '#93C5FD', // 淡い青
  '#FDE68A', // 淡い黄
  '#FECACA', // 淡い赤
  '#D1FAE5', // 淡い緑
  '#E0E7FF', // 淡い紫
  '#FED7AA', // 淡いオレンジ
  '#F3E8FF', // 淡い紫
  '#FEF3C7', // 淡い黄
  '#ECFDF5', // 淡い緑
  '#FEF2F2', // 淡い赤
  '#F0F9FF', // 淡い青
  '#FDF4FF', // 淡い紫
]

export default function PracticeTagForm({
  isOpen,
  onClose,
  onTagSelect,
  selectedTags = [],
  mode = 'create',
  editTag
}: PracticeTagFormProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#93C5FD')
  const [isLoading, setIsLoading] = useState(false)

  // タグデータを取得
  const { data: tagsData, refetch } = useQuery(GET_MY_PRACTICE_TAGS)
  const availableTags = (tagsData as any)?.myPracticeTags || []

  // ミューテーション
  const [createPracticeTag] = useMutation(CREATE_PRACTICE_TAG, {
    refetchQueries: [{ query: GET_MY_PRACTICE_TAGS }],
    awaitRefetchQueries: true
  })

  const [updatePracticeTag] = useMutation(UPDATE_PRACTICE_TAG, {
    refetchQueries: [{ query: GET_MY_PRACTICE_TAGS }],
    awaitRefetchQueries: true
  })

  const [deletePracticeTag] = useMutation(DELETE_PRACTICE_TAG, {
    refetchQueries: [{ query: GET_MY_PRACTICE_TAGS }],
    awaitRefetchQueries: true
  })

  // 編集モード時の初期値設定
  useEffect(() => {
    if (editTag && mode === 'edit') {
      setName(editTag.name)
      setColor(editTag.color)
    } else {
      setName('')
      setColor('#93C5FD')
    }
  }, [editTag, mode])

  // フォームリセット
  const resetForm = () => {
    setName('')
    setColor('#93C5FD')
  }

  // タグ作成
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsLoading(true)
    try {
      const result = await createPracticeTag({
        variables: {
          input: {
            name: name.trim(),
            color
          }
        }
      })

      if (onTagSelect && (result.data as any)?.createPracticeTag) {
        onTagSelect((result.data as any).createPracticeTag)
      }

      resetForm()
      onClose()
    } catch (error) {
      console.error('タグの作成に失敗しました:', error)
      alert('タグの作成に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // タグ更新
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !editTag) return

    setIsLoading(true)
    try {
      await updatePracticeTag({
        variables: {
          id: editTag.id,
          input: {
            name: name.trim(),
            color
          }
        }
      })

      resetForm()
      onClose()
    } catch (error) {
      console.error('タグの更新に失敗しました:', error)
      alert('タグの更新に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // タグ削除
  const handleDelete = async (tagId: string) => {
    if (!confirm('このタグを削除しますか？')) return

    setIsLoading(true)
    try {
      await deletePracticeTag({
        variables: { id: tagId }
      })
    } catch (error) {
      console.error('タグの削除に失敗しました:', error)
      alert('タグの削除に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // タグ選択
  const handleTagSelect = (tag: PracticeTag) => {
    if (onTagSelect) {
      onTagSelect(tag)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {mode === 'create' && '新しいタグを作成'}
            {mode === 'edit' && 'タグを編集'}
            {mode === 'select' && 'タグを選択'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {mode === 'select' ? (
          // タグ選択モード
          <div className="space-y-4">
            <div className="max-h-60 overflow-y-auto">
              {availableTags.length === 0 ? (
                <p className="text-gray-500 text-center py-4">タグがありません</p>
              ) : (
                <div className="space-y-2">
                  {availableTags.map((tag: PracticeTag) => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-gray-900">{tag.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => handleTagSelect(tag)}
                          className="px-3 py-1 text-sm"
                        >
                          選択
                        </Button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tag.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                          disabled={isLoading}
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="pt-4 border-t">
              <Button
                type="button"
                onClick={() => {
                  onClose()
                  // 新しいタグ作成モーダルを開く処理は親コンポーネントで実装
                }}
                className="w-full"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                新しいタグを作成
              </Button>
            </div>
          </div>
        ) : (
          // タグ作成・編集モード
          <form onSubmit={mode === 'create' ? handleCreate : handleUpdate}>
            <div className="space-y-4">
              {/* タグ名 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  タグ名
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: フォーム改善"
                  required
                />
              </div>

              {/* 色選択 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  色
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {PRESET_COLORS.map((presetColor) => (
                    <button
                      key={presetColor}
                      type="button"
                      onClick={() => setColor(presetColor)}
                      className={`w-8 h-8 rounded-full border-2 ${
                        color === presetColor ? 'border-gray-900' : 'border-gray-300'
                      }`}
                      style={{ backgroundColor: presetColor }}
                    />
                  ))}
                </div>
                
                {/* カスタムカラー */}
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-sm text-gray-600">カスタム:</label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-8 h-8 rounded border border-gray-300"
                  />
                  <span className="text-sm text-gray-500">{color}</span>
                </div>
              </div>

              {/* プレビュー */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  プレビュー
                </label>
                <div className="p-3 border border-gray-200 rounded-lg">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white"
                    style={{ backgroundColor: color }}
                  >
                    {name || 'タグ名'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || isLoading}
              >
                {isLoading ? '保存中...' : (mode === 'create' ? '作成' : '更新')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
