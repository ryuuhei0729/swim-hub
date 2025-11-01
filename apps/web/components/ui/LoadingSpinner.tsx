'use client'

import React from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  message?: string
  className?: string
}

const sizeClasses = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8', 
  lg: 'h-12 w-12',
  xl: 'h-16 w-16'
}

export default function LoadingSpinner({ 
  size = 'lg', 
  message = 'Loading...', 
  className = '' 
}: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center space-y-4 ${className}`}>
      <div className="relative">
        <div className={`${sizeClasses[size]} border-4 border-gray-200 rounded-full animate-spin`}>
          <div className="absolute top-0 left-0 h-full w-full border-4 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      </div>
      {message && (
        <p className="text-sm text-gray-600 animate-pulse">{message}</p>
      )}
    </div>
  )
}

// フルスクリーンローディング
export function FullScreenLoading({ message = 'アプリケーションを読み込み中...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-white/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="xl" message={message} />
        <div className="mt-6">
          <div className="w-64 bg-gray-200 rounded-full h-1 overflow-hidden">
            <div className="bg-blue-600 h-1 rounded-full animate-pulse" style={{
              animation: 'loading-bar 2s ease-in-out infinite'
            }}></div>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes loading-bar {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  )
}
