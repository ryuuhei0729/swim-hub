import React from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, DocumentTextIcon } from '@heroicons/react/24/outline'

export const metadata = {
  title: '利用規約 | SwimHub',
  description: 'SwimHubの利用規約',
}

export default function TermsPage() {
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
            <DocumentTextIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">利用規約</h1>
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
              本利用規約（以下「本規約」）は、SwimHub（以下「当サービス」）の利用条件を定めるものです。
              当サービスをご利用いただく際は、本規約に同意いただいたものとみなします。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. サービスの内容</h2>
            <p className="text-gray-700 leading-relaxed">
              当サービスは、水泳選手の練習記録、大会記録、目標管理などの機能を提供するWebアプリケーションです。
              個人利用およびチーム利用の両方に対応しています。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. アカウント登録</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              当サービスを利用するには、アカウント登録が必要です。登録時には以下を遵守してください：
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>正確で最新の情報を提供すること</li>
              <li>アカウント情報の管理責任を負うこと</li>
              <li>不正アクセスを防ぐため、パスワードを適切に管理すること</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. 利用者の禁止行為</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              以下の行為を禁止します：
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>法令または公序良俗に違反する行為</li>
              <li>犯罪行為に関連する行為</li>
              <li>当サービスの内容等、当サービスの利用に関する一切の情報を無断で複製、転載、改変等すること</li>
              <li>当サービスまたは他の利用者のサーバーまたはネットワークの機能を破壊したり、妨害したりする行為</li>
              <li>当サービスによって得られた情報を商業的に利用する行為</li>
              <li>当サービスの運営を妨害するおそれのある行為</li>
              <li>不正アクセス、不正な方法による情報の取得</li>
              <li>他の利用者に関する個人情報等を収集または蓄積する行為</li>
              <li>不正な目的を持ってサービスを利用する行為</li>
              <li>その他、当サービスが不適切と判断する行為</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. 知的財産権</h2>
            <p className="text-gray-700 leading-relaxed">
              当サービスに関する知的財産権は、当サービス提供者または正当な権利者に帰属します。
              ユーザーが投稿したコンテンツに関する知的財産権は、ユーザーに帰属しますが、
              当サービスは、当サービスの提供、改善、宣伝のために、ユーザーが投稿したコンテンツを使用できるものとします。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. 免責事項</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              当サービスは、以下の事項について一切の責任を負いません：
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
              <li>当サービスに起因してユーザーに生じたあらゆる損害について一切の責任を負いません</li>
              <li>当サービスが提供する情報の正確性、完全性、有用性、適時性、信頼性等について一切保証しません</li>
              <li>当サービスに起因してユーザーに生じた損害について、一切の責任を負いません</li>
              <li>当サービスの中断、停止、終了、利用不能、またはデータの消失等により生じた損害について、一切の責任を負いません</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. サービスの変更・終了</h2>
            <p className="text-gray-700 leading-relaxed">
              当サービスは、ユーザーへの事前通知なく、サービスの内容を変更し、または提供を終了することができるものとします。
              当サービスがサービスを終了する場合、可能な限り事前に通知いたします。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. 規約の変更</h2>
            <p className="text-gray-700 leading-relaxed">
              当サービスは、必要に応じて、本規約を変更することができるものとします。
              変更後の規約は、当サービス上に掲載した時点で効力を生じるものとします。
              重要な変更がある場合は、サービス内で通知いたします。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. 準拠法・管轄裁判所</h2>
            <p className="text-gray-700 leading-relaxed">
              本規約の解釈にあたっては、日本法を準拠法とします。
              本規約に起因しまたは関連する一切の紛争については、当サービス提供者の所在地を管轄する裁判所を専属的合意管轄とします。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">10. お問い合わせ</h2>
            <p className="text-gray-700 leading-relaxed">
              本規約に関するご質問やご意見がございましたら、
              <Link href="/contact" className="text-blue-600 hover:text-blue-800 underline">
                お問い合わせページ
              </Link>
              よりご連絡ください。
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}


