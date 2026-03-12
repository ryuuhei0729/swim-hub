import React from "react";
import "./globals.css";
import type { Metadata } from 'next'
import { Inter, Noto_Sans_JP } from 'next/font/google'
import { AuthProvider } from '../contexts'
import QueryProvider from '../providers/QueryProvider'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto-sans-jp',
  weight: ['400', '500', '700'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://swim-hub.app'),
  alternates: { canonical: '/' },
  title: 'SwimHub - 水泳選手のための記録管理システム',
  description: '個人でもチームでも使える、水泳記録帳。練習記録、大会記録、目標管理をシンプルに。チーム不要、今すぐ無料で始められます。',
  icons: {
    icon: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  keywords: ['水泳', '記録管理', 'スイミング', '練習記録', '大会記録', 'タイム管理', 'SwimHub', '水泳選手', 'マスターズスイマー'],
  openGraph: {
    title: 'SwimHub - 水泳選手のための記録管理システム',
    description: '個人でもチームでも使える、あなただけの水泳記録帳',
    type: 'website',
    locale: 'ja_JP',
    images: [{ url: '/icon.png', width: 512, height: 512, alt: 'SwimHub' }],
  },
  twitter: {
    card: 'summary',
    title: 'SwimHub - 水泳選手のための記録管理システム',
    description: '個人でもチームでも使える、水泳記録帳。',
    images: ['/icon.png'],
  },
  verification: {
    google: 'RoXStue6q2fniUkpnsNg8QDsTpTXufSKBJKxPGvewlc',
  },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 認証チェックは proxy.ts で一元管理
    // レイアウトの条件分岐は各ルートグループの layout.tsx で処理
    const jsonLd = [
        {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'SwimHub',
            description: '水泳選手のための記録管理システム',
            applicationCategory: 'SportsApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
            inLanguage: 'ja',
        },
        {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'SwimHub',
            url: 'https://swim-hub.app',
            logo: 'https://swim-hub.app/favicon.png',
        },
    ]

    return (
        <html lang="ja" className="h-full">
            <body className={`${inter.variable} ${notoSansJP.variable} font-sans`}>
                {jsonLd.map((data, i) => (
                    <script
                        key={i}
                        type="application/ld+json"
                        dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
                    />
                ))}
                <AuthProvider>
                    <QueryProvider>
                        {children}
                    </QueryProvider>
                </AuthProvider>
            </body>
        </html>
    );
}
