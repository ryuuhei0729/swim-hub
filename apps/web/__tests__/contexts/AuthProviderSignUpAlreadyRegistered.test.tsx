/**
 * AuthProvider.signUp: 登録済みのメールアドレスで新規登録したとき
 *
 * Supabase は Confirm Email 有効時、登録済みメールでも error を返さず identities が空の user を返す
 * (確認メールも送られない)。mobile と同じく「登録済み」のエラーにする (swimhub-tasks#96)。
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextType } from "@swim-hub/shared/types/auth";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  router: null as unknown,
}));

vi.mock("next-intl", () => {
  const t = (k: string) => k;
  return { useLocale: () => "ja", useTranslations: () => t };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signUp: mocks.signUp,
    },
  },
}));

vi.mock("next/navigation", () => {
  mocks.router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };
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

import { AuthProvider, useAuth } from "@/contexts/AuthProvider";

function renderAuth(): { current: AuthContextType | null } {
  const ref: { current: AuthContextType | null } = { current: null };
  function Capture() {
    ref.current = useAuth();
    return null;
  }
  render(
    <AuthProvider>
      <Capture />
    </AuthProvider>,
  );
  return ref;
}

beforeEach(() => {
  mocks.signUp.mockReset();
});

describe("AuthProvider.signUp", () => {
  it("identities が空の user が返ったら、登録済みのエラーを返す (確認メールは送られていない)", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "u1", identities: [] }, session: null },
      error: null,
    });
    const auth = renderAuth();

    let result: Awaited<ReturnType<AuthContextType["signUp"]>> | undefined;
    await act(async () => {
      result = await auth.current!.signUp("existing@example.com", "Test1234!", "名前", 0);
    });

    expect(result?.data).toBeNull();
    expect(result?.error).toMatchObject({ code: "user_already_exists", status: 422 });
    expect(result?.error?.message).toBe("User already registered");
  });

  it("identities がある user (新規登録) は従来どおり成功として返す", async () => {
    const user = { id: "u2", identities: [{ id: "i1" }] };
    mocks.signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    const auth = renderAuth();

    let result: Awaited<ReturnType<AuthContextType["signUp"]>> | undefined;
    await act(async () => {
      result = await auth.current!.signUp("new@example.com", "Test1234!", "名前", 1, "2000-01-02");
    });

    expect(result?.error).toBeNull();
    expect(result?.data?.user).toBe(user);
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: { name: "名前", gender: 1, birthday: "2000-01-02" },
        }),
      }),
    );
  });
});
