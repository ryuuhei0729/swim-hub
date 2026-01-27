'use client'

import React, { useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { CameraIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts'
import { validateImageFile } from '@/utils/imageUtils'

// react-easy-cropを含むImageCropModalを動的インポート（バンドルサイズ削減）
const ImageCropModal = dynamic(
  () => import('./ImageCropModal'),
  { ssr: false }
)

interface AvatarUploadProps {
  currentAvatarUrl?: string | null
  userName: string
  onAvatarChange: (newAvatarUrl: string | null) => void
  disabled?: boolean
}

export default function AvatarUpload({
  currentAvatarUrl,
  userName,
  onAvatarChange,
  disabled = false
}: AvatarUploadProps) {
  const { user } = useAuth()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<{ src: string; fileName: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!user) {
      setError('ログインが必要です')
      return
    }

    // ファイルバリデーション
    const validation = validateImageFile(file)
    if (!validation.valid) {
      setError(validation.error || 'ファイルが無効です')
      return
    }

    setError(null)

    try {
      // ファイルをURLとして読み込み
      const imageSrc = URL.createObjectURL(file)
      const fileExt = file.name.split('.').pop()
      const fileName = `avatar.${fileExt}`

      // トリミングモーダルを開く
      setSelectedImage({ src: imageSrc, fileName })
      setIsCropModalOpen(true)
    } catch (err) {
      console.error('ファイル読み込みエラー:', err)
      setError('ファイルの読み込みに失敗しました')
    }
  }

  const handleRemoveAvatar = async () => {
    if (!user) return

    setIsUploading(true)
    setError(null)

    try {
      // API Route経由で削除
      const response = await fetch('/api/storage/profile', {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json() as { error?: string }
        throw new Error(data.error || '画像の削除に失敗しました')
      }

      onAvatarChange(null)
    } catch (err) {
      console.error('画像削除エラー:', err)
      setError(err instanceof Error ? err.message : '画像の削除に失敗しました')
    } finally {
      setIsUploading(false)
    }
  }

  const handleCropComplete = async (croppedFile: File) => {
    if (!user) return

    setIsUploading(true)
    setError(null)

    try {
      // FormDataを作成
      const formData = new FormData()
      formData.append('file', croppedFile)

      // API Route経由でアップロード
      const response = await fetch('/api/storage/profile', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json() as { error?: string }
        throw new Error(data.error || '画像のアップロードに失敗しました')
      }

      const { url } = await response.json() as { url: string }
      onAvatarChange(url)
    } catch (err) {
      console.error('アップロードエラー:', err)
      setError(err instanceof Error ? err.message : '画像のアップロードに失敗しました')
    } finally {
      // メモリリークを防ぐため、生成したオブジェクトURLを解放
      try {
        const imageSrc = selectedImage?.src
        if (typeof imageSrc === 'string' && imageSrc.length > 0) {
          URL.revokeObjectURL(imageSrc)
        }
      } catch {
        // エラーは無視
      }
      setIsUploading(false)
      setIsCropModalOpen(false)
      setSelectedImage(null)
    }
  }

  const handleCropCancel = () => {
    setIsCropModalOpen(false)
    setSelectedImage(null)
    // メモリリークを防ぐためURLを解放
    if (selectedImage?.src) {
      URL.revokeObjectURL(selectedImage.src)
    }
  }

  const handleClick = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div className="relative">
      {/* アバター表示 */}
      <div
        className={`
          relative h-40 w-40 md:h-40 md:w-40 rounded-full flex items-center justify-center cursor-pointer
          ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}
          ${currentAvatarUrl ? 'bg-gray-100' : 'bg-blue-500'}
          transition-opacity duration-200
        `}
        onClick={handleClick}
      >
        {currentAvatarUrl ? (
          <img
            src={currentAvatarUrl}
            alt="プロフィール画像"
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span className="text-4xl md:text-5xl font-bold text-white">
            {userName.charAt(0) || '?'}
          </span>
        )}

        {/* アップロード中インジケーター */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}

        {/* カメラアイコン */}
        {!isUploading && !disabled && (
          <div className="absolute bottom-0 right-0 bg-blue-500 text-white rounded-full p-2 shadow-lg">
            <CameraIcon className="h-4 w-4" />
          </div>
        )}

        {/* 削除ボタン */}
        {currentAvatarUrl && !isUploading && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleRemoveAvatar()
            }}
            className="absolute top-1 right-1 z-10 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600"
            aria-label="アバターを削除"
          >
            <XMarkIcon className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mt-2 text-sm text-red-600 text-center">
          {error}
        </div>
      )}

      {/* 隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* トリミングモーダル */}
      {selectedImage && (
        <ImageCropModal
          isOpen={isCropModalOpen}
          onClose={handleCropCancel}
          imageSrc={selectedImage.src}
          fileName={selectedImage.fileName}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  )
}
