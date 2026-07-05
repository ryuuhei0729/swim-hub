"use client";

import { CheckIcon, ChevronDownIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { stripLocale } from "@/i18n/routing";

// メニューに表示する言語はネイティブ表記。code は routing.locales と一致させる。
const LOCALES = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
  { code: "zh", label: "简体中文" },
  { code: "ko", label: "한국어" },
  { code: "de", label: "Deutsch" },
] as const;

type Locale = (typeof LOCALES)[number]["code"];

export default function LanguageSwitcher() {
  const currentLocale = useLocale() as Locale;
  const t = useTranslations("common");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 外側クリックで閉じる (Header のユーザーメニューと同じパターン)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, { passive: true });
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (target: Locale) => {
    setIsOpen(false);
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
      className="relative"
      ref={wrapperRef}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setIsOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        data-testid="language-switcher-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls="language-switcher-panel"
        aria-label={t("aria.switchLanguage")}
        className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 rounded transition-colors duration-200 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        <GlobeAltIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
        {t("language")}
        <ChevronDownIcon
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          id="language-switcher-panel"
          aria-label={t("aria.switchLanguage")}
          className="absolute right-0 mt-2 w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 py-1 z-50 focus:outline-none"
        >
          {LOCALES.map(({ code, label }) => {
            const isCurrent = code === currentLocale;
            return (
              <button
                key={code}
                type="button"
                data-testid={`language-switcher-${code}`}
                onClick={() => handleSelect(code)}
                aria-current={isCurrent ? "true" : undefined}
                className={`flex items-center justify-between w-full px-4 py-2 text-sm transition-colors duration-200 hover:bg-gray-100 ${
                  isCurrent ? "font-semibold text-blue-600" : "text-gray-700"
                }`}
              >
                <span>{label}</span>
                {isCurrent && <CheckIcon className="h-4 w-4" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
