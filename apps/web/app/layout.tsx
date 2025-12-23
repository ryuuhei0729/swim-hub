 import React from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AuthProvider } from '../contexts'
import QueryProvider from '../providers/QueryProvider'
import './globals.css'
import 'react-device-frameset/styles/marvel-devices.min.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SwimHub - 水泳選手のための記録管理システム',
  description: '個人でもチームでも使える、水泳記録帳。練習記録、大会記録、目標管理をシンプルに。チーム不要、今すぐ無料で始められます。',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  keywords: ['水泳', '記録管理', 'スイミング', '練習記録', '大会記録', 'タイム管理', 'SwimHub', '水泳選手', 'マスターズスイマー'],
  openGraph: {
    title: 'SwimHub - 水泳選手のための記録管理システム',
    description: '個人でもチームでも使える、あなただけの水泳記録帳',
    type: 'website',
    locale: 'ja_JP',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <AuthProvider>
          <QueryProvider>
          <div className="min-h-screen bg-gray-50">
            {children}
          </div>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
