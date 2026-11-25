/**
 * AuthProvider: 別のユーザーでログインし直されたときに、ページごと読み直す
 *
 * ページ遷移のキャッシュ (next.config.mjs の staleTimes) に前のユーザーの画面が30秒残る。
 * 別のタブでログアウトして別のユーザーでログインした場合、このタブで router.refresh()
 * (今の画面だけ描画し直す) をしても、他の画面には前のユーザーの描画が残る。
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

type Listener = (event: string, session: Session | null) => Promise<void> | void;

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => Promise<void> | void),
  routerRefresh: vi.fn(),
  reload: vi.fn(),
  // 本物の useRouter と同じく描画をまたいで同じオブジェクトを返す (毎回作ると effect が回り続ける)
  router: null as unknown,
}));

vi.mock("next-intl", () => {
  const t = (k: string) => k;
  return { useLocale: () => "ja", useTranslations: () => t };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: Listener) => {
        mocks.listener = cb as typeof mocks.listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

vi.mock("next/navigation", () => {
  mocks.router = { refresh: mocks.routerRefresh, push: vi.fn(), replace: vi.fn() };
  return { useRouter: () => mocks.router };
});
vi.mock("@/hooks/useSubscription", () => {
  const value = { subscription: null, refreshSubscription: vi.fn() };
  return { useSubscription: () => value };
});
vi.mock("@/providers/QueryProvider", () => {
  const client = { clear: vi.fn() };
  return { getQueryClient: () => client };
});

import { AuthProvider } from "@/contexts/AuthProvider";

function session(userId: string): Session {
  return { user: { id: userId }, access_token: "t" } as unknown as Session;
}

const originalLocation = window.location;

beforeEach(() => {
  mocks.listener = null;
  mocks.routerRefresh.mockClear();
  mocks.reload.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname: "/ja/dashboard", reload: mocks.reload },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

async function emit(event: string, s: Session | null) {
  await act(async () => {
    await mocks.listener?.(event, s);
  });
}

describe("AuthProvider: ログインし直したユーザーが前と違うとき", () => {
  it("別のユーザーでログインし直されたら、ページごと読み直す", async () => {
    render(<AuthProvider>{null}</AuthProvider>);

    await emit("INITIAL_SESSION", session("user-a"));
    await emit("SIGNED_OUT", null);
    await emit("SIGNED_IN", session("user-b"));

    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("同じユーザーのログインし直し (トークン更新・タブ復帰など) は従来どおり router.refresh() だけ", async () => {
    render(<AuthProvider>{null}</AuthProvider>);

    await emit("INITIAL_SESSION", session("user-a"));
    await emit("SIGNED_IN", session("user-a"));

    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("このタブで初めてのログイン (前のユーザーがいない) は従来どおり router.refresh() だけ", async () => {
    render(<AuthProvider>{null}</AuthProvider>);

    await emit("INITIAL_SESSION", null);
    await emit("SIGNED_IN", session("user-a"));

    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("ログイン画面にいるときは読み直さない (ログイン画面自身がページごと遷移する)", async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { pathname: "/login", reload: mocks.reload },
    });
    render(<AuthProvider>{null}</AuthProvider>);

    await emit("INITIAL_SESSION", session("user-a"));
    await emit("SIGNED_IN", session("user-b"));

    expect(mocks.reload).not.toHaveBeenCalled();
  });
});
