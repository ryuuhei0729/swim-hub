"use client";

import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscriptionQueryKey } from "@/hooks/useSubscription";
import type { SubscriptionInfo } from "@swim-hub/shared/types/auth";

interface SubscriptionHydratorProps {
  userId: string;
  subscription: SubscriptionInfo;
  children: React.ReactNode;
}

/**
 * Server Component から渡された subscription データを
 * React Query キャッシュにハイドレートするコンポーネント
 *
 * setQueryData はレンダー中に同期的に実行する（useEffect では遅い）
 * これにより、子コンポーネントの初回レンダーから subscription が利用可能
 * setQueryData は冪等操作のため、Strict Mode の二重レンダーでも安全
 */
export function SubscriptionHydrator({ userId, subscription, children }: SubscriptionHydratorProps) {
  const queryClient = useQueryClient();
  const prevRef = useRef<string | null>(null);

  // userId が変わった場合 or 初回のみキャッシュに設定
  const key = `${userId}:${subscription.plan}:${subscription.status}`;
  if (prevRef.current !== key) {
    queryClient.setQueryData(subscriptionQueryKey(userId), subscription);
    prevRef.current = key;
  }

  return <>{children}</>;
}
