// =============================================================================
// useRecordByIdQuery.test.tsx - 記録1件取得フックのユニットテスト
// =============================================================================
// Sprint Contract (Phase B) に基づき QA が実装。
// Developer のプロダクションコードを参照せず、仕様から導いたアサーションを使用する。
// =============================================================================

import {
  createMockRecordWithDetails,
  createMockCompetition,
  createMockStyle,
  createMockSupabaseClient,
  type MockSupabaseClient,
} from "@/__mocks__/supabase";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRecordByIdQuery } from "@apps/shared/hooks/queries/records";
import type { RecordWithDetails } from "@apps/shared/types";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/**
 * React Query 用ラッパー（リトライなし）
 */
const createWrapper = () => {
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
 * maybeSingle() で 1 件を返すモッククライアントを作成
 */
function makeSingleRecordClient(record: RecordWithDetails | null, error: unknown = null): MockSupabaseClient {
  const client = createMockSupabaseClient({ userId: "test-user-id" });
  // getRecordById は maybeSingle() で結果を取得する
  client.from = vi.fn(() => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: record, error }),
    };
    return builder;
  }) as unknown as typeof client.from;
  return client;
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe("useRecordByIdQuery", () => {
  let mockClient: MockSupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient({ userId: "test-user-id" });
  });

  // ------------------------------------------------------------------
  // 正常系: recordId で 1 件を取得する
  // ------------------------------------------------------------------

  it("該当 recordId で 1 件返る", async () => {
    const mockRecord = createMockRecordWithDetails({
      id: "record-abc",
      time: 60.5,
      style: { ...createMockStyle(), id: 1, name_jp: "自由形", distance: 100 },
      competition: { ...createMockCompetition(), id: "comp-1", title: "テスト大会" },
    });

    const client = makeSingleRecordClient(mockRecord);

    const { result } = renderHook(
      () => useRecordByIdQuery(client, "record-abc"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.id).toBe("record-abc");
    expect(result.current.data?.time).toBe(60.5);
  });

  it("returned data の shape が RecordWithDetails と互換（competition, style, split_times を含む）", async () => {
    const mockRecord = createMockRecordWithDetails({
      id: "record-xyz",
      time: 55.0,
      style: { ...createMockStyle(), id: 2, name_jp: "平泳ぎ", distance: 50 },
      competition: { ...createMockCompetition(), id: "comp-2", title: "春季大会" },
      split_times: [],
    });

    const client = makeSingleRecordClient(mockRecord);

    const { result } = renderHook(
      () => useRecordByIdQuery(client, "record-xyz"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data as RecordWithDetails;
    expect(data.competition).toBeDefined();
    expect(data.style).toBeDefined();
    expect(data.split_times).toBeDefined();
  });

  // ------------------------------------------------------------------
  // 異常系: 存在しない recordId のとき null を返す
  // ------------------------------------------------------------------

  it("recordId が存在しない（maybeSingle で null）のとき null を返す", async () => {
    // maybeSingle が data: null を返す → getRecordById が null を返す
    const client = makeSingleRecordClient(null, null);

    const { result } = renderHook(
      () => useRecordByIdQuery(client, "non-existent-id"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });

  // ------------------------------------------------------------------
  // 認証: 未認証のとき enabled: false と同等（クエリ走らない）
  // ------------------------------------------------------------------

  it("recordId が空文字のとき enabled: false でクエリが走らない", () => {
    // recordId = "" → enabled: !!recordId = false → queryFn が呼ばれない
    const client = createMockSupabaseClient({ userId: "test-user-id" });

    const { result } = renderHook(
      () => useRecordByIdQuery(client, ""),
      { wrapper: createWrapper() },
    );

    // クエリが disabled なので data は undefined、isLoading は false
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    // Supabase の from() が呼ばれていない
    expect(client.from).not.toHaveBeenCalled();
  });

  it("recordId が falsy（undefined として渡された空文字）のとき from() が呼ばれない", () => {
    const client = createMockSupabaseClient({ userId: "test-user-id" });

    // TypeScript 型安全のため "" を渡して enabled=false を検証
    renderHook(
      () => useRecordByIdQuery(client, ""),
      { wrapper: createWrapper() },
    );

    expect(client.from).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // isLoading / isError / refetch の互換性確認
  // ------------------------------------------------------------------

  it("isLoading / isError / refetch が使用可能な shape で返る", async () => {
    const mockRecord = createMockRecordWithDetails({ id: "r-1" });
    const client = makeSingleRecordClient(mockRecord);

    const { result } = renderHook(
      () => useRecordByIdQuery(client, "r-1"),
      { wrapper: createWrapper() },
    );

    // 初期状態の確認
    expect(typeof result.current.isLoading).toBe("boolean");
    expect(typeof result.current.isError).toBe("boolean");
    expect(typeof result.current.refetch).toBe("function");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("Supabase エラー時に isError=true となる", async () => {
    // auth エラー: getUser で user=null を返す → getRecordById が throw
    mockClient.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { result } = renderHook(
      () => useRecordByIdQuery(mockClient, "record-1"),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error?.message).toBe("認証が必要です");
  });
});
