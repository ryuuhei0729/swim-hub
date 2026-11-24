"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";

/**
 * ログイン・ログアウトの直後に使う、ページ全体を読み直す遷移。
 *
 * next.config.mjs の staleTimes でページ遷移のキャッシュ (Client Cache) を有効にしている。
 * router.push のようなクライアント内の遷移だと、同じタブで直前に別のユーザーが開いた画面の
 * 描画が30秒以内なら使い回され、前のユーザーのデータが表示されてしまう。
 * router.refresh() は今いる画面のキャッシュしか消さないので、ユーザーが替わる境目では
 * ページを読み直してキャッシュをまるごと捨てる。
 *
 * パスは @/i18n/navigation の router と同じく、ロケールを含まない形 ("/dashboard") で渡す。
 */
export function useFullPageRouter(): {
  push: (path: string) => void;
  replace: (path: string) => void;
} {
  const locale = useLocale();
  return useMemo(
    () => ({
      push: (path: string) => window.location.assign(toLocalizedPath(path, locale)),
      replace: (path: string) => window.location.replace(toLocalizedPath(path, locale)),
    }),
    [locale],
  );
}

/**
 * "/dashboard?x=1" → "/ja/dashboard?x=1"。
 * routing の localePrefix は "always" なので、常にロケールを先頭に付ける。
 * サイト内のパス ("/" 始まり、"//" 始まりでない) 以外は受け付けず、トップへ送る
 * (外部サイトへの遷移に使われないようにするため)。
 */
export function toLocalizedPath(path: string, locale: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return `/${locale}`;
  return `/${locale}${path === "/" ? "" : path}`;
}
