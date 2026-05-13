"use client";

import { useLocale, useTranslations } from "next-intl";
import { stripLocale } from "@/i18n/routing";

const LOCALES = [
  { code: "ja", label: "JA", aria: "日本語" },
  { code: "en", label: "EN", aria: "English" },
] as const;

type Locale = (typeof LOCALES)[number]["code"];

export default function LanguageSwitcher() {
  const currentLocale = useLocale() as Locale;
  const t = useTranslations("common.aria");

  const handleClick = (target: Locale) => {
    if (target === currentLocale) return;
    // フル再ロードで locale を確実に切り替える (next-intl v3 + Next.js 16 + Turbopack で
    // router.replace では layout の RSC キャッシュが残り messages が更新されないため)
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "/";
    const search = typeof window !== "undefined" ? window.location.search : "";
    const cleanPath = stripLocale(currentPath);
    const url = `/${target}${cleanPath === "/" ? "" : cleanPath}${search}`;
    window.location.assign(url);
  };

  return (
    <div
      className="flex items-center text-sm"
      role="group"
      aria-label={t("switchLanguage")}
    >
      {LOCALES.map(({ code, label, aria }, idx) => {
        const isCurrent = code === currentLocale;
        return (
          <span key={code} className="flex items-center">
            <button
              type="button"
              onClick={() => handleClick(code)}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={aria}
              className={`px-2 py-1 rounded transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                isCurrent
                  ? "font-semibold text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
            {idx < LOCALES.length - 1 && (
              <span className="text-gray-300 px-1" aria-hidden="true">
                |
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
