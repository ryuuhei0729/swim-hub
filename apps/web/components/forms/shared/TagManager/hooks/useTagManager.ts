'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/contexts'
import { PracticeTag } from '@apps/shared/types'

export type Tag = PracticeTag

// パステルカラー定数
export const PRESET_COLORS = [
  '#93C5FD', // 青
  '#7DD3FC', // 水色
  '#86EFAC', // 緑
  '#A3E635', // 黄緑
  '#FCA5A5', // 赤
  '#F9A8D4', // ピンク
  '#FDBA74', // オレンジ
  '#FDE047', // 黄色
  '#C4B5FD', // 紫
  '#D1D5DB', // グレー
]

/**
 * ランダムなプリセットカラーを取得
 */
export const getRandomColor = (): string => {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
}

/**
 * カラーコードを正規化
 */
export const normalizeColor = (color: string): string => {
  if (!color) return '#D1D5DB'

  let normalized = color.startsWith('#') ? color : `#${color}`
  normalized = normalized.toLowerCase()

  // 3桁のHEXを6桁に変換
  if (normalized.length === 4) {
    normalized = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
  }

  const hexPattern = /^#[0-9a-f]{6}$/
  if (!hexPattern.test(normalized)) {
    return '#D1D5DB'
  }

  return normalized
}

/**
 * カラーコードが有効かどうかを検証
 */
export const isValidColor = (color: string): boolean => {
  const normalized = normalizeColor(color)
  return normalized !== '#D1D5DB' || color === '#D1D5DB'
}

export interface UseTagManagerOptions {
  /** 選択中のタグ */
  selectedTags: Tag[]
  /** 利用可能なタグ */
  availableTags: Tag[]
  /** タグ選択変更時のコールバック */
  onTagsChange: (tags: Tag[]) => void
  /** 利用可能タグ更新時のコールバック */
  onAvailableTagsUpdate: (tags: Tag[]) => void
}

export interface UseTagManagerReturn {
  /** タグの選択/解除 */
  handleTagToggle: (tag: Tag) => void
  /** 新規タグ作成 */
  handleCreateTag: (tagName: string) => Promise<void>
  /** タグ更新 */
  handleUpdateTag: (id: string, name: string, color: string) => Promise<void>
  /** タグ削除 */
  handleDeleteTag: (id: string) => Promise<void>
  /** タグをフィルタリング */
  filterTags: (searchValue: string) => Tag[]
  /** 処理中フラグ */
  isLoading: boolean
  /** エラー */
  error: string | null
  /** エラーをクリア */
  clearError: () => void
}

/**
 * タグ管理に関するロジックを提供するカスタムフック
 *
 * @example
 * ```tsx
 * const {
 *   handleTagToggle,
 *   handleCreateTag,
 *   handleUpdateTag,
 *   handleDeleteTag,
 *   filterTags,
 * } = useTagManager({
 *   selectedTags,
 *   availableTags,
 *   onTagsChange,
 *   onAvailableTagsUpdate,
 * })
 * ```
 */
export const useTagManager = ({
  selectedTags,
  availableTags,
  onTagsChange,
  onAvailableTagsUpdate,
}: UseTagManagerOptions): UseTagManagerReturn => {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { supabase } = useAuth()

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * タグの選択/解除
   */
  const handleTagToggle = useCallback(
    (tag: Tag) => {
      const isSelected = selectedTags.some((t) => t.id === tag.id)
      if (isSelected) {
        onTagsChange(selectedTags.filter((t) => t.id !== tag.id))
      } else {
        onTagsChange([...selectedTags, tag])
      }
    },
    [selectedTags, onTagsChange]
  )

  /**
   * 新規タグ作成
   */
  const handleCreateTag = useCallback(
    async (tagName: string) => {
      if (!tagName.trim()) return

      setIsLoading(true)
      setError(null)

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('認証が必要です')

        const randomColor = getRandomColor()

        const { data, error: dbError } = await supabase
          .from('practice_tags')
          .insert({
            user_id: user.id,
            name: tagName.trim(),
            color: randomColor,
          })
          .select()
          .single()

        if (dbError) throw dbError

        // 利用可能タグリストを更新
        onAvailableTagsUpdate([...availableTags, data])

        // 選択済みタグにも追加
        onTagsChange([...selectedTags, data])
      } catch (err) {
        console.error('タグ作成エラー:', err)
        setError('タグの作成に失敗しました')
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [supabase, availableTags, selectedTags, onTagsChange, onAvailableTagsUpdate]
  )

  /**
   * タグ更新
   */
  const handleUpdateTag = useCallback(
    async (id: string, name: string, color: string) => {
      setIsLoading(true)
      setError(null)

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('認証が必要です')

        const { error: dbError } = await supabase
          .from('practice_tags')
          .update({
            name: name.trim(),
            color,
          })
          .eq('id', id)
          .eq('user_id', user.id)

        if (dbError) throw dbError

        // 利用可能タグリストを更新
        const updatedAvailableTags = availableTags.map((tag) =>
          tag.id === id ? { ...tag, name: name.trim(), color } : tag
        )
        onAvailableTagsUpdate(updatedAvailableTags)

        // 選択済みタグも更新
        const updatedSelectedTags = selectedTags.map((tag) =>
          tag.id === id ? { ...tag, name: name.trim(), color } : tag
        )
        onTagsChange(updatedSelectedTags)
      } catch (err) {
        console.error('タグ更新エラー:', err)
        setError('タグの更新に失敗しました')
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [supabase, availableTags, selectedTags, onTagsChange, onAvailableTagsUpdate]
  )

  /**
   * タグ削除
   */
  const handleDeleteTag = useCallback(
    async (id: string) => {
      setIsLoading(true)
      setError(null)

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('認証が必要です')

        const { error: dbError } = await supabase
          .from('practice_tags')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id)

        if (dbError) throw dbError

        // 利用可能タグリストから削除
        const updatedAvailableTags = availableTags.filter((tag) => tag.id !== id)
        onAvailableTagsUpdate(updatedAvailableTags)

        // 選択済みタグからも削除
        const updatedSelectedTags = selectedTags.filter((tag) => tag.id !== id)
        onTagsChange(updatedSelectedTags)
      } catch (err) {
        console.error('タグ削除エラー:', err)
        setError('タグの削除に失敗しました')
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [supabase, availableTags, selectedTags, onTagsChange, onAvailableTagsUpdate]
  )

  /**
   * タグをフィルタリング
   */
  const filterTags = useCallback(
    (searchValue: string): Tag[] => {
      return availableTags.filter(
        (tag) =>
          tag.name.toLowerCase().includes(searchValue.toLowerCase()) &&
          !selectedTags.some((selected) => selected.id === tag.id)
      )
    },
    [availableTags, selectedTags]
  )

  return {
    handleTagToggle,
    handleCreateTag,
    handleUpdateTag,
    handleDeleteTag,
    filterTags,
    isLoading,
    error,
    clearError,
  }
}

export default useTagManager
