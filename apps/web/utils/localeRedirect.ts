import { stripLocale } from "@/i18n/routing";
import { getSafeRedirectUrl } from "./redirect";

/**
 * middleware が付与する redirect_to は locale プレフィックス付きの生パス。
 * next-intl の router が再度 prefix を足すため、push 前に locale を剥がす必要がある。
 * 二重 locale (/ja/ja/...) で来ても剥がし切るまで繰り返す。
 * stripLocale を先に掛けてから検証するのは、/ja//evil.com が getSafeRedirectUrl を
 * 素通りして //evil.com になるのを防ぐため (順序を逆にしてはならない)。
 *
 * クエリ/ハッシュは剥がす前に切り離す: stripLocale は純粋な pathname を前提に
 * 「`/ja` と完全一致」か「`/ja/` で始まる」かでしか判定しないため、"/ja?tab=x" や
 * "/ja#top" のように locale セグメントに suffix が直付けされた入力をそのまま渡すと
 * どちらの条件にも当たらず locale が残る (= next-intl が再度 prefix を足して
 * /ja/ja?tab=x となり、修正対象だった404が再発する)。
 * 検証は「剥がした path + 元の suffix」を結合した最終形に対して行い、
 * 上記の順序 (剥がす → 検証) を崩さない。
 */
export function resolveSafeLocalRedirect(raw: string | null): string {
  if (!raw) return getSafeRedirectUrl(null);
  const suffixIndex = raw.search(/[?#]/);
  const suffix = suffixIndex === -1 ? "" : raw.slice(suffixIndex);
  let path = suffixIndex === -1 ? raw : raw.slice(0, suffixIndex);
  for (;;) {
    const next = stripLocale(path);
    if (next === path) break;
    path = next;
  }
  return getSafeRedirectUrl(`${path}${suffix}`);
}
