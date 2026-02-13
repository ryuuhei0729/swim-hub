'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * パス変更時にページトップへスクロールするClient Component
 * DashboardLayoutから分離して、最小限のクライアントバンドルに抑える
 */
export default function ScrollToTop() {
  const pathname = usePathname()

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }, [pathname])

  return null
}
