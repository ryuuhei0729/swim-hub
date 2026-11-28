/**
 * SubscriptionSettings
 * - 契約元がアプリ (RevenueCat) のときは Stripe ポータルを開かず、ストアで管理する案内を出す (swimhub-tasks#94)
 * - 日付を表示言語に合わせて書く (swimhub-tasks#95)
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionInfo } from "@swim-hub/shared/types/auth";

const mocks = vi.hoisted(() => ({
  subscription: null as SubscriptionInfo | null,
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ subscription: mocks.subscription, loading: false }),
}));

import SubscriptionSettings from "@/components/settings/SubscriptionSettings";
import ja from "@apps/shared/messages/ja.json";

const activePremium: SubscriptionInfo = {
  plan: "premium",
  status: "active",
  cancelAtPeriodEnd: false,
  premiumExpiresAt: "2026-12-05T12:00:00Z",
  trialEnd: null,
};

beforeEach(() => {
  mocks.subscription = null;
});

describe("SubscriptionSettings: 契約元", () => {
  it("Stripe (Web) で契約中なら「プランを管理」ボタンを出す", () => {
    mocks.subscription = { ...activePremium, provider: "stripe" };
    render(<SubscriptionSettings />);

    expect(screen.getByRole("button", { name: ja.settings.subscription.managePlanButton })).toBeTruthy();
    expect(screen.queryByTestId("subscription-managed-by-store")).toBeNull();
  });

  it("アプリ (App Store / Google Play) で契約中なら、ボタンの代わりにストアで管理する案内を出す", () => {
    mocks.subscription = { ...activePremium, provider: "revenucat" };
    render(<SubscriptionSettings />);

    expect(screen.queryByRole("button", { name: ja.settings.subscription.managePlanButton })).toBeNull();
    expect(screen.getByTestId("subscription-managed-by-store").textContent).toBe(
      ja.settings.subscription.managedByStore,
    );
  });

  it("アプリで契約中で支払いが失敗しているときも、Stripe の支払い方法更新ボタンは出さない", () => {
    mocks.subscription = { ...activePremium, status: "past_due", provider: "revenucat" };
    render(<SubscriptionSettings />);

    expect(screen.queryByText(ja.settings.subscription.pastDueBanner.updatePayment)).toBeNull();
    expect(screen.getByTestId("subscription-managed-by-store")).toBeTruthy();
  });
});

describe("SubscriptionSettings: 日付の書式", () => {
  it("日本語では年月日で書く", () => {
    mocks.subscription = { ...activePremium, provider: "stripe" };
    render(<SubscriptionSettings />);

    expect(screen.getByText(/2026年12月5日/)).toBeTruthy();
  });

  it("英語では英語の書式で書く (日本語の年月日にしない)", () => {
    mocks.subscription = { ...activePremium, provider: "stripe" };
    render(<SubscriptionSettings />, { locale: "en" });

    expect(screen.getByText(/Dec 5, 2026/)).toBeTruthy();
    expect(screen.queryByText(/年/)).toBeNull();
  });
});
