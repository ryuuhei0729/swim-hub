import React from "react";
import "./globals.css";
import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import { AuthProvider } from "../contexts";
import QueryProvider from "../providers/QueryProvider";
import { KeyboardScrollProvider } from "../components/keyboard/KeyboardScrollProvider";
import { safeJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/constants";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
    languages: { ja: SITE_URL },
  },
  manifest: "/manifest.json",
  title: "SwimHub - 水泳選手のための記録管理システム",
  description:
    "練習も大会もチーム管理も。中高大マスターズまで、選手ひとりの水泳記録を一生分積み上げる無料の記録プラットフォーム。",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  keywords: [
    "水泳",
    "記録管理",
    "スイミング",
    "練習記録",
    "大会記録",
    "タイム管理",
    "SwimHub",
    "水泳選手",
    "マスターズスイマー",
  ],
  openGraph: {
    title: "SwimHub - 水泳選手のための記録管理システム",
    description: "個人でもチームでも使える、あなただけの水泳記録帳",
    type: "website",
    locale: "ja_JP",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SwimHub - 水泳の記録を一生分残す" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SwimHub - 水泳選手のための記録管理システム",
    description: "個人でもチームでも使える、水泳記録帳。",
    images: ["/og-image.png"],
  },
  verification: {
    google: "RoXStue6q2fniUkpnsNg8QDsTpTXufSKBJKxPGvewlc",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 認証チェックは proxy.ts で一元管理
  // レイアウトの条件分岐は各ルートグループの layout.tsx で処理
  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "SwimHub",
      description: "水泳選手のための記録管理システム",
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      offers: [
        {
          "@type": "Offer",
          name: "Free プラン",
          price: "0",
          priceCurrency: "JPY",
        },
        {
          "@type": "Offer",
          name: "Premium プラン（月額）",
          price: "500",
          priceCurrency: "JPY",
          billingIncrement: "P1M",
        },
        {
          "@type": "Offer",
          name: "Premium プラン（年額）",
          price: "5000",
          priceCurrency: "JPY",
          billingIncrement: "P1Y",
        },
      ],
      inLanguage: "ja",
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SwimHub",
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "SwimHub",
      url: SITE_URL,
    },
  ];

  return (
    <html lang="ja" className="h-full">
      <head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="SwimHub ブログ RSS"
          href="/blog/feed.xml"
        />
      </head>
      <body className={`${inter.variable} ${notoSansJP.variable} font-sans`}>
        {jsonLd.map((data, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
          />
        ))}
        <QueryProvider>
          <AuthProvider>
            <KeyboardScrollProvider>{children}</KeyboardScrollProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
