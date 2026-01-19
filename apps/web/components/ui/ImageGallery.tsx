'use client'

import React, { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { PhotoIcon } from '@heroicons/react/24/solid'

export interface GalleryImage {
  id: string
  thumbnailUrl: string
  originalUrl: string
  fileName?: string
}

interface ImageGalleryProps {
  images: GalleryImage[]
  className?: string
}

export default function ImageGallery({ images, className = '' }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // キーボードナビゲーション
  useEffect(() => {
    if (selectedIndex === null) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          setSelectedIndex(null)
          break
        case 'ArrowLeft':
          e.preventDefault()
          setSelectedIndex(prev => 
            prev !== null && prev > 0 ? prev - 1 : images.length - 1
          )
          break
        case 'ArrowRight':
          e.preventDefault()
          setSelectedIndex(prev => 
            prev !== null && prev < images.length - 1 ? prev + 1 : 0
          )
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, images.length])

  const handleThumbnailClick = useCallback((index: number) => {
    setSelectedIndex(index)
    setIsLoading(true)
  }, [])

  const handleClose = useCallback(() => {
    setSelectedIndex(null)
  }, [])

  const handlePrevious = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIndex(prev => 
      prev !== null && prev > 0 ? prev - 1 : images.length - 1
    )
    setIsLoading(true)
  }, [images.length])

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIndex(prev => 
      prev !== null && prev < images.length - 1 ? prev + 1 : 0
    )
    setIsLoading(true)
  }, [images.length])

  const handleImageLoad = useCallback(() => {
    setIsLoading(false)
  }, [])

  if (images.length === 0) {
    return null
  }

  const selectedImage = selectedIndex !== null ? images[selectedIndex] : null

  return (
    <>
      {/* サムネイル一覧 */}
      <div className={`${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <PhotoIcon className="h-4 w-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-500">添付画像</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => handleThumbnailClick(index)}
              className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:border-green-400 hover:ring-2 hover:ring-green-200 transition-all focus:outline-none focus:ring-2 focus:ring-green-500 relative"
            >
              <Image
                src={image.thumbnailUrl}
                alt={image.fileName || `画像 ${index + 1}`}
                fill
                className="object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>

      {/* 拡大表示モーダル */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={handleClose}
        >
          {/* 閉じるボタン */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors z-10"
            aria-label="閉じる"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

          {/* 画像カウンター */}
          <div className="absolute top-4 left-4 text-white/80 text-sm bg-black/40 px-3 py-1 rounded-full">
            {selectedIndex !== null ? selectedIndex + 1 : 0} / {images.length}
          </div>

          {/* 前へボタン */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={handlePrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors z-10"
              aria-label="前の画像"
            >
              <ChevronLeftIcon className="h-8 w-8" />
            </button>
          )}

          {/* 次へボタン */}
          {images.length > 1 && (
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors z-10"
              aria-label="次の画像"
            >
              <ChevronRightIcon className="h-8 w-8" />
            </button>
          )}

          {/* 画像 */}
          <div 
            className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ローディング */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
              </div>
            )}
            <div className="relative w-full h-full">
              <Image
                src={selectedImage.originalUrl}
                alt={selectedImage.fileName || '拡大画像'}
                fill
                className={`object-contain transition-opacity duration-200 ${
                  isLoading ? 'opacity-0' : 'opacity-100'
                }`}
                onLoad={handleImageLoad}
                loading="lazy"
              />
            </div>
          </div>

          {/* ファイル名 */}
          {selectedImage.fileName && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/40 px-4 py-2 rounded-full max-w-[80vw] truncate">
              {selectedImage.fileName}
            </div>
          )}
        </div>
      )}
    </>
  )
}
