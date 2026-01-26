'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ImageFile {
  id: string
  file: File
  previewUrl: string
}

export interface ExistingImage {
  id: string
  thumbnailUrl: string
  originalUrl: string
  fileName: string
}

export interface ImageValidationResult {
  valid: boolean
  error?: string
}

export interface UseImageUploadOptions {
  /** 最大画像枚数 */
  maxImages: number
  /** 現在の画像枚数 */
  currentCount: number
  /** ファイルバリデーション関数 */
  validateFile: (file: File) => Promise<ImageValidationResult>
  /** 画像変更時のコールバック */
  onImagesChange: (newFiles: ImageFile[], deletedIds: string[]) => void
  /** 初期の削除済みID */
  initialDeletedIds?: string[]
}

export interface UseImageUploadReturn {
  /** 新規追加ファイル */
  newFiles: ImageFile[]
  /** 削除済みID */
  deletedIds: string[]
  /** ドラッグ中フラグ */
  isDragging: boolean
  /** エラーメッセージ */
  error: string | null
  /** ファイル入力ref */
  fileInputRef: React.RefObject<HTMLInputElement | null>
  /** 追加可能フラグ */
  canAddMore: boolean
  /** ファイル処理 */
  handleFiles: (files: FileList | File[]) => Promise<void>
  /** ドラッグオーバー */
  handleDragOver: (e: React.DragEvent) => void
  /** ドラッグリーブ */
  handleDragLeave: (e: React.DragEvent) => void
  /** ドロップ */
  handleDrop: (e: React.DragEvent) => Promise<void>
  /** ファイル入力変更 */
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  /** 新規ファイル削除 */
  handleRemoveNewFile: (id: string) => void
  /** 既存画像削除 */
  handleRemoveExistingImage: (id: string) => void
  /** クリックしてファイル選択 */
  handleClick: () => void
  /** キーボード操作 */
  handleKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void
  /** エラーをクリア */
  clearError: () => void
}

/**
 * 画像アップロードに関するロジックを提供するカスタムフック
 *
 * @example
 * ```tsx
 * const {
 *   newFiles,
 *   deletedIds,
 *   isDragging,
 *   error,
 *   handleFiles,
 *   handleDragOver,
 *   handleDrop,
 *   handleRemoveNewFile,
 * } = useImageUpload({
 *   maxImages: 10,
 *   currentCount: existingImages.length,
 *   validateFile: validatePracticeImageFile,
 *   onImagesChange: (newFiles, deletedIds) => {
 *     // 処理
 *   },
 * })
 * ```
 */
export const useImageUpload = ({
  maxImages,
  currentCount,
  validateFile,
  onImagesChange,
  initialDeletedIds = [],
}: UseImageUploadOptions): UseImageUploadReturn => {
  const [newFiles, setNewFiles] = useState<ImageFile[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>(initialDeletedIds)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const newFilesRef = useRef<ImageFile[]>([])

  // 現在の合計枚数（既存 - 削除 + 新規）
  const totalCount = currentCount - deletedIds.length + newFiles.length
  const canAddMore = totalCount < maxImages

  // newFilesが変更されたらrefを更新（クリーンアップ用に最新の状態を保持）
  useEffect(() => {
    newFilesRef.current = newFiles
  }, [newFiles])

  // Blob URLのメモリリークを防ぐためのクリーンアップ（アンマウント時のみ）
  useEffect(() => {
    const currentFileInput = fileInputRef.current
    return () => {
      // アンマウント時にblob URLを解放
      newFilesRef.current.forEach((f) => {
        URL.revokeObjectURL(f.previewUrl)
      })
      // ファイル入力をリセット
      if (currentFileInput) {
        currentFileInput.value = ''
      }
    }
  }, [])

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null)
      const fileArray = Array.from(files)

      // 最大枚数チェック
      const remainingSlots = maxImages - totalCount
      if (fileArray.length > remainingSlots) {
        setError(`あと${remainingSlots}枚まで追加できます（最大${maxImages}枚）`)
        return
      }

      const validFiles: ImageFile[] = []

      for (const file of fileArray) {
        let previewUrl: string | null = null
        try {
          const validation = await validateFile(file)
          if (!validation.valid) {
            // バリデーション失敗時は、既に作成されたオブジェクトURLをクリーンアップ
            validFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl))
            setError(validation.error || '無効なファイルです')
            return
          }

          previewUrl = URL.createObjectURL(file)
          validFiles.push({
            id: crypto.randomUUID(),
            file,
            previewUrl,
          })
        } catch (err) {
          // 例外発生時は、既に作成されたオブジェクトURLをクリーンアップ
          validFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl))
          // 現在のファイルでpreviewUrlが作成済みの場合も解放
          if (previewUrl) {
            URL.revokeObjectURL(previewUrl)
          }
          setError(err instanceof Error ? err.message : '無効なファイルです')
          return
        }
      }

      const updatedNewFiles = [...newFiles, ...validFiles]
      setNewFiles(updatedNewFiles)
      onImagesChange(updatedNewFiles, deletedIds)
    },
    [newFiles, deletedIds, totalCount, maxImages, validateFile, onImagesChange]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (canAddMore) {
        setIsDragging(true)
      }
    },
    [canAddMore]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (!canAddMore) return

      const files = e.dataTransfer.files
      if (files.length > 0) {
        await handleFiles(files)
      }
    },
    [canAddMore, handleFiles]
  )

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0) {
        await handleFiles(files)
      }
      // リセットして同じファイルを再選択できるようにする
      e.target.value = ''
    },
    [handleFiles]
  )

  const handleRemoveNewFile = useCallback(
    (id: string) => {
      const fileToRemove = newFiles.find((f) => f.id === id)
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.previewUrl)
      }
      const updatedNewFiles = newFiles.filter((f) => f.id !== id)
      setNewFiles(updatedNewFiles)
      onImagesChange(updatedNewFiles, deletedIds)
    },
    [newFiles, deletedIds, onImagesChange]
  )

  const handleRemoveExistingImage = useCallback(
    (id: string) => {
      const updatedDeletedIds = [...deletedIds, id]
      setDeletedIds(updatedDeletedIds)
      onImagesChange(newFiles, updatedDeletedIds)
    },
    [newFiles, deletedIds, onImagesChange]
  )

  const handleClick = useCallback(() => {
    if (canAddMore) {
      fileInputRef.current?.click()
    }
  }, [canAddMore])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleClick()
      }
    },
    [handleClick]
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    newFiles,
    deletedIds,
    isDragging,
    error,
    fileInputRef,
    canAddMore,
    handleFiles,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    handleRemoveNewFile,
    handleRemoveExistingImage,
    handleClick,
    handleKeyDown,
    clearError,
  }
}

export default useImageUpload
