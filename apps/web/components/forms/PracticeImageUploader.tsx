'use client'

import React, { useState, useCallback, useRef } from 'react'
import { PhotoIcon, XMarkIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import { PRACTICE_IMAGE_CONFIG, validatePracticeImageFile } from '@/utils/imageUtils'

export interface PracticeImageFile {
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

interface PracticeImageUploaderProps {
  existingImages?: ExistingImage[]
  onImagesChange: (newFiles: PracticeImageFile[], deletedIds: string[]) => void
  disabled?: boolean
}

export default function PracticeImageUploader({
  existingImages = [],
  onImagesChange,
  disabled = false
}: PracticeImageUploaderProps) {
  const [newFiles, setNewFiles] = useState<PracticeImageFile[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 現在表示中の画像数を計算
  const visibleExistingImages = existingImages.filter(img => !deletedIds.includes(img.id))
  const totalImageCount = visibleExistingImages.length + newFiles.length
  const canAddMore = totalImageCount < PRACTICE_IMAGE_CONFIG.MAX_IMAGES

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError(null)
    const fileArray = Array.from(files)
    
    // 最大枚数チェック
    const remainingSlots = PRACTICE_IMAGE_CONFIG.MAX_IMAGES - totalImageCount
    if (fileArray.length > remainingSlots) {
      setError(`あと${remainingSlots}枚まで追加できます（最大${PRACTICE_IMAGE_CONFIG.MAX_IMAGES}枚）`)
      return
    }

    const validFiles: PracticeImageFile[] = []
    
    for (const file of fileArray) {
      const validation = await validatePracticeImageFile(file)
      if (!validation.valid) {
        // バリデーション失敗時は、既に作成されたオブジェクトURLをクリーンアップ
        validFiles.forEach(item => URL.revokeObjectURL(item.previewUrl))
        setError(validation.error || '無効なファイルです')
        return
      }

      const previewUrl = URL.createObjectURL(file)
      validFiles.push({
        id: crypto.randomUUID(),
        file,
        previewUrl
      })
    }

    const updatedNewFiles = [...newFiles, ...validFiles]
    setNewFiles(updatedNewFiles)
    onImagesChange(updatedNewFiles, deletedIds)
  }, [newFiles, deletedIds, totalImageCount, onImagesChange])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled && canAddMore) {
      setIsDragging(true)
    }
  }, [disabled, canAddMore])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled || !canAddMore) return

    const files = e.dataTransfer.files
    if (files.length > 0) {
      await handleFiles(files)
    }
  }, [disabled, canAddMore, handleFiles])

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await handleFiles(files)
    }
    // リセットして同じファイルを再選択できるようにする
    e.target.value = ''
  }, [handleFiles])

  const handleRemoveNewFile = useCallback((id: string) => {
    const fileToRemove = newFiles.find(f => f.id === id)
    if (fileToRemove) {
      URL.revokeObjectURL(fileToRemove.previewUrl)
    }
    const updatedNewFiles = newFiles.filter(f => f.id !== id)
    setNewFiles(updatedNewFiles)
    onImagesChange(updatedNewFiles, deletedIds)
  }, [newFiles, deletedIds, onImagesChange])

  const handleRemoveExistingImage = useCallback((id: string) => {
    const updatedDeletedIds = [...deletedIds, id]
    setDeletedIds(updatedDeletedIds)
    onImagesChange(newFiles, updatedDeletedIds)
  }, [newFiles, deletedIds, onImagesChange])

  const handleClick = useCallback(() => {
    if (!disabled && canAddMore) {
      fileInputRef.current?.click()
    }
  }, [disabled, canAddMore])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }, [handleClick])

  return (
    <div className="space-y-3">
      {/* ラベル */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          画像を添付
        </label>
        <span className="text-xs text-gray-500">
          {totalImageCount} / {PRACTICE_IMAGE_CONFIG.MAX_IMAGES}枚
        </span>
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* 画像プレビュー一覧 */}
      {(visibleExistingImages.length > 0 || newFiles.length > 0) && (
        <div className="grid grid-cols-3 gap-3">
          {/* 既存画像 */}
          {visibleExistingImages.map((image) => (
            <div 
              key={image.id} 
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200"
            >
              <img
                src={image.thumbnailUrl}
                alt={image.fileName}
                className="w-full h-full object-cover"
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemoveExistingImage(image.id)}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-md"
                  aria-label="画像を削除"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {/* 新規追加ファイル */}
          {newFiles.map((imageFile) => (
            <div 
              key={imageFile.id} 
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200"
            >
              <img
                src={imageFile.previewUrl}
                alt={imageFile.file.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-green-500/80 text-white text-xs py-0.5 text-center">
                新規
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemoveNewFile(imageFile.id)}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-md"
                  aria-label="画像を削除"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ドラッグ&ドロップエリア */}
      {canAddMore && (
        <button
          type="button"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={disabled}
          className={`
            relative border-2 border-dashed rounded-lg py-4 px-4 text-center cursor-pointer
            transition-colors duration-200 w-full
            ${isDragging 
              ? 'border-green-500 bg-green-50' 
              : 'border-gray-300 hover:border-green-400 hover:bg-green-50/50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          aria-label="画像をアップロード"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            disabled={disabled}
          />
          
          <div className="flex items-center justify-center gap-3">
            {isDragging ? (
              <ArrowUpTrayIcon className="h-6 w-6 text-green-500 shrink-0" />
            ) : (
              <PhotoIcon className="h-6 w-6 text-gray-400 shrink-0" />
            )}
            <div className="text-sm text-gray-600">
              <span className="text-green-600 font-medium">クリックして選択</span>
              <span className="text-gray-500"> または ドラッグ&ドロップ</span><br />
              <span className="text-xs text-gray-400 ml-2">JPEG, PNG, WebP, HEIC（各10MBまで）</span>
            </div>
          </div>
        </button>
      )}

      {/* 最大枚数に達した場合のメッセージ */}
      {!canAddMore && (
        <p className="text-sm text-gray-500 text-center py-2">
          最大{PRACTICE_IMAGE_CONFIG.MAX_IMAGES}枚の画像が選択されています
        </p>
      )}
    </div>
  )
}
