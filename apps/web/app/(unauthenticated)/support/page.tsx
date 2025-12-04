import React from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, QuestionMarkCircleIcon, BookOpenIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'

export const metadata = {
  title: 'サポート・FAQ | SwimHub',
  description: 'SwimHubのサポート情報とよくある質問',
}

export default function SupportPage() {
  const faqs = [
    {
      category: 'アカウント',
      questions: [
        {
          q: 'アカウントの作成方法を教えてください',
          a: 'トップページの「無料で始める」ボタン、または「サインアップ」ページからメールアドレスとパスワードを入力してアカウントを作成できます。',
        },
        {
          q: 'パスワードを忘れてしまいました',
          a: 'ログインページの「パスワードを忘れた場合」リンクから、メールアドレスを入力してパスワードリセットの手続きを行ってください。',
        },
        {
          q: 'アカウントを削除したいです',
          a: 'マイページの設定からアカウントを削除できます。削除すると、すべてのデータが完全に削除され、復元できませんのでご注意ください。',
        },
      ],
    },
    {
      category: '機能について',
      questions: [
        {
          q: '練習記録を追加する方法を教えてください',
          a: 'ダッシュボードまたは練習管理ページから「練習を追加」ボタンをクリックし、日付、場所、内容、タイムなどを入力して保存してください。',
        },
        {
          q: '大会記録を登録する方法を教えてください',
          a: '大会管理ページから「大会を追加」ボタンをクリックし、大会情報を入力してください。その後、エントリー種目と記録を登録できます。',
        },
        {
          q: 'チームに参加する方法を教えてください',
          a: 'チーム管理ページから「チームに参加」を選択し、チームIDまたは招待リンクを入力して参加できます。',
        },
        {
          q: 'チームを作成する方法を教えてください',
          a: 'チーム管理ページから「チームを作成」ボタンをクリックし、チーム名や説明を入力して作成できます。',
        },
      ],
    },
    {
      category: 'データ管理',
      questions: [
        {
          q: 'データをエクスポートできますか',
          a: '現在、データのエクスポート機能は実装中です。今後追加予定です。',
        },
        {
          q: 'データはどこに保存されていますか',
          a: 'すべてのデータはSupabaseのセキュアなデータベースに保存されています。データは暗号化され、適切に保護されています。',
        },
        {
          q: 'チームを退会した場合、個人データはどうなりますか',
          a: 'チームを退会しても、個人の練習記録や大会記録などのデータは保持されます。チーム関連のデータのみが削除されます。',
        },
      ],
    },
    {
      category: 'その他',
      questions: [
        {
          q: 'モバイルアプリはありますか',
          a: '現在はWebアプリのみの提供です。モバイルアプリは開発中です。',
        },
        {
          q: '料金はかかりますか',
          a: '現在、SwimHubは無料でご利用いただけます。将来的に有料プランを追加する場合は、事前に通知いたします。',
        },
        {
          q: '不具合を報告したいです',
          a: 'お問い合わせページから不具合の詳細をご報告ください。できる限り早急に対応いたします。',
        },
      ],
    },
  ]

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
            <QuestionMarkCircleIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">サポート・FAQ</h1>
          </div>
          <p className="text-gray-600">
            SwimHubの使い方やよくある質問をまとめました。お困りの際はこちらをご確認ください。
          </p>
        </div>

        {/* FAQセクション */}
        <div className="space-y-6">
          {faqs.map((category) => (
            <div key={category.category} className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center mb-4">
                <BookOpenIcon className="w-6 h-6 text-blue-600 mr-2" />
                <h2 className="text-xl font-semibold text-gray-900">{category.category}</h2>
              </div>
              <div className="space-y-4">
                {category.questions.map((faq, index) => (
                  <div key={index} className="border-l-4 border-blue-200 pl-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">{faq.q}</h3>
                    <p className="text-gray-700 leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* お問い合わせセクション */}
        <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center mb-4">
            <ChatBubbleLeftRightIcon className="w-6 h-6 text-blue-600 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">まだ解決しませんか？</h2>
          </div>
          <p className="text-gray-700 mb-4">
            上記のFAQで解決しない場合は、お気軽にお問い合わせください。
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            お問い合わせする
          </Link>
        </div>
      </div>
    </div>
  )
}


