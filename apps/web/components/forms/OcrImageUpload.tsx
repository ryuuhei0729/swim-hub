'use client'

import React, { useState, useRef, useCallback } from 'react'
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/ui'
import { validateImageFile } from '@/utils/imageUtils'
import { ParsedOcrResult } from '@/utils/ocrParser'

interface OcrImageUploadProps {
  onOcrComplete: (result: ParsedOcrResult) => void
  disabled?: boolean
}

export default function OcrImageUpload({
  onOcrComplete,
  disabled = false
}: OcrImageUploadProps) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 画像選択処理
  const handleFileSelect = useCallback((file: File) => {
    // ファイルバリデーション
    const validation = validateImageFile(file)
    if (!validation.valid) {
      setError(validation.error || 'ファイルが無効です')
      return
    }

    setError(null)
    setSelectedImage(file)

    // プレビュー用URLを作成
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }, [])

  // ファイル入力変更
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // ドラッグ&ドロップ処理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // OCR実行
  const handleOcrExecute = async () => {
    if (!selectedImage) {
      setError('画像が選択されていません')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('image', selectedImage)

      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'OCR処理に失敗しました' }))
        throw new Error(errorData.error || 'OCR処理に失敗しました')
      }

      const result: ParsedOcrResult = await response.json()

      if (!result.menus || result.menus.length === 0) {
        setError('練習メニューが検出されませんでした')
        return
      }

      // OCR結果を親コンポーネントに渡す
      onOcrComplete(result)

      // 成功後、画像をクリア
      handleClear()
    } catch (err) {
      console.error('OCR処理エラー:', err)
      setError(err instanceof Error ? err.message : 'OCR処理中にエラーが発生しました')
    } finally {
      setIsProcessing(false)
    }
  }

  // 画像クリア
  const handleClear = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedImage(null)
    setPreviewUrl(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900">画像から練習記録を読み込む</h4>
      </div>

      {/* 画像アップロードエリア */}
      {!selectedImage ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}
          `}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <PhotoIcon className="mx-auto h-12 w-12 text-gray-400" />
          <div className="mt-4">
            <p className="text-sm text-gray-600">
              画像をドラッグ&ドロップするか、
              <span className="text-blue-600 font-medium">クリックして選択</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              JPEG、PNG形式、5MB以下
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            onChange={handleInputChange}
            className="hidden"
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 画像プレビュー */}
          <div className="relative border border-gray-300 rounded-lg overflow-hidden">
            <img
              src={previewUrl || ''}
              alt="選択された画像"
              className="w-full h-auto max-h-96 object-contain bg-gray-50"
            />
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-gray-100"
              disabled={disabled || isProcessing}
            >
              <XMarkIcon className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          {/* OCR実行ボタン */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleOcrExecute}
              disabled={disabled || isProcessing}
              className="flex-1"
            >
              {isProcessing ? 'OCR処理中...' : 'OCRを実行'}
            </Button>
            <Button
              type="button"
              onClick={handleClear}
              disabled={disabled || isProcessing}
              variant="outline"
            >
              キャンセル
            </Button>
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* ローディング表示 */}
      {isProcessing && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-600">画像を解析しています...</p>
        </div>
      )}
    </div>
  )
}

