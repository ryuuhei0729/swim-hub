import { useTranslation } from "react-i18next";

import type { SupportedLocale } from "@apps/shared/utils/date";

const DATE_LOCALES: readonly SupportedLocale[] = ["ja", "en", "zh", "ko", "de"];

/**
 * 現在の i18n 言語に対応する date-fns ロケールキーを返す。
 * `formatDate` / `formatDateTime` の locale パラメータに渡す。
 *
 * サポート外言語は en にフォールバック (DEVICE_FALLBACK_LOCALE と同じ方針)。
 */
export function useDateLocale(): SupportedLocale {
  const { i18n } = useTranslation();
  return DATE_LOCALES.includes(i18n.language as SupportedLocale)
    ? (i18n.language as SupportedLocale)
    : "en";
}
