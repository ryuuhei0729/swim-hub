// =============================================================================
// I18nProvider - OS 言語追従の i18n コンテキスト
// =============================================================================
//
// 端末 OS のロケール設定を起動時とランタイムで監視し、SUPPORTED_LOCALES
// (ja/en/zh/ko/de) のいずれかに揃えて i18next の言語を切り替える。明示的な言語選択 UI は持たない。

import React, { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { useLocales } from "expo-localization";

import i18n, { DEVICE_FALLBACK_LOCALE, isSupportedLocale, type SupportedLocale } from "@/i18n";

interface I18nProviderProps {
  children: React.ReactNode;
}

function deriveLocale(osLocales: ReturnType<typeof useLocales>): SupportedLocale {
  const code = osLocales[0]?.languageCode?.toLowerCase();
  return isSupportedLocale(code) ? code : DEVICE_FALLBACK_LOCALE;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const osLocales = useLocales();
  const desired = deriveLocale(osLocales);

  useEffect(() => {
    if (i18n.language !== desired) {
      void i18n.changeLanguage(desired);
    }
  }, [desired]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
