"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExclamationTriangleIcon, ArrowPathIcon, HomeIcon } from "@heroicons/react/24/outline";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorProps) {
  const t = useTranslations("common.errorBoundary");
  useEffect(() => {
    // エラーをログに記録
    console.error("Application Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* エラーアイコン */}
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-red-500 rounded-2xl flex items-center justify-center shadow-lg">
            <ExclamationTriangleIcon className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* エラーメッセージ */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{t("title")}</h1>
          <p className="text-gray-600 mb-6 leading-relaxed">
            {t("appDescriptionLine1")}
            <br />
            {t("appDescriptionLine2")}
          </p>

          {/* 開発環境でのエラー詳細 */}
          {process.env.NODE_ENV === "development" && (
            <details className="mt-4 p-4 bg-gray-100 rounded-lg text-left">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                {t("devDetails")}
              </summary>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap overflow-auto">
                {error.message}
                {error.stack && "\n\nStack trace:\n" + error.stack}
              </pre>
            </details>
          )}
        </div>

        {/* アクションボタン */}
        <div className="space-y-4">
          <button onClick={reset} className="btn-primary btn-lg w-full group">
            <ArrowPathIcon className="w-5 h-5 mr-2" />
            {t("retry")}
          </button>

          <Link href="/dashboard" className="btn-outline btn-lg w-full group">
            <HomeIcon className="w-5 h-5 mr-2" />
            {t("backToDashboard")}
          </Link>
        </div>

        {/* サポート情報 */}
        <div className="pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            {t.rich(error.digest ? "supportHintWithCode" : "supportHint", {
              code: error.digest ?? "",
              chip: (chunks) => (
                <span className="font-mono text-xs bg-gray-200 px-2 py-1 rounded mx-1">
                  {chunks}
                </span>
              ),
              link: (chunks) => (
                <Link href="/support" className="text-red-600 hover:text-red-700 font-medium">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
