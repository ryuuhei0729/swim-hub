// =============================================================================
// ロケール用 Zustand ストア - モバイルアプリ
// =============================================================================

import { create } from "zustand";

import i18n, { DEFAULT_LOCALE, type SupportedLocale } from "@/i18n";
import { persistLocale } from "@/i18n/detector";

interface LocaleState {
  locale: SupportedLocale;
  ready: boolean;
}

interface LocaleActions {
  setLocale: (locale: SupportedLocale) => Promise<void>;
  markReady: (locale: SupportedLocale) => void;
}

export const useLocaleStore = create<LocaleState & LocaleActions>()((set, get) => ({
  locale: DEFAULT_LOCALE,
  ready: false,

  setLocale: async (locale) => {
    if (get().locale === locale) return;
    await i18n.changeLanguage(locale);
    await persistLocale(locale);
    set({ locale });
  },

  markReady: (locale) => {
    set({ locale, ready: true });
  },
}));
