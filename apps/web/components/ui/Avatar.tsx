'use client'

import React from 'react'
import Image from 'next/image'

interface AvatarProps {
  avatarUrl?: string | null
  userName: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
  className?: string
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-24 w-24 text-3xl',
  xl: 'h-32 w-32 text-4xl',
  xxl: 'h-40 w-40 text-5xl'
}

export default function Avatar({
  avatarUrl,
  userName,
  size = 'md',
  className = ''
}: AvatarProps) {
  const sizeClass = sizeClasses[size]
  const initials = userName.charAt(0) || '?'

  return (
    <div className={`${sizeClass} ${className} rounded-full flex items-center justify-center shrink-0 overflow-hidden ${
      avatarUrl ? 'bg-gray-100' : 'bg-blue-500'
    }`}>
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={`${userName}のプロフィール画像`}
          width={size === 'sm' ? 32 : size === 'md' ? 40 : size === 'lg' ? 96 : size === 'xl' ? 128 : 160}
          height={size === 'sm' ? 32 : size === 'md' ? 40 : size === 'lg' ? 96 : size === 'xl' ? 128 : 160}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className={`font-bold text-white ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : size === 'lg' ? 'text-3xl' : size === 'xl' ? 'text-4xl' : 'text-5xl'}`}>
          {initials}
        </span>
      )}
    </div>
  )
}
