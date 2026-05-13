// =============================================================================
// i18n 起動時初期化 - モバイルアプリ
// =============================================================================

import i18n, { type SupportedLocale } from "./index";
import { getDeviceLocale, loadStoredLocale } from "./detector";

/**
 * アプリ起動時にロケールを確定する。優先順位:
 * 1. AsyncStorage に保存された値 (ユーザーが明示的に切替)
 * 2. 端末ロケール (初回起動時)
 * 3. DEFAULT_LOCALE (ja)
 *
 * 返り値: 確定した locale。I18nProvider は完了するまで loading 表示。
 */
export async function initializeLocale(): Promise<SupportedLocale> {
  const stored = await loadStoredLocale();
  const locale = stored ?? getDeviceLocale();
  if (i18n.language !== locale) {
    await i18n.changeLanguage(locale);
  }
  return locale;
}
