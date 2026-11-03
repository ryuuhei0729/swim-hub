// @vitest-environment jsdom
// =============================================================================
// usePendingAction.test.ts
// =============================================================================
//
// 低速回線で削除の完了を待つ間に、もう一度押しても二重に実行されないことを確かめる。

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePendingAction } from "../usePendingAction";

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("usePendingAction", () => {
  it("実行中は対象と状態を公開し、終わったら戻す", async () => {
    const { result } = renderHook(() => usePendingAction());
    const d = deferred();

    let running!: Promise<boolean>;
    act(() => {
      running = result.current.run("a", () => d.promise);
    });
    expect(result.current.pendingKey).toBe("a");
    expect(result.current.isPending).toBe(true);
    expect(result.current.isBusy()).toBe(true);

    await act(async () => {
      d.resolve();
      await running;
    });
    expect(result.current.pendingKey).toBeNull();
    expect(result.current.isPending).toBe(false);
    expect(result.current.isBusy()).toBe(false);
  });

  it("実行中に呼ばれた 2 回目は実行せず false を返す (同じ描画内の連打も弾く)", async () => {
    const { result } = renderHook(() => usePendingAction());
    const d = deferred();
    let calls = 0;

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.run("a", () => {
        calls += 1;
        return d.promise;
      });
      second = result.current.run("b", async () => {
        calls += 1;
      });
    });

    await expect(second).resolves.toBe(false);
    await act(async () => {
      d.resolve();
      await first;
    });
    expect(calls).toBe(1);
  });

  it("失敗しても状態を戻し、例外は呼び出し元へ伝える", async () => {
    const { result } = renderHook(() => usePendingAction());

    let error: unknown;
    await act(async () => {
      error = await result.current
        .run("a", async () => {
          throw new Error("boom");
        })
        .catch((e: unknown) => e);
    });

    expect((error as Error).message).toBe("boom");
    expect(result.current.isPending).toBe(false);
    expect(result.current.isBusy()).toBe(false);
  });
});
