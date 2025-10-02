import React from 'react'
import Link from 'next/link'
import { 
  HeartIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  QuestionMarkCircleIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  const footerLinks = [
    {
      name: 'プライバシーポリシー',
      href: '/privacy',
      icon: ShieldCheckIcon
    },
    {
      name: '利用規約',
      href: '/terms',
      icon: DocumentTextIcon
    },
    {
      name: 'サポート',
      href: '/support',
      icon: QuestionMarkCircleIcon
    },
    {
      name: 'お問い合わせ',
      href: '/contact',
      icon: EnvelopeIcon
    }
  ]

  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 左側：システム情報 */}
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded flex items-center justify-center mr-2">
                <span className="text-white font-bold text-xs">🏊</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                SwimHub
              </h3>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              水泳チームの選手、コーチ、監督、マネージャーが効率的にチーム運営を行えるWebアプリケーション
            </p>
            <div className="flex items-center text-sm text-gray-500">
              <span>Made with</span>
              <HeartIcon className="h-4 w-4 text-red-500 mx-1" />
              <span>for swimmers</span>
            </div>
          </div>

          {/* 右側：法的情報とサポート */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              サポート・情報
            </h4>
            <div className="space-y-2">
              {footerLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="flex items-center text-sm text-gray-600 hover:text-blue-600 transition-colors duration-200"
                >
                  <link.icon className="h-4 w-4 mr-2" />
                  {link.name}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* 下部：コピーライトとバージョン情報 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col items-center justify-between space-y-4 sm:flex-row sm:space-y-0">
            <div className="flex flex-col items-center sm:items-start space-y-1">
              <div className="text-sm text-gray-500">
                © {currentYear} 水泳選手マネジメントシステム. All rights reserved.
              </div>
              <div className="text-xs text-gray-400">
                Built with Next.js, Tailwind CSS, and Supabase
              </div>
            </div>
            
            <div className="flex items-center space-x-4 text-xs text-gray-400">
              <span>Version 1.0.0</span>
              <span>•</span>
              <span>Last updated: {new Date().toLocaleDateString('ja-JP')}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
