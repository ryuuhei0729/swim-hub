import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ja", "en"],
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
