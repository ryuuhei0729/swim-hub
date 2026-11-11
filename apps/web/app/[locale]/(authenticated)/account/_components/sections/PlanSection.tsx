"use client";

import React from "react";
import SubscriptionSettings from "@/components/settings/SubscriptionSettings";

interface PlanSectionProps {
  /** Stripe Checkout から戻ったときの反映エラー */
  checkoutError: string | null;
}

export default function PlanSection({ checkoutError }: PlanSectionProps) {
  return (
    <>
      {checkoutError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {checkoutError}
        </div>
      )}
      <SubscriptionSettings />
    </>
  );
}
