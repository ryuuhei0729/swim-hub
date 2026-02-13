'use client'

import Link from 'next/link'

const navItems = [
  { id: 'about', label: 'SwimHubとは？' },
  { id: 'features', label: 'イチオシ機能' },
  { id: 'usecases', label: '利用パターン' },
  { id: 'announcements', label: 'お知らせ' },
]

function handleScrollTo(id: string) {
  const element = document.getElementById(id)
  if (element) {
    const headerOffset = 100
    const elementPosition = element.getBoundingClientRect().top
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth',
    })
  }
}

export default function ScrollNavButtons() {
  return (
    <>
      {/* デスクトップナビ */}
      <div className="hidden md:flex items-center space-x-1 lg:space-x-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleScrollTo(item.id)}
            className="px-4 py-2 text-base text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            {item.label}
          </button>
        ))}
        <div className="mx-2 h-6 w-px bg-gray-300" />
        <Link
          href="/signup"
          className="px-5 py-2.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
        >
          無料登録
        </Link>
        <Link
          href="/login"
          className="px-5 py-2.5 text-base font-semibold text-blue-600 border border-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        >
          ログイン
        </Link>
      </div>

      {/* モバイルメニューボタン */}
      <button
        className="md:hidden p-2 text-gray-700 hover:text-blue-600"
        aria-label="メニュー"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </>
  )
}
