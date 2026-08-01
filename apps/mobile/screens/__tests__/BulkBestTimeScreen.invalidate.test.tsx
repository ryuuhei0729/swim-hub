// =============================================================================
// BulkBestTimeScreen.invalidate.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (B-2 根本原因):
//   マイページ →「一括入力」(BulkBestTimeScreen) でベストタイムを一括保存した際、
//   保存成功後の invalidate が recordKeys.bestTimes(userId) のみに限定されている。
//   大会タブ (RecordsScreen) が購読する recordKeys.list(...) は recordKeys.lists() 配下
//   にあり、これが invalidate されないため、大会タブの react-query キャッシュは stale
//   なままになる (V-01 の直接原因)。
//
// トートロジー防止メモ: 「invalidateQueries が呼ばれること」ではなく、
// 「recordKeys.lists() 配下のキー (= 大会タブが読む recordKeys.list) が invalidate 対象に
// 含まれること」を実際の QueryClient 経由で検証する。修正前 (bestTimes のみ invalidate) の
// コードではこのテストは FAIL する。
//
// 実装上の注意: モックは vi.hoisted 内で安定参照を用意する (他のスクリーンテストの規約に倣う)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { recordKeys } from "@apps/shared/hooks/queries/keys";

// react-native の静的モックは accessibilityLabel を aria-label に橋渡ししないため、
// このファイル内でのみ TextInput を上書きする (onChangeText -> onChange / accessibilityLabel -> aria-label)。
// 共有モック __mocks__/react-native.ts 自体は変更しない (QA はテストファイルのみ編集可)。
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    TextInput: ({
      onChangeText,
      value,
      accessibilityLabel,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
      accessibilityLabel?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        "aria-label": accessibilityLabel,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

const mocks = vi.hoisted(() => ({
  goBack: vi.fn(),
  createBulkRecords: vi.fn(),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mocks.goBack }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    createBulkRecords = mocks.createBulkRecords;
  },
}));

import { BulkBestTimeScreen } from "../BulkBestTimeScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/** 一括登録フォームに1件分の有効なタイムを入力して保存ボタンを押す共通手順 */
async function enterOneValidTimeAndSave() {
  // デフォルトタブ=fr / デフォルト水路=短水路(0) の先頭カードは 25m
  const timeInput = screen.getByLabelText("25m タイム") as HTMLInputElement;
  fireEvent.change(timeInput, { target: { value: "12.50" } });

  fireEvent.click(screen.getByText("一括登録する"));

  await waitFor(() => {
    expect(mocks.createBulkRecords).toHaveBeenCalledTimes(1);
  });
}

describe("BulkBestTimeScreen — 保存成功後のキャッシュ無効化 (B-2 根本原因)", () => {
  let queryClient: QueryClient;
  let invalidateSpy: MockInstance<QueryClient["invalidateQueries"]>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    mocks.createBulkRecords.mockResolvedValue({ created: 1, errors: [] });
  });

  it(
    "[V-01 前提] 一括登録成功後、大会タブが購読する recordKeys.lists() 配下 " +
      "(recordKeys.list) が invalidate される",
    async () => {
      render(<BulkBestTimeScreen />, { wrapper: createWrapper(queryClient) });
      await enterOneValidTimeAndSave();

      await waitFor(() => {
        const invalidatedListsKey = invalidateSpy.mock.calls.some(([arg]) => {
          const key = (arg as { queryKey?: unknown[] } | undefined)?.queryKey;
          return Array.isArray(key) && JSON.stringify(key) === JSON.stringify(recordKeys.lists());
        });
        expect(invalidatedListsKey).toBe(true);
      });
    },
  );

  it("[非退行] bestTimes キャッシュ (マイページのベストタイム表) も引き続き無効化される", async () => {
    render(<BulkBestTimeScreen />, { wrapper: createWrapper(queryClient) });
    await enterOneValidTimeAndSave();

    await waitFor(() => {
      const invalidatedBestTimes = invalidateSpy.mock.calls.some(([arg]) => {
        const key = (arg as { queryKey?: unknown[] } | undefined)?.queryKey;
        return (
          Array.isArray(key) && JSON.stringify(key) === JSON.stringify(recordKeys.bestTimes("user-1"))
        );
      });
      expect(invalidatedBestTimes).toBe(true);
    });
  });
});
