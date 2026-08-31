import { stripLocale } from "@/i18n/routing";
import { getSafeRedirectUrl } from "./redirect";

/**
 * middleware が付与する redirect_to は locale プレフィックス付きの生パス。
 * next-intl の router が再度 prefix を足すため、push 前に locale を剥がす必要がある。
 * 二重 locale (/ja/ja/...) で来ても剥がし切るまで繰り返す。
 * stripLocale を先に掛けてから検証するのは、/ja//evil.com が getSafeRedirectUrl を
 * 素通りして //evil.com になるのを防ぐため (順序を逆にしてはならない)。
 */
export function resolveSafeLocalRedirect(raw: string | null): string {
  if (!raw) return getSafeRedirectUrl(null);
  let path = raw;
  for (;;) {
    const next = stripLocale(path);
    if (next === path) break;
    path = next;
  }
  return getSafeRedirectUrl(path);
}
