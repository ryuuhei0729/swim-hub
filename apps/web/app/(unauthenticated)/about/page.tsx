import React from 'react'
import Link from 'next/link'
import { BuildingOfficeIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { BackButton } from '@/components/ui/BackButton'

export const revalidate = 3600

export const metadata = {
  title: '運営者情報 | SwimHub',
  description: 'SwimHubの運営者情報・サービス概要についてご紹介します。',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <BackButton />
          <div className="flex items-center mb-4">
            <BuildingOfficeIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">運営者情報</h1>
          </div>
          <p className="text-gray-600">
            SwimHubの運営者・サービス概要についてご案内します。
          </p>
        </div>

        {/* コンテンツ */}
        <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
          {/* サービス概要 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">サービス概要</h2>
            <p className="text-gray-700 leading-relaxed">
              SwimHub は、水泳選手・コーチ・チーム管理者のための記録管理サービスです。
              練習記録や大会記録の管理、ベストタイムの自動更新、目標設定など、
              水泳に関するあらゆるデータを一元管理できるWebアプリケーションを提供しています。
            </p>
          </section>

          {/* 運営者情報テーブル */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">運営者情報</h2>
            <div className="overflow-hidden border border-gray-200 rounded-lg">
              <table className="w-full text-left">
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700 w-1/3">
                      サービス名
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">SwimHub</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700">
                      運営者
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">Ryuhei Hosoi</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700">
                      所在地
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">日本</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700">
                      連絡先
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <Link href="/contact" className="text-blue-600 hover:text-blue-800 underline">
                        お問い合わせフォーム
                      </Link>
                      よりご連絡ください
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700">
                      サービスURL
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <a
                        href="https://swim-hub.app"
                        className="text-blue-600 hover:text-blue-800 underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        https://swim-hub.app
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 運営者プロフィール */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              <span className="inline-flex items-center">
                <UserCircleIcon className="w-6 h-6 text-blue-600 mr-2" />
                運営者プロフィール
              </span>
            </h2>
            <div className="bg-blue-50 rounded-lg p-6">
              <p className="text-gray-700 leading-relaxed mb-4">
                はじめまして。SwimHub 運営者の <strong>Ryuhei</strong> です。
              </p>
              <p className="text-gray-700 leading-relaxed mb-4">
                学生時代から選手やコーチとして水泳に取り組んでおり、
                「練習記録や大会結果をもっと簡単に管理できたら」と感じていました。
                当時はノートやスプレッドシートで記録を管理していましたが、
                データが散らばってしまい、過去の記録を振り返るのも一苦労でした。
              </p>
              <p className="text-gray-700 leading-relaxed mb-4">
                そこで、水泳に特化した記録管理ツールを自ら開発しようと思い立ち、
                SwimHub を立ち上げました。
                「すべての水泳選手が、自分の成長を簡単に記録・可視化できるように」
                という想いで、日々サービスの改善に取り組んでいます。
              </p>
              <p className="text-gray-700 leading-relaxed">
                エンジニアとしての技術を活かしながら、水泳に関わるすべての方に
                役立つサービスを提供できるよう努めてまいります。
                ご要望やご意見がございましたら、お気軽に
                <Link href="/contact" className="text-blue-600 hover:text-blue-800 underline">
                  お問い合わせ
                </Link>
                ください。
              </p>
            </div>
          </section>

          {/* サービスの目的 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">サービスの目的</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              SwimHub は、以下の課題を解決するために開発されました。
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>紙やスプレッドシートでの記録管理の手間を削減</li>
              <li>練習記録・大会記録を一元的に管理し、成長の可視化を支援</li>
              <li>チーム内での記録共有やコーチによる代理入力をスムーズに</li>
              <li>水泳選手のモチベーション向上と目標達成をサポート</li>
            </ul>
          </section>

          {/* 関連サービス */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">関連サービス</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              SwimHub では、以下の関連サービスも提供しています。
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>
                <strong>SwimHub Timer</strong> — 水泳練習用のインターバルタイマー
              </li>
              <li>
                <strong>SwimHub Scanner</strong> — AI を活用した大会結果の自動読み取り
              </li>
            </ul>
          </section>

          {/* ポリシー */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">各種ポリシー</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              当サービスの各種ポリシーについては、以下のページをご確認ください。
            </p>
            <ul className="space-y-3 ml-4">
              <li>
                <Link href="/privacy" className="text-blue-600 hover:text-blue-800 underline">
                  プライバシーポリシー
                </Link>
                <span className="text-gray-500 text-sm ml-2">— 個人情報の取り扱いについて</span>
              </li>
              <li>
                <Link href="/terms" className="text-blue-600 hover:text-blue-800 underline">
                  利用規約
                </Link>
                <span className="text-gray-500 text-sm ml-2">— サービスのご利用条件について</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
