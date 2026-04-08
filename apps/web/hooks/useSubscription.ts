"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SubscriptionInfo } from "@swim-hub/shared/types/auth";

const DEFAULT_SUBSCRIPTION: SubscriptionInfo = {
  plan: "free",
  status: null,
  cancelAtPeriodEnd: false,
  premiumExpiresAt: null,
  trialEnd: null,
};

export const subscriptionQueryKey = (userId: string | null) => ["subscription", userId] as const;

async function fetchSubscription(userId: string): Promise<SubscriptionInfo> {
  if (!supabase) return DEFAULT_SUBSCRIPTION;

  try {
    const { data, error } = (await supabase
      .from("user_subscriptions")
      .select("plan, status, cancel_at_period_end, premium_expires_at, trial_end")
      .eq("id", userId)
      .single()) as {
      data: {
        plan: string;
        status: string | null;
        cancel_at_period_end: boolean | null;
        premium_expires_at: string | null;
        trial_end: string | null;
      } | null;
      error: unknown;
    };

    if (error || !data) return DEFAULT_SUBSCRIPTION;

    return {
      plan: data.plan as "free" | "premium",
      status: data.status as SubscriptionInfo["status"],
      cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
      premiumExpiresAt: data.premium_expires_at ?? null,
      trialEnd: data.trial_end ?? null,
    };
  } catch {
    return DEFAULT_SUBSCRIPTION;
  }
}

/**
 * サブスクリプション情報を React Query で管理するフック
 * Server Component からの initialData でハイドレートされるため、
 * 認証済みページでは初回から即座にデータが利用可能
 */
export function useSubscription(userId: string | null): {
  subscription: SubscriptionInfo | null;
  refreshSubscription: () => Promise<void>;
} {
  const queryClient = useQueryClient();

  const { data } = useQuery<SubscriptionInfo>({
    queryKey: subscriptionQueryKey(userId),
    queryFn: () => fetchSubscription(userId!),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const refreshSubscription = async () => {
    if (userId) {
      await queryClient.invalidateQueries({ queryKey: subscriptionQueryKey(userId) });
    }
  };

  return {
    subscription: data ?? null,
    refreshSubscription,
  };
}
