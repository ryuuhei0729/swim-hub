"use client";

import { ArrowLeftIcon, HomeIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import Link from "next/link";

// Global 404: root layout が `<html>` を出さないため、ここで自前で出力する。
// next-intl + App Router の推奨パターン (app/[locale]/layout.tsx に html を移動した影響)。

export default function NotFound() {
  return (
    <html lang="ja" className="h-full">
      <body className="font-sans">
        <div className="min-h-screen bg-blue-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8 text-center">
            {/* ロゴ */}
            <div className="flex justify-center">
              <div className="w-20 h-20 flex items-center justify-center mr-1">
                <Image
                  src="/favicon.png"
                  alt="SwimHub"
                  width={80}
                  height={80}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* エラーメッセージ */}
            <div>
              <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">
                ページが見つかりません
              </h2>
              <p className="text-gray-600 mb-8 leading-relaxed">
                お探しのページは存在しないか、移動または削除された可能性があります。
                <br />
                URLをご確認いただくか、下記のボタンからホームページにお戻りください。
              </p>
            </div>

            {/* アクションボタン */}
            {/*
              グローバル 404 は locale を判別できないため、locale なしパスを使い
              middleware の locale リダイレクトに委ねる。これにより英語ユーザーが
              /en で来た場合、/dashboard → /ja/dashboard ではなく
              middleware が locale を保持するルーティングを行う。
            */}
            <div className="space-y-4">
              <Link href="/dashboard" className="btn-primary btn-lg w-full group">
                <HomeIcon className="w-5 h-5 mr-2" />
                ダッシュボードに戻る
              </Link>

              <Link href="/" className="btn-outline btn-lg w-full group">
                <ArrowLeftIcon className="w-5 h-5 mr-2" />
                ホームに戻る
              </Link>
            </div>

            {/* サポート情報 */}
            <div className="pt-8 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                問題が続く場合は、
                <Link
                  href="/support"
                  className="text-swim-600 hover:text-swim-700 font-medium"
                >
                  サポート
                </Link>
                までお問い合わせください。
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
