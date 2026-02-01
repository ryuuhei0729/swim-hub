'use client'

import React from 'react'
import { PhotoIcon, XMarkIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import {
  useImageUpload,
  type ImageFile,
  type ExistingImage,
  type ImageValidationResult,
} from './hooks/useImageUpload'

export interface ImageUploaderProps {
  /** 既存の画像リスト */
  existingImages?: ExistingImage[]
  /** 画像変更時のコールバック */
  onImagesChange: (newFiles: ImageFile[], deletedIds: string[]) => void
  /** 無効化フラグ */
  disabled?: boolean
  /** 最大画像枚数 */
  maxImages: number
  /** ファイルバリデーション関数 */
  validateFile: (file: File) => Promise<ImageValidationResult>
  /** ラベルテキスト */
  label?: string
  /** ファイル形式の説明テキスト */
  formatDescription?: string
  /** 受け入れるファイル形式 */
  acceptedFormats?: string
}

/**
 * 汎用画像アップローダーコンポーネント
 *
 * @example
 * ```tsx
 * <ImageUploader
 *   existingImages={existingImages}
 *   onImagesChange={(newFiles, deletedIds) => {
 *     // 処理
 *   }}
 *   maxImages={10}
 *   validateFile={validatePracticeImageFile}
 * />
 * ```
 */
export default function ImageUploader({
  existingImages = [],
  onImagesChange,
  disabled = false,
  maxImages,
  validateFile,
  label = '画像を添付',
  formatDescription = 'JPEG, PNG, WebP, HEIC（各10MBまで）',
  acceptedFormats = 'image/jpeg,image/png,image/webp,image/heic,image/heif',
}: ImageUploaderProps) {
  // 表示中の既存画像（削除されていないもの）をカウント
  const {
    newFiles,
    deletedIds,
    isDragging,
    error,
    fileInputRef,
    canAddMore,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    handleRemoveNewFile,
    handleRemoveExistingImage,
    handleClick,
    handleKeyDown,
  } = useImageUpload({
    maxImages,
    currentCount: existingImages.length,
    validateFile,
    onImagesChange,
  })

  // 表示中の既存画像
  const visibleExistingImages = existingImages.filter(
    (img) => !deletedIds.includes(img.id)
  )
  const totalImageCount = visibleExistingImages.length + newFiles.length

  return (
    <div className="space-y-3">
      {/* ラベル */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <span className="text-xs text-gray-500">
          {totalImageCount} / {maxImages}枚
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
            ${
              isDragging
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
            accept={acceptedFormats}
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
              <span className="text-gray-500 hidden sm:inline"> または ドラッグ&ドロップ</span>
              <br />
              <span className="text-xs text-gray-400 ml-2">{formatDescription}</span>
            </div>
          </div>
        </button>
      )}

      {/* 最大枚数に達した場合のメッセージ */}
      {!canAddMore && (
        <p className="text-sm text-gray-500 text-center py-2">
          最大{maxImages}枚の画像が選択されています
        </p>
      )}
    </div>
  )
}
