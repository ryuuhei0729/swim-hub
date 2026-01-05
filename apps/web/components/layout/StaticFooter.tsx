import Link from 'next/link'
import Image from 'next/image'

/**
 * 静的フッターコンポーネント
 * Google OAuth審査対応のため、Server Componentとして実装
 * プライバシーポリシーと利用規約へのリンクを静的HTMLとして提供
 */
export default function StaticFooter() {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 flex items-center justify-center">
              <Image 
                src="/favicon.png" 
                alt="SwimHub" 
                width={80} 
                height={80} 
                className="w-full h-full object-contain" 
              />
            </div>
          </div>
          <h3 className="text-gray-100 text-xl font-semibold mb-2">
            SwimHub
          </h3>
          <p className="text-gray-100 mb-6 text-sm">
            水泳選手のための記録管理サービス
          </p>
          <div className="flex justify-center gap-6 mb-8 text-sm text-gray-400">
            <Link href="/terms" className="hover:text-white text-gray-400 font-bold transition-colors">
              利用規約
            </Link>
            <Link href="/privacy" className="hover:text-white text-gray-400 font-bold transition-colors">
              プライバシーポリシー
            </Link>
          </div>
          <div className="text-xs text-gray-500">
            © 2025 SwimHub. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  )
}

