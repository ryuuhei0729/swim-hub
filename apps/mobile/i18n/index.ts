// =============================================================================
// i18next 初期化 - モバイルアプリ
// =============================================================================
//
// 注意: Hermes には Intl.PluralRules がないため、intl-pluralrules を
// react-i18next より前に import すること。
//
// ロケール方針: 端末 OS 言語に常時追従する。AsyncStorage への保存や
// ユーザーによる明示的切替 UI は持たない。OS 設定変更時の追従は
// I18nProvider 側で expo-localization の useLocales() を監視して行う。

import "intl-pluralrules";

import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import ja from "@apps/shared/messages/ja.json";
import en from "@apps/shared/messages/en.json";

export const SUPPORTED_LOCALES = ["ja", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// 翻訳キー欠損時の i18next フォールバック (SSOT)。ja.json が最も網羅的なため ja。
export const DEFAULT_LOCALE: SupportedLocale = "ja";

// 端末 OS 言語がサポート外 (ja/en 以外) のときに表示するロケール。
// 国際ユーザーが日本語アプリに迷い込まないよう en を採用。
export const DEVICE_FALLBACK_LOCALE: SupportedLocale = "en";

export const resources = {
  ja: { translation: ja },
  en: { translation: en },
} as const;

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value === "ja" || value === "en";
}

/**
 * 端末の OS ロケール設定から ja/en のいずれかを返す。
 * 取得不能・サポート外言語の場合は DEVICE_FALLBACK_LOCALE (en) を返す。
 */
export function getDeviceLocale(): SupportedLocale {
  try {
    const code = Localization.getLocales()[0]?.languageCode?.toLowerCase();
    return isSupportedLocale(code) ? code : DEVICE_FALLBACK_LOCALE;
  } catch (err) {
    console.error(`[i18n] getDeviceLocale 失敗:`, err);
    return DEVICE_FALLBACK_LOCALE;
  }
}

void i18next.use(initReactI18next).init({
  resources,
  lng: getDeviceLocale(),
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
