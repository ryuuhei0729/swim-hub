'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/**
 * パス変更時にページトップへスクロールするClient Component
 * DashboardLayoutから分離して、最小限のクライアントバンドルに抑える
 * ブラウザの戻る/進むナビゲーション時はスクロール復元を妨げないようスキップする
 */
export default function ScrollToTop() {
  const pathname = usePathname()
  const isPopstateRef = useRef(false)

  useEffect(() => {
    const handlePopstate = () => {
      isPopstateRef.current = true
    }
    window.addEventListener('popstate', handlePopstate)
    return () => window.removeEventListener('popstate', handlePopstate)
  }, [])

  useEffect(() => {
    if (isPopstateRef.current) {
      isPopstateRef.current = false
      return
    }
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }, [pathname])

  return null
}
