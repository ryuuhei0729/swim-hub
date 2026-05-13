import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import React from "react";

import { KeyboardScrollProvider } from "@/components/keyboard/KeyboardScrollProvider";
import { AuthProvider } from "@/contexts";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/constants";
import { safeJsonLd } from "@/lib/seo";
import QueryProvider from "@/providers/QueryProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "700"],
});

type Locale = (typeof routing.locales)[number];

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isJa = locale === "ja";

  const title = isJa
    ? "SwimHub - 水泳選手のための記録管理システム"
    : "SwimHub - Swim records & training platform";
  const description = isJa
    ? "練習も大会もチーム管理も。中高大マスターズまで、選手ひとりの水泳記録を一生分積み上げる無料の記録プラットフォーム。"
    : "Track practices, meets, and team management. A free swim records platform for athletes of all levels.";

  return {
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: {
        ja: `${SITE_URL}/ja`,
        en: `${SITE_URL}/en`,
        "x-default": `${SITE_URL}/ja`,
      },
    },
    manifest: "/manifest.json",
    title,
    description,
    icons: {
      icon: "/favicon.png",
      apple: "/apple-touch-icon.png",
    },
    keywords: isJa
      ? [
          "水泳",
          "記録管理",
          "スイミング",
          "練習記録",
          "大会記録",
          "タイム管理",
          "SwimHub",
          "水泳選手",
          "マスターズスイマー",
        ]
      : [
          "swimming",
          "swim records",
          "training log",
          "swim meet",
          "swim team",
          "SwimHub",
        ],
    openGraph: {
      title,
      description,
      type: "website",
      locale: isJa ? "ja_JP" : "en_US",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: isJa
            ? "SwimHub - 水泳の記録を一生分残す"
            : "SwimHub - swim records for life",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
    verification: {
      google: "RoXStue6q2fniUkpnsNg8QDsTpTXufSKBJKxPGvewlc",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // 不正なロケールの場合は 404
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  // Server Components 内で useTranslations / useFormatter を使うために locale を登録
  setRequestLocale(locale);

  // メッセージ取得 (locale を明示的に渡して、Turbopack 環境での requestLocale 伝播失敗を回避)
  const messages = await getMessages({ locale });

  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "SwimHub",
      description:
        locale === "ja"
          ? "水泳選手のための記録管理システム"
          : "Swim records & training platform",
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
      inLanguage: locale,
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
    <html lang={locale} className="h-full">
      <head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="SwimHub Blog RSS"
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
        <NextIntlClientProvider key={locale} locale={locale} messages={messages}>
          <QueryProvider>
            <AuthProvider>
              <KeyboardScrollProvider>{children}</KeyboardScrollProvider>
            </AuthProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
