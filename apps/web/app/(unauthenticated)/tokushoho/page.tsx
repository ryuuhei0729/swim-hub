import React from "react";
import Link from "next/link";
import { ScaleIcon } from "@heroicons/react/24/outline";
import { BackButton } from "@/components/ui/BackButton";
import { formatDate } from "@apps/shared/utils/date";

export const revalidate = 3600;

export const metadata = {
  title: "特定商取引法に基づく表記 | SwimHub",
  description:
    "SwimHubの特定商取引法に基づく表記。販売事業者、所在地、連絡先、販売価格、支払方法、返品ポリシー等の情報を掲載しています。",
  alternates: { canonical: "/tokushoho" },
};

export default function TokushohoPage() {
  const rows = [
    { label: "販売事業者", value: "Ryuhei Hosoi（個人事業）" },
    {
      label: "運営統括責任者",
      value: "細井 龍平（Ryuhei Hosoi）",
    },
    {
      label: "所在地",
      value:
        "請求があった場合は遅滞なく開示いたします。お問い合わせフォームよりご連絡ください。",
    },
    {
      label: "電話番号",
      value:
        "請求があった場合は遅滞なく開示いたします。お問い合わせフォームよりご連絡ください。",
    },
    {
      label: "メールアドレス",
      value:
        "請求があった場合は遅滞なく開示いたします。お問い合わせフォームよりご連絡ください。",
    },
    {
      label: "販売URL",
      value: (
        <div className="space-y-1">
          <div>
            <a
              href="https://swim-hub.app"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              https://swim-hub.app
            </a>
            （SwimHub）
          </div>
          <div>
            <a
              href="https://scanner.swim-hub.app"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              https://scanner.swim-hub.app
            </a>
            （SwimHub Scanner）
          </div>
          <div>
            <a
              href="https://timer.swim-hub.app"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              https://timer.swim-hub.app
            </a>
            （SwimHub Timer）
          </div>
        </div>
      ),
    },
    {
      label: "お問い合わせ",
      value: (
        <Link
          href="/contact"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          お問い合わせフォーム
        </Link>
      ),
    },
    {
      label: "販売価格",
      value: (
        <div className="space-y-1">
          <div>SwimHub プレミアムプラン：月額 ¥500（税込）/ 年額 ¥5,000（税込）</div>
          <div className="text-sm text-gray-500">
            ※ 各サービスの料金詳細は、それぞれのサービス内の料金ページをご確認ください。
          </div>
        </div>
      ),
    },
    {
      label: "販売価格以外の必要料金",
      value:
        "インターネット接続に必要な通信費はお客様のご負担となります。",
    },
    {
      label: "支払方法",
      value:
        "クレジットカード（Visa、Mastercard、American Express、JCB）※ Stripe を通じた決済。モバイルアプリの場合は Apple App Store / Google Play のアプリ内課金（RevenueCat 経由）。",
    },
    {
      label: "支払時期",
      value:
        "サブスクリプション登録時に即時課金されます。初回登録時は7日間の無料トライアル期間があり、トライアル期間中にキャンセルしない場合、トライアル終了後に自動的に課金が開始されます。以降、月額プランは毎月、年額プランは毎年自動更新時に課金されます。",
    },
    {
      label: "商品の引渡し時期",
      value:
        "決済完了後、即時にプレミアム機能をご利用いただけます。",
    },
    {
      label: "返品・キャンセルについて",
      value:
        "デジタルサービスの性質上、購入後の返品・返金は原則としてお受けしておりません。サブスクリプションの解約はいつでも可能です。Web 経由の場合は Stripe カスタマーポータルから、モバイルアプリの場合は各ストアのサブスクリプション管理画面から行えます。解約後も、現在の課金期間が終了するまでプレミアム機能をご利用いただけます。",
    },
    {
      label: "動作環境",
      value:
        "Web ブラウザ（Google Chrome、Safari、Firefox、Microsoft Edge の最新版を推奨）。iOS / Android のモバイルアプリにも対応しています。",
    },
    {
      label: "特別な販売条件",
      value:
        "未成年者が購入する場合は、法定代理人（保護者）の同意を得た上でご利用ください。",
    },
  ];

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <BackButton />
          <div className="flex items-center mb-4">
            <ScaleIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">
              特定商取引法に基づく表記
            </h1>
          </div>
          <p className="text-sm text-gray-500">
            最終更新日: {formatDate(new Date("2026-03-14"), "long")}
          </p>
        </div>

        {/* コンテンツ */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="overflow-hidden border border-gray-200 rounded-lg">
            <table className="w-full text-left">
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700 w-1/3 align-top">
                      {row.label}
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {row.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              関連ページ
            </h2>
            <ul className="space-y-2 ml-4">
              <li>
                <Link
                  href="/terms"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  利用規約
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  プライバシーポリシー
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  運営者情報・サービス概要
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
