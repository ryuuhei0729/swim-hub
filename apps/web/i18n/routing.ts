import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ja", "en", "zh", "ko", "de"],
  defaultLocale: "ja",
  localePrefix: "always",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

/**
 * pathname から locale プレフィックスを除去した正規化パスを返す。
 * 例: "/ja/dashboard" → "/dashboard", "/en" → "/", "/dashboard" → "/dashboard"
 */
export function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

/**
 * pathname の先頭セグメントから locale を抽出する。
 * 不正なら defaultLocale を返す。
 */
export function extractLocale(pathname: string): Locale {
  const firstSegment = pathname.split("/")[1];
  return routing.locales.includes(firstSegment as Locale)
    ? (firstSegment as Locale)
    : routing.defaultLocale;
}

/**
 * Referer ヘッダ (例: "https://swim-hub.app/en/teams/...") から locale を抽出する。
 * locale セグメントを持たない API Route で、呼び出し元ページの locale を得るために使う
 * (localePrefix: "always" のため認証ページの URL には必ず locale が含まれる)。
 * referer 不在・不正なら defaultLocale を返す。
 */
export function localeFromReferer(referer: string | null): Locale {
  if (!referer) return routing.defaultLocale;
  try {
    return extractLocale(new URL(referer).pathname);
  } catch {
    return routing.defaultLocale;
  }
}
