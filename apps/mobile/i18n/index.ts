// =============================================================================
// i18next 初期化 - モバイルアプリ
// =============================================================================
//
// 注意: Hermes には Intl.PluralRules がないため、intl-pluralrules を
// react-i18next より前に import すること。

import "intl-pluralrules";

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "@apps/shared/messages/ja.json";
import en from "@apps/shared/messages/en.json";

export const SUPPORTED_LOCALES = ["ja", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "ja";

export const resources = {
  ja: { translation: ja },
  en: { translation: en },
} as const;

void i18next.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  compatibilityJSON: "v4",
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  react: {
    useSuspense: false,
  },
});

export default i18next;

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value === "ja" || value === "en";
}
