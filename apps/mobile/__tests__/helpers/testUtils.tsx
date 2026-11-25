// =============================================================================
// テストヘルパー - モバイルアプリ
// =============================================================================

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";

/**
 * React Queryのテスト用ラッパー
 * 各テストでQueryClientProviderを提供
 */
export const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/**
 * QueryClientProvider で包んで描画する (`render` の差し替え用)。
 * useQuery を使うコンポーネントを、テストごとに空のキャッシュで描画する。
 *   import { renderWithQuery as render } from "@/__tests__/helpers/testUtils";
 */
export function renderWithQuery(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
): RenderResult {
  return render(ui, { wrapper: createQueryWrapper(), ...options });
}

/** QueryClientProvider で包んでフックを描画する (`renderHook` の差し替え用) */
export function renderHookWithQuery<Result, Props>(
  callback: (props: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, "wrapper">,
): RenderHookResult<Result, Props> {
  return renderHook(callback, { wrapper: createQueryWrapper(), ...options });
}
