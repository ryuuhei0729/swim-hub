// =============================================================================
// AccountPlanScreen.pastDue.test.tsx
// =============================================================================
//
// 支払い失敗 (past_due) のとき、Free と表示せずアップグレード導線も出さず、
// 支払い方法の更新を案内する (web の SubscriptionSettings と同じ。swimhub-tasks#93)。

import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionInfo } from "@swim-hub/shared/types/auth";

const state = vi.hoisted(() => ({
  subscription: null as SubscriptionInfo | null,
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
}));
vi.mock("@/lib/revenucat", () => ({ restorePurchases: vi.fn() }));
vi.mock("@/providers/ToastProvider", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    subscription: state.subscription,
    refreshSubscription: vi.fn(),
  }),
}));

import { AccountPlanScreen } from "../AccountPlanScreen";

// __mocks__/react-native は testID を DOM の testid 属性に落とすため、属性で探す
const byTestId = (container: HTMLElement, id: string) =>
  container.querySelector(`[testid="${id}"]`);

describe("AccountPlanScreen — 支払い失敗 (past_due)", () => {
  beforeEach(() => {
    state.subscription = null;
  });

  it("past_due では支払い失敗の案内を出し、Free 表示とアップグレード導線を出さない", () => {
    state.subscription = {
      plan: "premium",
      status: "past_due",
      cancelAtPeriodEnd: false,
      premiumExpiresAt: null,
      trialEnd: null,
    };
    const { container } = render(<AccountPlanScreen />);

    expect(byTestId(container, "plan-past-due-banner")).not.toBeNull();
    expect(screen.getByText("お支払いが失敗しました")).toBeTruthy();
    expect(byTestId(container, "plan-update-payment")).not.toBeNull();
    expect(screen.getByText("Premium（支払い未完了）")).toBeTruthy();
    expect(screen.queryByText("Free")).toBeNull();
    expect(byTestId(container, "plan-upgrade")).toBeNull();
  });

  it("Free ではこれまでどおり Free 表示とアップグレード導線を出す", () => {
    const { container } = render(<AccountPlanScreen />);

    expect(byTestId(container, "plan-past-due-banner")).toBeNull();
    expect(screen.getByText("Free")).toBeTruthy();
    expect(byTestId(container, "plan-upgrade")).not.toBeNull();
  });
});
