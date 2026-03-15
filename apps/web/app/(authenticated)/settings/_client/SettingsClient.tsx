"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { useUserQuery, userKeys } from "@apps/shared/hooks";
import { useQueryClient } from "@tanstack/react-query";
import GoogleCalendarSyncSettings from "@/components/settings/GoogleCalendarSyncSettings";
import EmailChangeSettings from "@/components/settings/EmailChangeSettings";
import IdentityLinkSettings from "@/components/settings/IdentityLinkSettings";
import AccountDeleteSettings from "@/components/settings/AccountDeleteSettings";
import SubscriptionSettings from "@/components/settings/SubscriptionSettings";

export default function SettingsClient() {
  const router = useRouter();
  const { user, supabase, refreshSubscription } = useAuth();

  // マウント時に subscription を最新化（null からの遅延ロード対策）
  useEffect(() => {
    refreshSubscription();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Checkout 完了後にセッションを検証し、subscription を更新
  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("session_id");
    if (sessionId) {
      // URL から session_id を即座に除去（ブラウザ履歴を汚さない）
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.pathname);

      // Stripe Session を検証して DB を直接更新（Webhook フォールバック）
      const verifySession = async () => {
        try {
          const res = await fetch("/api/stripe/verify-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          if (res.ok) {
            // DB 更新成功 — AuthProvider の subscription を最新化してページをリフレッシュ
            await refreshSubscription();
            router.refresh();
          }
        } catch {
          // 検証失敗してもクラッシュしない — 次回の Webhook で補完される
        }
      };
      verifySession();
    }
  }, [refreshSubscription]); // eslint-disable-line react-hooks/exhaustive-deps
  const queryClient = useQueryClient();
  const { profile } = useUserQuery(supabase, {
    userId: user?.id,
  });

  const handleGoogleCalendarUpdate = () => {
    if (user) {
      queryClient.invalidateQueries({ queryKey: userKeys.profile(user.id) });
      queryClient.invalidateQueries({ queryKey: userKeys.currentProfile() });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href="/mypage"
            className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="マイページに戻る"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">設定</h1>
        </div>
        <p className="text-sm sm:text-base text-gray-600 ml-10">
          アカウントや連携サービスの設定を管理します
        </p>
      </div>

      {/* サブスクリプション管理 */}
      <SubscriptionSettings />

      {/* Googleカレンダー連携設定 */}
      <GoogleCalendarSyncSettings profile={profile} onUpdate={handleGoogleCalendarUpdate} />

      {/* メールアドレス変更 */}
      <EmailChangeSettings />

      {/* ログイン連携 */}
      <IdentityLinkSettings />

      {/* アカウント削除 */}
      <AccountDeleteSettings />
    </div>
  );
}
