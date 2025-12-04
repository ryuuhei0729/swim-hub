'use client'

import React, { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Header from './Header'
import Sidebar from './Sidebar'
import Footer from './Footer'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  // パス変更時にHeaderの下端までスクロール
  useEffect(() => {
    // Headerの高さは0
    const headerHeight = 0
    window.scrollTo({
      top: headerHeight,
      behavior: 'smooth'
    })
  }, [pathname])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <Header onMenuClick={handleMenuClick} />

      {/* サイドバー（固定） */}
      <Sidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />

      {/* メインコンテンツエリア */}
      <div className="pt-16 lg:pl-64">
        <main className="min-h-screen">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
        
        {/* フッター */}
        <Footer />
      </div>
    </div>
  )
}
