"use client";

import React, { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { useFullPageRouter } from "@/i18n/fullPageNavigation";

const APP_STORE_URL = "https://apps.apple.com/us/app/swimhub/id6756808731/";

/**
 * 保護者アカウント (team_memberships.role = guardian) が Web にログインしたときに、
 * ログイン後の画面の代わりに出す案内。保護者版の画面はアプリにしか無いので、
 * Web ではチームやメンバーの情報を一切出さず、アプリへの案内とログアウトだけを置く。
 *
 * ログアウトはこのブラウザだけにする (scope: "local")。保護者アカウントは複数の保護者が
 * 同じアカウントで使うため、既定の global だとアプリ側の保護者全員のセッションまで切れる。
 * ログアウト後はページを読み直す (useFullPageRouter) ので、クライアントの状態は残らない。
 */
export function GuardianAppOnlyNotice() {
  const t = useTranslations("auth.guardianAppOnly");
  const { supabase } = useAuth();
  const fullPageRouter = useFullPageRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    setLogoutFailed(false);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.error("ログアウトエラー:", error);
      setIsLoggingOut(false);
      setLogoutFailed(true);
      return;
    }
    fullPageRouter.replace("/login");
  }, [supabase, fullPageRouter]);

  return (
    <main
      className="min-h-screen flex items-center justify-center py-12 px-4 bg-blue-50"
      data-testid="guardian-app-only-notice"
    >
      <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-xl text-center space-y-5">
        <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-600 leading-relaxed">{t("description")}</p>
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t("openAppStore")}
        </a>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t("logout")}
        </button>
        {logoutFailed && (
          <p role="alert" className="text-sm text-red-600">
            {t("logoutFailed")}
          </p>
        )}
      </div>
    </main>
  );
}
