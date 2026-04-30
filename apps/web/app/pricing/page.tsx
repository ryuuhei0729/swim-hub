import Link from "next/link";
import type { Metadata } from "next";
import {
  CheckIcon,
  XMarkIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { safeJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "料金プラン | SwimHub",
  description:
    "SwimHubの料金プランをご確認ください。無料プランでも基本機能が使えます。Premiumプランは月額¥500、年額¥5,000で全機能が無制限に。7日間の無料トライアル付き。",
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: {
    title: "料金プラン | SwimHub",
    description:
      "SwimHubの料金プラン。無料で始めて、Premiumで全機能を解放。月額¥500 / 年額¥5,000。",
    type: "website",
    locale: "ja_JP",
  },
};

const CHECK = (
  <CheckIcon className="h-5 w-5 text-blue-600 shrink-0" />
);
const CROSS = (
  <XMarkIcon className="h-5 w-5 text-gray-300 shrink-0" />
);

const COMPARISON_ROWS: { feature: string; free: string | boolean; premium: string | boolean }[] = [
  { feature: "練習記録", free: true, premium: true },
  { feature: "大会記録", free: true, premium: true },
  { feature: "ベストタイム表", free: true, premium: true },
  { feature: "チーム機能", free: true, premium: true },
  { feature: "目標管理", free: true, premium: true },
  { feature: "Split-time", free: "最大3個/記録", premium: "無制限" },
  { feature: "PracticeTime", free: "最大18個/練習ログ", premium: "無制限" },
  { feature: "画像・動画アップロード", free: false, premium: true },
  { feature: "SwimHub Scanner 連携", free: true, premium: true },
  { feature: "SwimHub Timer 連携", free: true, premium: true },
];

const PRICING_FAQS: { question: string; answer: string }[] = [
  {
    question: "無料トライアル中に課金されますか？",
    answer: "いいえ。7日間の無料トライアル中は一切課金されません。トライアル終了前にキャンセルすれば料金は発生しません。",
  },
  {
    question: "年払いと月払いの違いは？",
    answer: "年払いは¥5,000/年で、月払い（¥500/月 = ¥6,000/年）と比べて2ヶ月分（¥1,000）お得です。",
  },
  {
    question: "途中でプランを変更できますか？",
    answer: "はい。いつでもアップグレード・ダウングレードが可能です。設定画面からプランを管理できます。",
  },
  {
    question: "SwimHub Scanner や SwimHub Timer も使えますか？",
    answer: "はい。SwimHub の Premium プランに加入すると、SwimHub Scanner・SwimHub Timer の有料機能も統一課金で利用できます。",
  },
];

function CellContent({ value }: { value: string | boolean }) {
  if (typeof value === "string") {
    return <span className="text-sm text-gray-700">{value}</span>;
  }
  return value ? CHECK : CROSS;
}

export default function PricingPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: PRICING_FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "料金プラン | SwimHub",
    description:
      "SwimHubの料金プラン。無料で始めて、Premiumで全機能を解放。",
    url: `${SITE_URL}/pricing`,
    mainEntity: [
      {
        "@type": "Offer",
        name: "Free プラン",
        price: "0",
        priceCurrency: "JPY",
        description: "基本機能が使える無料プラン",
      },
      {
        "@type": "Offer",
        name: "Premium プラン（月額）",
        price: "500",
        priceCurrency: "JPY",
        description: "全機能無制限の月額プラン。7日間無料トライアル付き。",
      },
      {
        "@type": "Offer",
        name: "Premium プラン（年額）",
        price: "5000",
        priceCurrency: "JPY",
        description:
          "全機能無制限の年額プラン。2ヶ月分お得。7日間無料トライアル付き。",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      <div className="min-h-screen bg-white">
        {/* ヘッダー */}
        <header className="bg-white border-b border-gray-200">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-gray-900">SwimHub</span>
              </Link>
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  ログイン
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  無料登録
                </Link>
              </div>
            </div>
          </nav>
        </header>

        {/* ヒーロー */}
        <section className="py-16 sm:py-20 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              料金プラン
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              まずは無料で始めて、必要に応じてPremiumにアップグレード。
              <br className="hidden sm:block" />
              7日間の無料トライアルですべての機能をお試しいただけます。
            </p>
          </div>
        </section>

        {/* プランカード */}
        <section className="py-12 sm:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
              {/* Free */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 flex flex-col shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Free</h2>
                <div className="mb-6">
                  <span className="text-5xl font-bold text-gray-900">¥0</span>
                  <span className="text-base text-gray-500 ml-1">/月</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {[
                    "練習記録・大会記録",
                    "ベストタイム表",
                    "チーム機能・目標管理",
                    "Split-time: 最大3個/記録",
                    "PracticeTime: 最大18個/練習ログ",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckIcon className="h-5 w-5 text-gray-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-sm text-gray-400">
                    <XMarkIcon className="h-5 w-5 text-gray-300 shrink-0" />
                    画像・動画アップロード
                  </li>
                </ul>
                <Link
                  href="/signup"
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  無料で始める
                </Link>
              </div>

              {/* Premium */}
              <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 sm:p-8 flex flex-col shadow-sm relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-600 text-white whitespace-nowrap">
                  7日間無料トライアル
                </span>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Premium</h2>
                <div className="mb-1">
                  <span className="text-5xl font-bold text-gray-900">¥500</span>
                  <span className="text-base text-gray-500 ml-1">/月</span>
                </div>
                <p className="text-sm text-gray-500 mb-6">
                  年払い: ¥5,000/年
                  <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    2ヶ月分お得
                  </span>
                </p>
                <ul className="space-y-3 mb-8 flex-1">
                  {[
                    "全機能無制限",
                    "Split-time: 無制限",
                    "PracticeTime: 無制限",
                    "画像・動画アップロード",
                    "7日間の無料トライアル付き",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckIcon className="h-5 w-5 text-blue-600 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  無料トライアルを始める
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 比較表 */}
        <section className="py-12 sm:py-16 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-8">
              機能比較
            </h2>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-4 px-4 sm:px-6 text-sm font-semibold text-gray-900">
                        機能
                      </th>
                      <th className="text-center py-4 px-4 sm:px-6 text-sm font-semibold text-gray-900">
                        Free
                      </th>
                      <th className="text-center py-4 px-4 sm:px-6 text-sm font-semibold text-blue-600">
                        Premium
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {COMPARISON_ROWS.map((row) => (
                      <tr key={row.feature} className="hover:bg-gray-50/50">
                        <td className="py-4 px-4 sm:px-6 text-sm font-medium text-gray-900">
                          {row.feature}
                        </td>
                        <td className="py-4 px-4 sm:px-6 text-center">
                          <span className="inline-flex justify-center">
                            <CellContent value={row.free} />
                          </span>
                        </td>
                        <td className="py-4 px-4 sm:px-6 text-center">
                          <span className="inline-flex justify-center">
                            <CellContent value={row.premium} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-12 sm:py-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-8">
              よくある質問
            </h2>

            <div className="space-y-6">
              {PRICING_FAQS.map(({ question, answer }) => (
                <div key={question} className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-base font-semibold text-gray-900 mb-2">{question}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20 bg-blue-600">
          <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              今すぐ無料で始めよう
            </h2>
            <p className="text-base text-blue-100 mb-8">
              アカウント作成は無料。7日間の無料トライアルで全機能をお試しいただけます。
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg text-base font-semibold transition-colors shadow-lg"
              >
                無料登録
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center border-2 border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3 rounded-lg text-base font-semibold transition-colors"
              >
                ログイン
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
