'use client'

import React, { useState } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import Footer from './Footer'
import ScrollToTop from './ScrollToTop'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleMenuClick = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleSidebarClose = () => {
    setSidebarOpen(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ScrollToTop />

      {/* ヘッダー */}
      <Header onMenuClick={handleMenuClick} />

      {/* サイドバー（固定） */}
      <Sidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />

      {/* メインコンテンツエリア */}
      <div className="pt-16 lg:pl-64">
        <main className="min-h-screen">
          <div className="max-w-7xl mx-auto py-4 sm:py-6 px-0 sm:px-4 lg:px-8">
            {children}
          </div>
        </main>
        
        {/* フッター */}
        <Footer />
      </div>
    </div>
  )
}
