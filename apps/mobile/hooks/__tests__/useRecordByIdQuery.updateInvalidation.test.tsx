// =============================================================================
// useRecordByIdQuery.updateInvalidation.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (B-1 の副作用として QA が発見した回帰リスク):
//   RecordFormScreen の編集初期化は record.find(...) (stale な recordKeys.list
//   キャッシュ依存) から useRecordByIdQuery (recordKeys.detail(id) 個別キャッシュ)
//   に置き換えられた。これにより「一括入力直後に大会タブから初回編集する」ケース
//   (V-01/V-02) は解消される一方、useUpdateRecordMutation の onSuccess は
//   recordKeys.lists() のみを invalidate し、recordKeys.detail(id) を
//   invalidate しない (apps/shared/hooks/queries/records.ts, 変更なし=既存の
//   潜在バグ)。recordKeys.detail は recordKeys.lists() 配下ではなく
//   recordKeys.all の直下の兄弟ノードのため、lists() の invalidate では
//   prefix マッチしない。
//
//   → 同一レコードを「編集して保存 → (一覧を経由せず) 再度同じ画面へ戻って編集」
//   すると、useRecordByIdQuery の staleTime (5分) 内は更新前の値が再表示される
//   退行リスクがある (Success Criteria #5 「回帰ゼロ」に抵触しうる)。
//
// トートロジー防止メモ: モックの実装詳細を検証するのではなく、実際の
// 「更新 mutation 実行 → 同じ recordId を再度 useRecordByIdQuery で観測する」
// という利用者の操作シーケンスを real QueryClient 経由で再現し、返る値
// (time) で判定する。

import {
  createMockRecordWithDetails,
  createMockSupabaseClient,
  type MockSupabaseClient,
} from "@/__mocks__/supabase";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { useRecordByIdQuery, useUpdateRecordMutation } from "@apps/shared/hooks/queries/records";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/**
 * "records" テーブルの現在値 (currentTime) を保持し、update() が呼ばれると
 * 書き換わる最小のフェイク supabase クライアントを作る。
 * getUser は認証済みを返す (createMockSupabaseClient のデフォルト挙動)。
 */
function makeMutableRecordClient(state: { time: number }, onMaybeSingle: () => void) {
  const client = createMockSupabaseClient({ userId: "user-1" }) as unknown as MockSupabaseClient;
  client.from = vi.fn(() => {
    const builder: {
      select: (..._a: unknown[]) => typeof builder;
      eq: (..._a: unknown[]) => typeof builder;
      update: (payload: { time?: number }) => typeof builder;
      single: () => Promise<{ data: unknown; error: unknown }>;
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
    } = {
      select: () => builder,
      eq: () => builder,
      update: (payload) => {
        if (typeof payload.time === "number") state.time = payload.time;
        return builder;
      },
      single: () =>
        Promise.resolve({
          data: createMockRecordWithDetails({ id: "record-1", time: state.time }),
          error: null,
        }),
      maybeSingle: () => {
        onMaybeSingle();
        return Promise.resolve({
          data: createMockRecordWithDetails({ id: "record-1", time: state.time }),
          error: null,
        });
      },
    };
    return builder;
  }) as unknown as typeof client.from;
  return client;
}

describe("useRecordByIdQuery × useUpdateRecordMutation — 更新後の detail キャッシュ (回帰観点)", () => {
  it(
    "[回帰観点] 更新成功後、画面を閉じて同じ recordId を再度開くと更新後の値が反映される " +
      "(recordKeys.detail が invalidate されないと編集フォームに古い値が再表示される)",
    async () => {
      const state = { time: 30.5 };
      const maybeSingleSpy = vi.fn();
      const client = makeMutableRecordClient(state, maybeSingleSpy);

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const wrapper = createWrapper(queryClient);

      // 1回目: 編集画面を開いた想定（time=30.5 を取得しキャッシュされる）
      const first = renderHook(() => useRecordByIdQuery(client, "record-1"), { wrapper });
      await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
      expect(first.result.current.data?.time).toBe(30.5);
      expect(maybeSingleSpy).toHaveBeenCalledTimes(1);

      // 画面を閉じる (unmount) → 更新を保存する
      first.unmount();

      const mutation = renderHook(() => useUpdateRecordMutation(client), { wrapper });
      await act(async () => {
        await mutation.result.current.mutateAsync({ id: "record-1", updates: { time: 45.0 } });
      });

      // 2回目: 同じレコードを再度編集フォームで開いた想定
      const second = renderHook(() => useRecordByIdQuery(client, "record-1"), { wrapper });

      await waitFor(() => {
        expect(second.result.current.data?.time).toBe(45.0);
      });
    },
  );
});
