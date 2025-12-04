import React from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'

export const metadata = {
  title: 'プライバシーポリシー | SwimHub',
  description: 'SwimHubのプライバシーポリシー',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-gray-600 hover:text-blue-600 transition-colors mb-6"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            ホームに戻る
          </Link>
          <div className="flex items-center mb-4">
            <ShieldCheckIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">プライバシーポリシー</h1>
          </div>
          <p className="text-sm text-gray-500">
            最終更新日: {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* コンテンツ */}
        <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. はじめに</h2>
            <p className="text-gray-700 leading-relaxed">
              SwimHub（以下「当サービス」）は、ユーザーの個人情報の保護を重要視しています。
              本プライバシーポリシーは、当サービスがどのように個人情報を収集、使用、保護するかについて説明します。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. 収集する情報</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              当サービスは、以下の情報を収集する場合があります：
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>アカウント登録時に提供される情報（メールアドレス、ユーザー名など）</li>
              <li>練習記録、大会記録、目標などの記録データ</li>
              <li>サービス利用に関するログ情報</li>
              <li>ブラウザやデバイスに関する技術情報</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. 情報の使用目的</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              収集した情報は、以下の目的で使用します：
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>サービスの提供と運営</li>
              <li>ユーザーサポートの提供</li>
              <li>サービス改善のための分析</li>
              <li>重要な通知や更新情報の送信</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. 情報の共有</h2>
            <p className="text-gray-700 leading-relaxed">
              当サービスは、ユーザーの同意なく、個人情報を第三者に提供することはありません。
              ただし、法的義務がある場合や、サービス提供に必要な限定的な場合を除きます。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. データの保護</h2>
            <p className="text-gray-700 leading-relaxed">
              当サービスは、適切なセキュリティ対策を講じて、ユーザーの個人情報を保護します。
              Supabaseのセキュアなインフラストラクチャを使用し、データの暗号化とアクセス制御を実施しています。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. ユーザーの権利</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              ユーザーは、以下の権利を有します：
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>個人情報へのアクセス</li>
              <li>個人情報の修正・削除</li>
              <li>アカウントの削除</li>
              <li>データのエクスポート</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Cookieの使用</h2>
            <p className="text-gray-700 leading-relaxed">
              当サービスは、サービス提供のためにCookieを使用する場合があります。
              Cookieの使用を希望しない場合は、ブラウザの設定で無効化できます。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. お問い合わせ</h2>
            <p className="text-gray-700 leading-relaxed">
              プライバシーポリシーに関するご質問やご意見がございましたら、
              <Link href="/contact" className="text-blue-600 hover:text-blue-800 underline">
                お問い合わせページ
              </Link>
              よりご連絡ください。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. 変更について</h2>
            <p className="text-gray-700 leading-relaxed">
              本プライバシーポリシーは、予告なく変更される場合があります。
              重要な変更がある場合は、サービス内で通知いたします。
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}


