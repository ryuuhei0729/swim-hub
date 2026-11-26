/**
 * フォーカスポイントの追加・再開が上限で止められたら、一覧を取り直す
 * (手元の件数が古い = 別の端末・Web で増えていた。取り直さないとカードの件数が食い違ったままになる)
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FocusPointAPI, FocusPointLimitError } from "../../api/focusPoints";
import {
  useCreateFocusPointMutation,
  useSetFocusPointStatusMutation,
} from "../../hooks/queries/focusPoints";
import { focusPointKeys } from "../../hooks/queries/keys";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

const supabase = {} as SupabaseClient;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("上限エラーのときの一覧の取り直し", () => {
  it("追加が上限で止められたら一覧を取り直す", async () => {
    vi.spyOn(FocusPointAPI.prototype, "createFocusPoint").mockRejectedValue(new FocusPointLimitError());
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateFocusPointMutation(supabase), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: "x" }).catch(() => {});
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: focusPointKeys.all });
  });

  it("再開が上限で止められたら一覧を取り直す", async () => {
    vi.spyOn(FocusPointAPI.prototype, "setStatus").mockRejectedValue(new FocusPointLimitError());
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSetFocusPointStatusMutation(supabase), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "fp-1", status: "active" }).catch(() => {});
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: focusPointKeys.all });
  });

  it("上限以外の失敗 (通信など) では取り直さない", async () => {
    vi.spyOn(FocusPointAPI.prototype, "createFocusPoint").mockRejectedValue(new Error("network"));
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateFocusPointMutation(supabase), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: "x" }).catch(() => {});
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
