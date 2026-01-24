'use client'

import React from 'react'
import ImageUploader from './ImageUploader'
import { COMPETITION_IMAGE_CONFIG, validateCompetitionImageFile } from '@/utils/imageUtils'
import type { ImageFile, ExistingImage } from './hooks/useImageUpload'

// 後方互換性のため、既存の型をre-export
export type { ImageFile as CompetitionImageFile, ExistingImage }

export interface CompetitionImageUploaderProps {
  /** 既存の画像リスト */
  existingImages?: ExistingImage[]
  /** 画像変更時のコールバック */
  onImagesChange: (newFiles: ImageFile[], deletedIds: string[]) => void
  /** 無効化フラグ */
  disabled?: boolean
}

/**
 * 大会画像用アップローダーコンポーネント
 *
 * @example
 * ```tsx
 * <CompetitionImageUploader
 *   existingImages={existingImages}
 *   onImagesChange={(newFiles, deletedIds) => {
 *     // 処理
 *   }}
 * />
 * ```
 */
export default function CompetitionImageUploader({
  existingImages = [],
  onImagesChange,
  disabled = false,
}: CompetitionImageUploaderProps) {
  return (
    <ImageUploader
      existingImages={existingImages}
      onImagesChange={onImagesChange}
      disabled={disabled}
      maxImages={COMPETITION_IMAGE_CONFIG.MAX_IMAGES}
      validateFile={validateCompetitionImageFile}
    />
  )
}
