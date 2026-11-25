import React, { type ReactElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";

/**
 * テスト用の QueryClient。リトライはしない (失敗をすぐ観測できるように)。
 * gcTime は既定のまま (テストの間に破棄されないように) にする。
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/** QueryClientProvider で包むラッパーを作る */
export function createQueryWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/**
 * QueryClientProvider で包んで描画する。queryClient を渡さなければテストごとに新しく作る。
 * rerender でも同じ QueryClient を使い続ける (wrapper として渡すため)。
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options?: RenderOptions & { queryClient?: QueryClient },
) {
  const { queryClient = createTestQueryClient(), ...rest } = options ?? {};
  return {
    queryClient,
    ...render(ui, { wrapper: createQueryWrapper(queryClient), ...rest }),
  };
}
