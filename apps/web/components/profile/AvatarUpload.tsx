'use client'

import React, { useState, useRef } from 'react'
import { CameraIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts'
import ImageCropModal from './ImageCropModal'
import { validateImageFile } from '@/utils/imageUtils'

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
  const supabase = createClient()

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

  // URLからファイルパスを抽出するヘルパー関数
  const extractFilePathFromUrl = (url: string): string | null => {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/')
      const profileImagesIndex = pathParts.indexOf('profile-images')
      if (profileImagesIndex === -1) {
        return null
      }
      return pathParts.slice(profileImagesIndex + 1).join('/') // avatars/{userId}/{filename}
    } catch (err) {
      console.warn('URL解析エラー:', err)
      return null
    }
  }

  const handleRemoveAvatar = async () => {
    if (!user) return

    try {
      // User:1 - ProfileImage:1 の関係を保つため、ユーザーフォルダ内のすべてのファイルを削除
      const userFolderPath = `avatars/${user.id}`
      
      // ユーザーフォルダ内のファイル一覧を取得
      const { data: files, error: listError } = await supabase.storage
        .from('profile-images')
        .list(userFolderPath)
      
      if (listError) {
        throw listError
      }
      
      if (files && files.length > 0) {
        // すべてのファイルを削除
        const filePathsToDelete = files.map(file => `${userFolderPath}/${file.name}`)
        console.log('プロフィール画像を削除中:', filePathsToDelete)
        
        const { error: deleteError } = await supabase.storage
          .from('profile-images')
          .remove(filePathsToDelete)
        
        if (deleteError) {
          throw deleteError
        }
        
        console.log('プロフィール画像を削除しました:', filePathsToDelete.length, 'ファイル')
      }
      
      onAvatarChange(null)
    } catch (err) {
      console.error('画像削除エラー:', err)
      setError('画像の削除に失敗しました')
    }
  }

  const handleCropComplete = async (croppedFile: File) => {
    if (!user) return

    setIsUploading(true)
    setError(null)

    try {
      // ユーザーフォルダのパス: avatars/{userId}/
      const userFolderPath = `avatars/${user.id}`
      
      // User:1 - ProfileImage:1 の関係を保つため、ユーザーフォルダ内のすべてのファイルを削除
      try {
        // ユーザーフォルダ内のファイル一覧を取得
        const { data: files, error: listError } = await supabase.storage
          .from('profile-images')
          .list(userFolderPath)
        
        if (listError) {
          console.warn('ファイル一覧取得エラー:', listError)
        } else if (files && files.length > 0) {
          // すべてのファイルを削除
          const filePathsToDelete = files.map(file => `${userFolderPath}/${file.name}`)
          console.log('既存のプロフィール画像を削除中:', filePathsToDelete)
          
          const { error: deleteError } = await supabase.storage
            .from('profile-images')
            .remove(filePathsToDelete)
          
          if (deleteError) {
            console.warn('既存画像の削除に失敗:', deleteError)
          } else {
            console.log('既存のプロフィール画像を削除しました:', filePathsToDelete.length, 'ファイル')
          }
        }
      } catch (deleteErr) {
        console.warn('既存画像の削除処理でエラー:', deleteErr)
        // エラーが発生しても続行（新規ユーザーなど、フォルダが存在しない場合もある）
      }

      // ファイル名を生成（ユニークにするためタイムスタンプを追加）
      const fileExt = croppedFile.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      // ユーザーIDを含むパス構造: avatars/{userId}/{fileName}
      const filePath = `${userFolderPath}/${fileName}`

      // Supabase Storageにアップロード
      console.log('新しい画像をアップロード中:', filePath)
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, croppedFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

      // 公開URLを取得
      const { data } = supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath)

      console.log('新しい画像のアップロード完了:', data.publicUrl)
      onAvatarChange(data.publicUrl)
    } catch (err) {
      console.error('アップロードエラー:', err)
      setError('画像のアップロードに失敗しました')
    } finally {
      // メモリリークを防ぐため、生成したオブジェクトURLを解放
      try {
        const imageSrc = selectedImage?.src
        if (typeof imageSrc === 'string' && imageSrc.length > 0) {
          URL.revokeObjectURL(imageSrc)
        }
      } catch {}
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
          <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
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
