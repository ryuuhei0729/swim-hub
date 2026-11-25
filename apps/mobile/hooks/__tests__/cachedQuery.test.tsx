// =============================================================================
// cachedQuery.test.tsx
// =============================================================================
//
// 「前回のデータをすぐ見せて裏で取り直す」ための判定を確かめる。
// 見せてよいのは開き直しただけのときで、保存・削除で無効化されたものは
// 取り直しが済むまで見せない。

import React from "react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  ALWAYS_REVALIDATE,
  getCachedQueryStatus,
  useInvalidateWhenChanged,
  useIsAwaitingFreshData,
} from "../cachedQuery";

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("getCachedQueryStatus", () => {
  it("手元にデータが無く取得中なら読み込み中", () => {
    expect(getCachedQueryStatus({ data: undefined, isFetching: true, isError: false })).toEqual({
      isLoading: true,
      isFailed: false,
    });
  });

  it("手元にデータがあれば、取り直し中でも読み込み中にしない", () => {
    expect(getCachedQueryStatus({ data: [], isFetching: true, isError: false })).toEqual({
      isLoading: false,
      isFailed: false,
    });
  });

  it("手元にデータがあれば、取り直しに失敗しても失敗扱いにしない (前回の内容を見せ続ける)", () => {
    expect(getCachedQueryStatus({ data: [], isFetching: false, isError: true })).toEqual({
      isLoading: false,
      isFailed: false,
    });
  });

  it("手元にデータが無く取得に失敗したら失敗", () => {
    expect(getCachedQueryStatus({ data: undefined, isFetching: false, isError: true })).toEqual({
      isLoading: false,
      isFailed: true,
    });
  });

  it("失敗後の再試行中は、エラー表示ではなく読み込み中に戻す", () => {
    expect(getCachedQueryStatus({ data: undefined, isFetching: true, isError: true })).toEqual({
      isLoading: true,
      isFailed: false,
    });
  });
});

describe("useIsAwaitingFreshData", () => {
  const KEY = ["calendar", "detail", "practice", "p-1"];

  function useDetail(queryFn: () => Promise<string>) {
    const query = useQuery({ queryKey: KEY, queryFn, staleTime: ALWAYS_REVALIDATE });
    const awaitingFresh = useIsAwaitingFreshData(KEY, query.isFetching);
    return { data: query.data, awaitingFresh };
  }

  it("開き直しただけ (無効化されていない) なら、取り直し中でも前回の内容を見せてよい", async () => {
    const queryClient = createClient();
    queryClient.setQueryData(KEY, "前回の内容");

    const { result } = renderHook(() => useDetail(() => new Promise(() => {})), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.data).toBe("前回の内容");
    expect(result.current.awaitingFresh).toBe(false);
  });

  it("保存・削除で無効化されたものは、取り直しが済むまで見せない", async () => {
    const queryClient = createClient();
    queryClient.setQueryData(KEY, "保存前の内容");
    // 保存画面が閉じる前に呼ぶ invalidateQueries({ queryKey: ["calendar"] }) に相当
    await queryClient.invalidateQueries({ queryKey: ["calendar"] });

    let resolveFetch: (value: string) => void = () => {};
    const { result } = renderHook(
      () =>
        useDetail(
          () =>
            new Promise<string>((resolve) => {
              resolveFetch = resolve;
            }),
        ),
      { wrapper: wrapperFor(queryClient) },
    );

    expect(result.current.awaitingFresh).toBe(true);

    await act(async () => {
      resolveFetch("保存後の内容");
    });
    await waitFor(() => expect(result.current.data).toBe("保存後の内容"));
    expect(result.current.awaitingFresh).toBe(false);
  });

  it("無効化されたものの取り直しに失敗したら (圏外など)、手元の内容に戻す", async () => {
    const queryClient = createClient();
    queryClient.setQueryData(KEY, "手元の内容");
    await queryClient.invalidateQueries({ queryKey: ["calendar"] });

    const { result } = renderHook(() => useDetail(() => Promise.reject(new Error("offline"))), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.awaitingFresh).toBe(false));
    expect(result.current.data).toBe("手元の内容");
  });
});

describe("useInvalidateWhenChanged", () => {
  const KEY = ["calendar", "detail", "records", "c-1"];

  it("初回は何もしない (useQuery 自身が取得する)", async () => {
    const queryClient = createClient();
    queryClient.setQueryData(KEY, "内容");

    renderHook(() => useInvalidateWhenChanged([], KEY), { wrapper: wrapperFor(queryClient) });

    expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(false);
  });

  it("値が差し替わったら、そのクエリだけを無効化する", async () => {
    const queryClient = createClient();
    const otherKey = ["calendar", "detail", "records", "c-2"];
    queryClient.setQueryData(KEY, "内容");
    queryClient.setQueryData(otherKey, "別の大会");
    const first: unknown[] = [];

    const { rerender } = renderHook(({ value }) => useInvalidateWhenChanged(value, KEY), {
      wrapper: wrapperFor(queryClient),
      initialProps: { value: first },
    });

    rerender({ value: first });
    expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(false);

    rerender({ value: [] });
    await waitFor(() => expect(queryClient.getQueryState(KEY)?.isInvalidated).toBe(true));
    expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });
});
