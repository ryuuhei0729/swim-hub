'use client'

import React, { ReactNode } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface BaseModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showCloseButton?: boolean
}

export default function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true
}: BaseModalProps) {
  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />
        
        {/* モーダルコンテンツ */}
        <div className={`relative bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]}`}>
          {/* ヘッダー */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              {title && (
                <h3 className="text-lg font-semibold text-gray-900">
                  {title}
                </h3>
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="閉じる"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              )}
            </div>
          )}
          
          {/* コンテンツ */}
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
