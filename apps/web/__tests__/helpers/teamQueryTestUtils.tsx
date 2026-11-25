/**
 * チーム画面の React Query 化に伴うテスト用ヘルパー。
 *
 * `__tests__/utils/render.tsx` の renderWithI18n / renderHookWithI18n と同じ使い方で、
 * next-intl の Provider に加えて **描画ごとに新しい** QueryClient の Provider で包む
 * (テスト間でキャッシュが漏れないように)。既存テストは import 先をこのファイルに
 * 変えるだけでよい。
 */
import {
  render as rtlRender,
  renderHook as rtlRenderHook,
  type RenderOptions,
  type RenderHookOptions,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import enMessages from "@apps/shared/messages/en.json";
import jaMessages from "@apps/shared/messages/ja.json";

export type TestLocale = "ja" | "en";

const MESSAGES: Record<TestLocale, AbstractIntlMessages> = {
  ja: jaMessages as unknown as AbstractIntlMessages,
  en: enMessages as unknown as AbstractIntlMessages,
};

/** テスト用 QueryClient。本番の既定 (retry 3 回) で失敗系のテストが待たされないよう retry しない */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

type QueryOptions = { locale?: TestLocale; queryClient?: QueryClient };

function createWrapper(locale: TestLocale, queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
  };
}

/**
 * next-intl + QueryClient で包んで描画する。`queryClient` を渡すとそれを使い
 * (キャッシュ・invalidate を検証するテスト用)、渡さなければ新しく作る。
 * 戻り値に使った `queryClient` を含める。
 */
export const renderWithI18n = (ui: ReactElement, options?: RenderOptions & QueryOptions) => {
  const { locale = "ja", queryClient = createTestQueryClient(), ...rest } = options ?? {};
  return {
    ...rtlRender(ui, { wrapper: createWrapper(locale, queryClient), ...rest }),
    queryClient,
  };
};

/**
 * QueryClient の Provider だけで包んで描画する (next-intl をモックしているテスト用)。
 * `@testing-library/react` の render の代わりにそのまま使える。
 */
export const renderWithQueryClient = (
  ui: ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient },
) => {
  const { queryClient = createTestQueryClient(), ...rest } = options ?? {};
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { ...rtlRender(ui, { wrapper: Wrapper, ...rest }), queryClient };
};

export const renderHookWithI18n = <Result, Props>(
  hook: (props: Props) => Result,
  options?: RenderHookOptions<Props> & QueryOptions,
) => {
  const { locale = "ja", queryClient = createTestQueryClient(), ...rest } = options ?? {};
  return {
    ...rtlRenderHook(hook, { wrapper: createWrapper(locale, queryClient), ...rest }),
    queryClient,
  };
};

export * from "@testing-library/react";
