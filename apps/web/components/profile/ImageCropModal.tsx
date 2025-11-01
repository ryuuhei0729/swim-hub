'use client'

import React, { useState, useCallback } from 'react'
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import Cropper from 'react-easy-crop'
import { Area } from 'react-easy-crop'
import { useImageCrop } from '@/hooks/useImageCrop'
import { Button } from '@/components/ui'

interface ImageCropModalProps {
  isOpen: boolean
  onClose: () => void
  imageSrc: string
  fileName: string
  onCropComplete: (croppedFile: File) => void
}

export default function ImageCropModal({
  isOpen,
  onClose,
  imageSrc,
  fileName,
  onCropComplete
}: ImageCropModalProps) {
  const {
    crop,
    setCrop,
    zoom,
    setZoom,
    isProcessing,
    handleCropComplete,
    handleSave,
    handleCancel,
    resetCrop
  } = useImageCrop({
    onCropComplete,
    onCancel: onClose
  })

  const handleSaveClick = useCallback(() => {
    handleSave(imageSrc, fileName)
  }, [handleSave, imageSrc, fileName])

  const handleClose = useCallback(() => {
    resetCrop()
    handleCancel()
  }, [resetCrop, handleCancel])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* オーバーレイ */}
      <div 
        className="fixed inset-0 bg-gray-900/75 transition-opacity"
        onClick={handleClose}
      />
      
      {/* モーダル */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              プロフィール画像をトリミング
            </h3>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
              onClick={handleClose}
              disabled={isProcessing}
            >
              <span className="sr-only">閉じる</span>
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* トリミングエリア */}
          <div className="p-4">
            <div className="relative w-full h-96 bg-gray-100 rounded-lg overflow-hidden">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1} // 正方形
                onCropChange={setCrop}
                onCropComplete={handleCropComplete}
                onZoomChange={setZoom}
                showGrid={true}
                style={{
                  containerStyle: {
                    width: '100%',
                    height: '100%',
                    position: 'relative'
                  }
                }}
              />
            </div>

            {/* ズームコントロール */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ズーム
              </label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                disabled={isProcessing}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1x</span>
                <span>2x</span>
                <span>3x</span>
              </div>
            </div>
          </div>

          {/* フッター */}
          <div className="flex justify-end space-x-3 p-4 border-t border-gray-200">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isProcessing}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              onClick={handleSaveClick}
              disabled={isProcessing}
              className="flex items-center space-x-2"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>処理中...</span>
                </>
              ) : (
                <>
                  <CheckIcon className="h-4 w-4" />
                  <span>保存</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
