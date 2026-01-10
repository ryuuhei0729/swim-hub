import React from "react";
import "./globals.css";
import { headers } from "next/headers";
import { cachedValidateAuthWithRedirect } from "@/lib/supabase-auth/auth";
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AuthProvider } from '../contexts'
import QueryProvider from '../providers/QueryProvider'
import 'react-device-frameset/styles/marvel-devices.min.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
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
  },
  verification: {
    google: 'RoXStue6q2fniUkpnsNg8QDsTpTXufSKBJKxPGvewlc',
  },
}

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // ---------------------------------------------
    // リクエストURLを取得
    // ---------------------------------------------
    const headersList = await headers();
    const pathname = headersList.get("x-current-path");
    const isLoginPage = pathname?.startsWith("/login");
    const isRootPage = pathname === "/";
    
    // 認証が不要なページ（LP、ログインページ、認証関連ページ、静的ページ）
    const publicPages = [
        "/login",
        "/signup",
        "/reset-password",
        "/contact",
        "/privacy",
        "/terms",
        "/support",
    ];
    const isPublicPage = isRootPage || isLoginPage || publicPages.some(page => pathname?.startsWith(page));

    // ---------------------------------------------
    // 認証確認: 公開ページ以外
    // ---------------------------------------------
    if (!isPublicPage) {
        await cachedValidateAuthWithRedirect();
    }

    return (
        <html lang="ja" className="h-full">
            <body className={inter.className}>
                <AuthProvider>
                    <QueryProvider>
                        {isPublicPage
                            ? <>{children}</>
                            : <main className="relative min-h-screen">
                                <div className="min-h-screen bg-gray-50">
                                    {children}
                                </div>
                            </main>
                        }
                    </QueryProvider>
                </AuthProvider>
            </body>
        </html>
    );
}
