import { useTranslation } from "react-i18next";

import type { SupportedLocale } from "@apps/shared/utils/date";

/**
 * 現在の i18n 言語に対応する date-fns ロケールキーを返す。
 * `formatDate` / `formatDateTime` の locale パラメータに渡す。
 *
 * ja/en 以外は en にフォールバック (DEVICE_FALLBACK_LOCALE と同じ方針)。
 */
export function useDateLocale(): SupportedLocale {
  const { i18n } = useTranslation();
  return i18n.language === "ja" ? "ja" : "en";
}
