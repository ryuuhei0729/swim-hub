import { describe, expect, it } from "vitest";
import {
  checkIsPremium,
  canAddSplitTimes,
  canAddPracticeTimes,
  canUploadImage,
} from "../utils/premium";
import { FREE_PLAN_LIMITS } from "../constants/premium";
import type { SubscriptionInfo } from "../types/auth";

// ---------------------------------------------------------------------------
// Helper: SubscriptionInfo ファクトリ
// ---------------------------------------------------------------------------
function makeSubscription(
  overrides: Partial<SubscriptionInfo> = {},
): SubscriptionInfo {
  return {
    plan: "premium",
    status: "active",
    cancelAtPeriodEnd: false,
    premiumExpiresAt: null,
    trialEnd: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// checkIsPremium
// ---------------------------------------------------------------------------
describe("checkIsPremium", () => {
  it("should return false for null subscription", () => {
    expect(checkIsPremium(null)).toBe(false);
  });

  it("should return false when plan is 'free'", () => {
    expect(checkIsPremium(makeSubscription({ plan: "free" }))).toBe(false);
  });

  it("should return false when status is 'canceled'", () => {
    expect(
      checkIsPremium(makeSubscription({ status: "canceled" })),
    ).toBe(false);
  });

  it("should return false when status is 'expired'", () => {
    expect(
      checkIsPremium(makeSubscription({ status: "expired" })),
    ).toBe(false);
  });

  it("should return false when status is 'past_due'", () => {
    expect(
      checkIsPremium(makeSubscription({ status: "past_due" })),
    ).toBe(false);
  });

  it("should return true when plan is 'premium', status is 'active', premiumExpiresAt is null", () => {
    expect(
      checkIsPremium(makeSubscription({ status: "active", premiumExpiresAt: null })),
    ).toBe(true);
  });

  it("should return true when status is 'trialing'", () => {
    expect(
      checkIsPremium(makeSubscription({ status: "trialing" })),
    ).toBe(true);
  });

  it("should return false when premiumExpiresAt is in the past", () => {
    const pastDate = new Date(Date.now() - 86_400_000).toISOString(); // 1 day ago
    expect(
      checkIsPremium(makeSubscription({ premiumExpiresAt: pastDate })),
    ).toBe(false);
  });

  it("should return true when premiumExpiresAt is in the future", () => {
    const futureDate = new Date(Date.now() + 86_400_000).toISOString(); // 1 day ahead
    expect(
      checkIsPremium(makeSubscription({ premiumExpiresAt: futureDate })),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canAddSplitTimes
// ---------------------------------------------------------------------------
describe("canAddSplitTimes", () => {
  const limit = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD; // 3

  it("should allow free user with count=0", () => {
    expect(canAddSplitTimes(0, false)).toBe(true);
  });

  it("should allow free user with count=2 (below limit)", () => {
    expect(canAddSplitTimes(2, false)).toBe(true);
  });

  it("should reject free user with count equal to limit (off-by-one fix)", () => {
    expect(canAddSplitTimes(limit, false)).toBe(false);
  });

  it("should reject free user with count exceeding limit", () => {
    expect(canAddSplitTimes(limit + 1, false)).toBe(false);
  });

  it("should allow premium user regardless of count", () => {
    expect(canAddSplitTimes(100, true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canAddPracticeTimes
// ---------------------------------------------------------------------------
describe("canAddPracticeTimes", () => {
  const limit = FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG; // 18

  it("should allow free user with count below limit", () => {
    expect(canAddPracticeTimes(17, false)).toBe(true);
  });

  it("should reject free user with count equal to limit", () => {
    expect(canAddPracticeTimes(limit, false)).toBe(false);
  });

  it("should reject free user with count exceeding limit", () => {
    expect(canAddPracticeTimes(limit + 1, false)).toBe(false);
  });

  it("should allow premium user regardless of count", () => {
    expect(canAddPracticeTimes(100, true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canUploadImage
// ---------------------------------------------------------------------------
describe("canUploadImage", () => {
  it("should return false for free user", () => {
    expect(canUploadImage(false)).toBe(false);
  });

  it("should return true for premium user", () => {
    expect(canUploadImage(true)).toBe(true);
  });
});
