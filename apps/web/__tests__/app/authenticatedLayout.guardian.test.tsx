// =============================================================================
// (authenticated)/layout.tsx — 保護者アカウントには中身を出さない
// =============================================================================
//
//   [GL-1] 保護者なら、どのページでも children も DashboardLayout も描かず、
//          「アプリでご利用ください」の案内 (GuardianAppOnlyNotice) だけを返す
//   [GL-2] 保護者はオンボーディング未完了でもオンボーディングへ送らない (書き込みになるため)
//   [GL-3] 保護者でなければ今まで通り DashboardLayout の中に children を出す
//   [GL-4] 保護者かどうかの判定に失敗したら、通常の画面を出す (書き込みは DB と API で拒否される)
// =============================================================================

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  profile: { onboarding_completed: true } as { onboarding_completed: boolean } | null,
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-current-path": "/ja/dashboard" }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: vi.fn(async () => ({ id: "user-1" })),
  getServerUserProfile: vi.fn(async () => mocks.profile),
  getServerSubscription: vi.fn(async () => null),
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

vi.mock("@/components/auth/SubscriptionHydrator", () => ({
  SubscriptionHydrator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/auth/GuardianAppOnlyNotice", () => ({
  GuardianAppOnlyNotice: () => <div data-testid="guardian-notice">アプリでご利用ください</div>,
}));

// @/lib/guardian-guard は vitest.setup.ts で「保護者ではない」にモック済み
import { isGuardianUser } from "@/lib/guardian-guard";
import AuthenticatedGroupLayout from "@/app/[locale]/(authenticated)/layout";

async function renderLayout() {
  const element = await AuthenticatedGroupLayout({
    children: <div data-testid="page-content">チームの記録</div>,
    params: Promise.resolve({ locale: "ja" }),
  });
  return render(element);
}

beforeEach(() => {
  mocks.profile = { onboarding_completed: true };
  mocks.redirect.mockClear();
  vi.mocked(isGuardianUser).mockResolvedValue(false);
});

describe("(authenticated)/layout — 保護者アカウント", () => {
  it("[GL-1] 保護者には案内だけを出し、ページの中身も DashboardLayout も描かない", async () => {
    vi.mocked(isGuardianUser).mockResolvedValue(true);

    await renderLayout();

    expect(screen.getByTestId("guardian-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("page-content")).toBeNull();
    expect(screen.queryByTestId("dashboard-layout")).toBeNull();
    expect(isGuardianUser).toHaveBeenCalledWith("user-1");
  });

  it("[GL-2] 保護者はオンボーディング未完了でもオンボーディングへ送らない", async () => {
    vi.mocked(isGuardianUser).mockResolvedValue(true);
    mocks.profile = { onboarding_completed: false };

    await renderLayout();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("guardian-notice")).toBeInTheDocument();
  });

  it("[GL-3] 保護者でなければ DashboardLayout の中にページを出す", async () => {
    await renderLayout();

    expect(screen.getByTestId("dashboard-layout")).toBeInTheDocument();
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
    expect(screen.queryByTestId("guardian-notice")).toBeNull();
  });

  it("[GL-4] 判定に失敗したら通常の画面を出す", async () => {
    vi.mocked(isGuardianUser).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await renderLayout();

    expect(screen.getByTestId("page-content")).toBeInTheDocument();
    expect(screen.queryByTestId("guardian-notice")).toBeNull();
  });

  it("保護者でなく、オンボーディング未完了なら従来どおりオンボーディングへ送る", async () => {
    mocks.profile = { onboarding_completed: false };

    await expect(renderLayout()).rejects.toThrow("REDIRECT:/ja/onboarding");
  });
});
