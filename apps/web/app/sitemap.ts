import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-static";

/**
 * 公開ページの sitemap。
 *
 * localePrefix: "always" のため、URL には必ず locale プレフィックスが要る。
 * プレフィックス無しの URL を載せると next-intl が 307 で飛ばすため、
 * 検索エンジンにはリダイレクトしか渡らない (2026-09 まで実際にそうなっていた)。
 *
 * 各 URL には alternates.languages で全 locale を相互参照させる (hreflang)。
 */
type PublicPage = {
  /** locale プレフィックスを除いたパス。ルートは "" */
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

// 認証不要かつ検索結果に出したいページのみ。
// robots.ts の disallow と食い違わせないこと。
const PUBLIC_PAGES: PublicPage[] = [
  { path: "", changeFrequency: "weekly", priority: 1.0 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/signup", changeFrequency: "monthly", priority: 0.7 },
  { path: "/time-level", changeFrequency: "monthly", priority: 0.6 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/login", changeFrequency: "monthly", priority: 0.5 },
  { path: "/support", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/tokushoho", changeFrequency: "yearly", priority: 0.3 },
];

function urlFor(locale: string, path: string): string {
  return `${SITE_URL}/${locale}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_PAGES.flatMap(({ path, changeFrequency, priority }) => {
    const languages = Object.fromEntries(
      routing.locales.map((locale) => [locale, urlFor(locale, path)]),
    );

    return routing.locales.map((locale) => ({
      url: urlFor(locale, path),
      lastModified,
      changeFrequency,
      priority,
      alternates: { languages },
    }));
  });
}
