import React, { Suspense } from "react";
import AccountDataLoader from "./_server/AccountDataLoader";
import AccountSkeleton from "./_components/AccountSkeleton";

/**
 * アカウント画面（Server Component）
 * 旧マイページと旧設定画面を 2026-11 に 1 画面へまとめたもの
 */
export default async function AccountPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <AccountDataLoader />
    </Suspense>
  );
}
