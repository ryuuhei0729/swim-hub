// =============================================================================
// useAuth() の返り値ビルダー (mobile)
// `vi.mock("@/contexts/AuthProvider")` の自動モック (contexts/__mocks__/AuthProvider.tsx) が
// 既定値として使い、テストは差し替えたい項目だけを渡す:
//   vi.mocked(useAuth).mockReturnValue(buildAuthContext({ supabase: fake }));
// =============================================================================

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { vi } from "vitest";
import type { useAuth } from "@/contexts/AuthProvider";

export type MobileAuthContext = ReturnType<typeof useAuth>;

export const TEST_USER_ID = "user-1";

export type AuthContextOverrides = Partial<Omit<MobileAuthContext, "supabase" | "user">> & {
  /** テスト用のフェイクをそのまま渡せるよう型を緩める (本物の SupabaseClient は要求しない) */
  supabase?: unknown;
  user?: Partial<User> | null;
};

export function buildAuthContext(overrides: AuthContextOverrides = {}): MobileAuthContext {
  const user =
    overrides.user === null
      ? null
      : ({ id: TEST_USER_ID, ...overrides.user } as User);
  const { supabase, user: _user, ...rest } = overrides;
  return {
    user,
    session: null,
    loading: false,
    subscription: null,
    onboardingCompleted: true,
    supabase: (supabase ?? {}) as SupabaseClient,
    signIn: vi.fn(async () => ({ data: null, error: null })),
    signUp: vi.fn(async () => ({ data: null, error: null })),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPassword: vi.fn(async () => ({ data: null, error: null })),
    updatePassword: vi.fn(async () => ({ data: null, error: null })),
    updateProfile: vi.fn(async () => ({ error: null })),
    refreshSubscription: vi.fn(async () => undefined),
    updateOnboardingCompleted: vi.fn(async () => ({ error: null })),
    getAccessToken: vi.fn(async () => "test-access-token"),
    isAuthenticated: user !== null,
    ...rest,
  };
}
