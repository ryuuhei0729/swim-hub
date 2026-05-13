// =============================================================================
// ロケール検出・永続化 - モバイルアプリ
// =============================================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";

import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "./index";

export const LOCALE_STORAGE_KEY = "@swim-hub/locale";

/**
 * AsyncStorage に保存された言語設定を読み込む。
 * 失敗・タイムアウト・未保存・不正値の場合は null を返す。
 * lib/supabase.ts の safeStorage と同様、5秒タイムアウトで Supabase SDK の
 * ハング回避と同じ防衛策をとる。
 */
export async function loadStoredLocale(): Promise<SupportedLocale | null> {
  try {
    const result = await Promise.race([
      AsyncStorage.getItem(LOCALE_STORAGE_KEY),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    return isSupportedLocale(result) ? result : null;
  } catch (err) {
    console.error(`[i18n] loadStoredLocale 失敗:`, err);
    return null;
  }
}

/**
 * 端末のロケール設定から ja/en のいずれかを返す。
 * 取得不能・サポート外言語の場合は DEFAULT_LOCALE (ja) にフォールバック。
 */
export function getDeviceLocale(): SupportedLocale {
  try {
    const locales = Localization.getLocales();
    const code = locales[0]?.languageCode?.toLowerCase();
    return isSupportedLocale(code) ? code : DEFAULT_LOCALE;
  } catch (err) {
    console.error(`[i18n] getDeviceLocale 失敗:`, err);
    return DEFAULT_LOCALE;
  }
}

/**
 * 言語設定を AsyncStorage に永続化する。失敗はログ出力のみ。
 */
export async function persistLocale(locale: SupportedLocale): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch (err) {
    console.error(`[i18n] persistLocale("${locale}") 失敗:`, err);
  }
}
