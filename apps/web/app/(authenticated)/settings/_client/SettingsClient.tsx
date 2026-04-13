"use client";

import React, { useEffect, useState } from "react";
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
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.ok) {
            // DB 更新成功 — AuthProvider の subscription を最新化してページをリフレッシュ
            await refreshSubscription();
            router.refresh();
            return;
          }
          // verify-session 失敗 — サーバー側のエラーを記録し、ユーザーに通知
          console.error("verify-session failed:", res.status, data);
          setCheckoutError(
            data.error ||
              "プランの反映に失敗しました。数分待っても反映されない場合はサポートまでお問い合わせください。",
          );
        } catch (err) {
          console.error("verify-session request error:", err);
          setCheckoutError(
            "プランの反映中にエラーが発生しました。数分待っても反映されない場合はサポートまでお問い合わせください。",
          );
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
      <div className="hidden lg:block bg-white rounded-lg shadow p-4 sm:p-6">
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

      {/* Checkout 戻り時のエラー表示 */}
      {checkoutError && (
        <div
          role="alert"
          className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800"
        >
          {checkoutError}
        </div>
      )}

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
